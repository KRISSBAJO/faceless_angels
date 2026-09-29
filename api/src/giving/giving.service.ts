import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService, Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import {
  Currency,
  Kind,
  PaystackCharge,
  ProviderError,
  paystackCheckout,
  paystackCreatePlan,
  paystackDisableSubscription,
  paystackStatus,
  paystackVerify,
  stripeCancelSubscription,
  stripeCheckout,
  stripeFee,
  stripeStatus,
  verifyPaystackSignature,
  verifyStripeSignature,
} from './providers';

/** Smallest and largest gift, in the currency's smallest unit. */
const LIMITS: Record<Currency, { min: number; max: number }> = {
  usd: { min: 100, max: 1_000_000 },
  ngn: { min: 50_000, max: 500_000_000 },
};

export const PRESETS: Record<Currency, number[]> = {
  usd: [10, 25, 50, 100],
  ngn: [5_000, 10_000, 25_000, 50_000],
};

export function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat(currency === 'ngn' ? 'en-NG' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

interface CheckoutRow {
  id: string;
  provider: 'stripe' | 'paystack';
  currency: Currency;
  kind: Kind;
  amount_minor: string;
  email: string;
  user_id: string | null;
  status: string;
  livemode: boolean;
}

interface NewDonation {
  provider: 'stripe' | 'paystack';
  providerRef: string;
  kind: Kind;
  currency: string;
  amountMinor: number;
  feeMinor: number | null;
  email: string | null;
  checkoutId: string | null;
  recurringId: string | null;
  livemode: boolean;
  receivedAt: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class GivingService {
  private readonly log = new Logger(GivingService.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  providers() {
    return [stripeStatus(), paystackStatus()];
  }

  /** What the donate page offers. Says nothing about keys. */
  options() {
    return {
      options: this.providers()
        .filter((p) => p.ready)
        .map((p) => ({
          currency: p.currency,
          provider: p.provider,
          testMode: !p.livemode,
          presets: PRESETS[p.currency],
          min: LIMITS[p.currency].min / 100,
          max: LIMITS[p.currency].max / 100,
        })),
    };
  }

  async startCheckout(
    user: SessionUser | null,
    input: { currency: Currency; kind: Kind; amount: number; email: string },
  ) {
    const provider = this.providers().find(
      (p) => p.currency === input.currency && p.ready,
    );
    if (!provider) {
      throw new ServiceUnavailableException(
        'Giving in this currency is not open yet.',
      );
    }
    const amountMinor = Math.round(input.amount * 100);
    const limits = LIMITS[input.currency];
    if (amountMinor < limits.min || amountMinor > limits.max) {
      throw new BadRequestException(
        `Give between ${formatMoney(limits.min, input.currency)} and ${formatMoney(limits.max, input.currency)}.`,
      );
    }
    const email = (user?.email ?? input.email).trim().toLowerCase();

    const created = await this.db.query<{ id: string }>(
      `insert into donation_checkouts
         (provider, currency, kind, amount_minor, email, user_id, livemode)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        provider.provider,
        input.currency,
        input.kind,
        amountMinor,
        email,
        user?.id ?? null,
        provider.livemode,
      ],
    );
    const checkoutId = created.rows[0].id;
    const thanks = `${config.webUrl}/donate/thanks?checkout=${checkoutId}`;

    try {
      const session =
        provider.provider === 'stripe'
          ? await stripeCheckout({
              checkoutId,
              kind: input.kind,
              amountMinor,
              email,
              successUrl: thanks,
              cancelUrl: `${config.webUrl}/donate?cancelled=1`,
            })
          : await paystackCheckout({
              checkoutId,
              amountMinor,
              email,
              callbackUrl: thanks,
              planCode:
                input.kind === 'monthly'
                  ? await this.paystackPlan(amountMinor, provider.livemode)
                  : undefined,
            });
      await this.db.query(
        'update donation_checkouts set provider_session = $2 where id = $1',
        [checkoutId, session.sessionId],
      );
      return { url: session.url };
    } catch (err) {
      await this.db.query(
        `update donation_checkouts set status = 'expired' where id = $1`,
        [checkoutId],
      );
      if (err instanceof ProviderError) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }
  }

  private async paystackPlan(amountMinor: number, livemode: boolean) {
    const found = await this.db.query<{ plan_code: string }>(
      `select plan_code from giving_plans
       where provider = 'paystack' and currency = 'ngn'
         and amount_minor = $1 and livemode = $2`,
      [amountMinor, livemode],
    );
    if (found.rows[0]) return found.rows[0].plan_code;
    const code = await paystackCreatePlan(amountMinor);
    await this.db.query(
      `insert into giving_plans (provider, currency, amount_minor, livemode, plan_code)
       values ('paystack', 'ngn', $1, $2, $3) on conflict do nothing`,
      [amountMinor, livemode, code],
    );
    return code;
  }

  /**
   * The thank-you page asks this. For Paystack it also checks with Paystack
   * directly, so the page is right even before the webhook arrives.
   */
  async checkoutStatus(id: string) {
    if (!UUID.test(id)) throw new NotFoundException();
    const found = await this.db.query<CheckoutRow>(
      'select * from donation_checkouts where id = $1',
      [id],
    );
    const checkout = found.rows[0];
    if (!checkout) throw new NotFoundException();
    let status = checkout.status;
    if (status === 'open' && checkout.provider === 'paystack') {
      try {
        const charge = await paystackVerify(checkout.id);
        if (charge.status === 'success') {
          await this.recordPaystackCharge(charge);
          status = 'paid';
        }
      } catch {
        // Not paid yet, or Paystack is slow. The page asks again.
      }
    }
    return {
      status,
      currency: checkout.currency,
      kind: checkout.kind,
      amount: Number(checkout.amount_minor) / 100,
      testMode: !checkout.livemode,
    };
  }

  // ---- Recording gifts

  /** Records a confirmed gift once. Returns true the first time. */
  private async recordDonation(gift: NewDonation) {
    const inserted = await this.db.tx(async (client) => {
      const checkout = gift.checkoutId
        ? (
            await client.query<CheckoutRow>(
              'select * from donation_checkouts where id = $1',
              [gift.checkoutId],
            )
          ).rows[0]
        : undefined;
      const recurring = gift.recurringId
        ? (
            await client.query<{ user_id: string | null; email: string }>(
              'select user_id, email from recurring_gifts where id = $1',
              [gift.recurringId],
            )
          ).rows[0]
        : undefined;
      const email = (gift.email ?? checkout?.email ?? recurring?.email ?? null)
        ?.trim()
        .toLowerCase() ?? null;
      const userId =
        checkout?.user_id ??
        recurring?.user_id ??
        (email
          ? (
              await client.query<{ id: string }>(
                'select id from users where email = $1',
                [email],
              )
            ).rows[0]?.id
          : null) ??
        null;

      const row = await client.query<{ id: string }>(
        `insert into donations
           (provider, provider_ref, kind, currency, amount_minor, fee_minor,
            email, user_id, checkout_id, recurring_id, livemode, received_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (provider, provider_ref) do nothing
         returning id`,
        [
          gift.provider,
          gift.providerRef,
          gift.kind,
          gift.currency.toLowerCase(),
          gift.amountMinor,
          gift.feeMinor,
          email,
          userId,
          checkout?.id ?? null,
          gift.recurringId,
          gift.livemode,
          gift.receivedAt,
        ],
      );
      if (!row.rows[0]) return null;
      if (checkout) {
        await client.query(
          `update donation_checkouts set status = 'paid' where id = $1`,
          [checkout.id],
        );
      }
      await this.audit.record(client, {
        actorId: null,
        action: 'donation.received',
        objectType: 'donation',
        objectId: row.rows[0].id,
        newState: 'succeeded',
      });
      return { id: row.rows[0].id, email };
    });
    if (inserted?.email) {
      await this.sendReceipt(inserted.id, inserted.email, gift);
    }
    return Boolean(inserted);
  }

  private async sendReceipt(donationId: string, email: string, gift: NewDonation) {
    const amount = formatMoney(gift.amountMinor, gift.currency);
    const date = gift.receivedAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const result = await this.mail.send({
      to: email,
      subject: `Your gift of ${amount} to Faceless Angels`,
      paragraphs: [
        `Thank you. We received your ${gift.kind === 'monthly' ? 'monthly ' : ''}gift of ${amount} on ${date}.`,
        'It supports the running of Faceless Angels: the people and tools that check requests, keep documents safe, and serve the prayer network. It does not go to a specific need.',
        `Reference: ${gift.providerRef}`,
        ...(gift.livemode ? [] : ['This was a test payment. No real money moved.']),
        config.giving.receiptNote,
      ],
      action: { label: 'See where the money goes', url: `${config.webUrl}/transparency` },
      idempotencyKey: `receipt-${donationId}`,
    });
    if (result.sent) {
      await this.db.query(
        'update donations set receipt_sent_at = now() where id = $1',
        [donationId],
      );
    }
  }

  private async markWebhook(provider: string, event: string) {
    await this.db.query(
      `insert into giving_webhooks (provider, last_event, received_at)
       values ($1, $2, now())
       on conflict (provider) do update
         set last_event = excluded.last_event, received_at = excluded.received_at`,
      [provider, event],
    );
  }

  private async upsertRecurring(
    client: Queryable,
    input: {
      provider: 'stripe' | 'paystack';
      ref: string;
      token?: string | null;
      currency: string;
      amountMinor: number;
      email: string;
      checkoutId: string | null;
      livemode: boolean;
    },
  ) {
    const checkout = input.checkoutId
      ? (
          await client.query<CheckoutRow>(
            'select * from donation_checkouts where id = $1',
            [input.checkoutId],
          )
        ).rows[0]
      : undefined;
    const row = await client.query<{ id: string }>(
      `insert into recurring_gifts
         (provider, provider_ref, provider_token, currency, amount_minor, email,
          user_id, checkout_id, livemode)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (provider, provider_ref) do update
         set provider_token = coalesce(excluded.provider_token, recurring_gifts.provider_token)
       returning id`,
      [
        input.provider,
        input.ref,
        input.token ?? null,
        input.currency.toLowerCase(),
        input.amountMinor,
        input.email.toLowerCase(),
        checkout?.user_id ?? null,
        checkout?.id ?? null,
        input.livemode,
      ],
    );
    if (checkout) {
      await client.query(
        `update donation_checkouts set status = 'paid' where id = $1`,
        [checkout.id],
      );
    }
    return row.rows[0].id;
  }

  private async refund(provider: string, refs: string[], refundedMinor: number) {
    const found = await this.db.query<{ id: string; amount_minor: string }>(
      `select id, amount_minor from donations
       where provider = $1 and provider_ref = any($2::text[])`,
      [provider, refs.filter(Boolean)],
    );
    for (const d of found.rows) {
      const full = refundedMinor >= Number(d.amount_minor);
      await this.db.tx(async (client) => {
        await client.query(
          `update donations
             set refunded_minor = least($2, amount_minor),
                 status = case when $3 then 'refunded' else status end
           where id = $1`,
          [d.id, refundedMinor, full],
        );
        await this.audit.record(client, {
          actorId: null,
          action: 'donation.refunded',
          objectType: 'donation',
          objectId: d.id,
          newState: full ? 'refunded' : 'partly refunded',
        });
      });
    }
  }

  // ---- Stripe webhooks

  async stripeWebhook(raw: Buffer | undefined, signature: string | undefined) {
    if (!raw || !verifyStripeSignature(raw, signature)) {
      throw new BadRequestException('Signature check failed.');
    }
    const event = JSON.parse(raw.toString('utf8')) as {
      type: string;
      livemode: boolean;
      data: { object: Record<string, unknown> };
    };
    // A live event is ignored until giving is switched on.
    if (event.livemode && !config.giving.live) return;
    await this.markWebhook('stripe', event.type);
    const obj = event.data.object as Record<string, any>;

    switch (event.type) {
      case 'checkout.session.completed': {
        const checkoutId: string | null =
          obj.client_reference_id ?? obj.metadata?.checkout_id ?? null;
        const email: string | null = obj.customer_details?.email ?? obj.customer_email ?? null;
        if (obj.mode === 'payment' && obj.payment_status === 'paid' && obj.payment_intent) {
          await this.recordDonation({
            provider: 'stripe',
            providerRef: obj.payment_intent,
            kind: 'one_time',
            currency: obj.currency,
            amountMinor: obj.amount_total,
            feeMinor: await stripeFee({ paymentIntent: obj.payment_intent }),
            email,
            checkoutId: checkoutId && UUID.test(checkoutId) ? checkoutId : null,
            recurringId: null,
            livemode: event.livemode,
            receivedAt: new Date((obj.created ?? Date.now() / 1000) * 1000),
          });
        } else if (obj.mode === 'subscription' && obj.subscription && email) {
          await this.db.tx((client) =>
            this.upsertRecurring(client, {
              provider: 'stripe',
              ref: obj.subscription,
              currency: obj.currency,
              amountMinor: obj.amount_total,
              email,
              checkoutId: checkoutId && UUID.test(checkoutId) ? checkoutId : null,
              livemode: event.livemode,
            }),
          );
        }
        return;
      }
      case 'invoice.paid': {
        if (!obj.subscription || !obj.amount_paid) return;
        const checkoutId: string | null =
          obj.subscription_details?.metadata?.checkout_id ?? null;
        const recurringId = await this.db.tx((client) =>
          this.upsertRecurring(client, {
            provider: 'stripe',
            ref: obj.subscription,
            currency: obj.currency,
            amountMinor: obj.amount_paid,
            email: obj.customer_email ?? '',
            checkoutId: checkoutId && UUID.test(checkoutId) ? checkoutId : null,
            livemode: event.livemode,
          }),
        );
        await this.recordDonation({
          provider: 'stripe',
          providerRef: obj.id,
          kind: 'monthly',
          currency: obj.currency,
          amountMinor: obj.amount_paid,
          feeMinor: await stripeFee({ charge: obj.charge }),
          email: obj.customer_email ?? null,
          checkoutId: null,
          recurringId,
          livemode: event.livemode,
          receivedAt: new Date(
            (obj.status_transitions?.paid_at ?? obj.created ?? Date.now() / 1000) * 1000,
          ),
        });
        return;
      }
      case 'charge.refunded':
        await this.refund('stripe', [obj.payment_intent, obj.invoice], obj.amount_refunded);
        return;
      case 'charge.dispute.created':
        await this.db.query(
          `update donations set status = 'disputed'
           where provider = 'stripe' and provider_ref = $1`,
          [obj.payment_intent],
        );
        return;
      case 'customer.subscription.deleted':
        await this.db.query(
          `update recurring_gifts set status = 'cancelled', cancelled_at = now()
           where provider = 'stripe' and provider_ref = $1 and status = 'active'`,
          [obj.id],
        );
        return;
      default:
        return;
    }
  }

  // ---- Paystack webhooks

  async paystackWebhook(raw: Buffer | undefined, signature: string | undefined) {
    if (!raw || !verifyPaystackSignature(raw, signature)) {
      throw new BadRequestException('Signature check failed.');
    }
    const event = JSON.parse(raw.toString('utf8')) as {
      event: string;
      data: Record<string, any>;
    };
    const live = event.data?.domain === 'live';
    if (live && !config.giving.live) return;
    await this.markWebhook('paystack', event.event);
    const data = event.data;

    switch (event.event) {
      case 'charge.success':
        await this.recordPaystackCharge(data as PaystackCharge);
        return;
      case 'subscription.create': {
        const email: string | undefined = data.customer?.email;
        if (!data.subscription_code || !email) return;
        // The checkout that started it: the latest monthly Paystack checkout
        // from this address for this amount.
        const checkout = await this.db.query<{ id: string }>(
          `select id from donation_checkouts
           where provider = 'paystack' and kind = 'monthly'
             and email = $1 and amount_minor = $2
           order by created_at desc limit 1`,
          [email.toLowerCase(), data.amount],
        );
        await this.db.tx((client) =>
          this.upsertRecurring(client, {
            provider: 'paystack',
            ref: data.subscription_code,
            token: data.email_token ?? null,
            currency: 'ngn',
            amountMinor: data.amount,
            email,
            checkoutId: checkout.rows[0]?.id ?? null,
            livemode: live,
          }),
        );
        return;
      }
      case 'subscription.disable':
      case 'subscription.not_renew':
        await this.db.query(
          `update recurring_gifts set status = 'cancelled', cancelled_at = now()
           where provider = 'paystack' and provider_ref = $1 and status = 'active'`,
          [data.subscription_code],
        );
        return;
      case 'refund.processed': {
        const ref: string | undefined =
          data.transaction_reference ?? data.transaction?.reference;
        if (ref) await this.refund('paystack', [ref], Number(data.amount) || 0);
        return;
      }
      default:
        return;
    }
  }

  private async recordPaystackCharge(charge: PaystackCharge) {
    if (charge.status !== 'success') return;
    const metadata =
      typeof charge.metadata === 'string'
        ? (JSON.parse(charge.metadata || '{}') as { checkout_id?: string })
        : charge.metadata;
    const checkoutId = [metadata?.checkout_id, charge.reference].find(
      (v): v is string => Boolean(v && UUID.test(v)),
    ) ?? null;
    const planCode =
      typeof charge.plan === 'object' && charge.plan ? charge.plan.plan_code : undefined;
    const email = charge.customer?.email ?? null;

    // A later month's payment carries a new reference, so it is matched to the
    // monthly gift by address and amount.
    let recurringId: string | null = null;
    if (planCode && email) {
      const found = await this.db.query<{ id: string }>(
        `select id from recurring_gifts
         where provider = 'paystack' and email = $1 and amount_minor = $2
           and status = 'active'
         order by created_at desc limit 1`,
        [email.toLowerCase(), charge.amount],
      );
      recurringId = found.rows[0]?.id ?? null;
    }
    await this.recordDonation({
      provider: 'paystack',
      providerRef: charge.reference,
      kind: planCode ? 'monthly' : 'one_time',
      currency: charge.currency,
      amountMinor: charge.amount,
      feeMinor: typeof charge.fees === 'number' ? charge.fees : null,
      email,
      checkoutId,
      recurringId,
      livemode: charge.domain === 'live',
      receivedAt: charge.paid_at ? new Date(charge.paid_at) : new Date(),
    });
  }

  // ---- A giver's own gifts

  async mine(user: SessionUser) {
    const gifts = await this.db.query<{
      id: string;
      kind: string;
      currency: string;
      amount_minor: string;
      refunded_minor: string;
      status: string;
      livemode: boolean;
      received_at: Date;
    }>(
      `select id, kind, currency, amount_minor, refunded_minor, status, livemode,
              received_at
       from donations
       where user_id = $1 or email = $2
       order by received_at desc limit 100`,
      [user.id, user.email.toLowerCase()],
    );
    const monthly = await this.db.query<{
      id: string;
      currency: string;
      amount_minor: string;
      livemode: boolean;
      created_at: Date;
    }>(
      `select id, currency, amount_minor, livemode, created_at
       from recurring_gifts
       where status = 'active' and (user_id = $1 or email = $2)
       order by created_at desc`,
      [user.id, user.email.toLowerCase()],
    );
    return {
      gifts: gifts.rows.map((g) => ({
        id: g.id,
        kind: g.kind,
        currency: g.currency,
        amount: Number(g.amount_minor) / 100,
        refunded: Number(g.refunded_minor) / 100,
        status: g.status,
        testMode: !g.livemode,
        receivedAt: g.received_at,
      })),
      monthly: monthly.rows.map((m) => ({
        id: m.id,
        currency: m.currency,
        amount: Number(m.amount_minor) / 100,
        testMode: !m.livemode,
        since: m.created_at,
      })),
    };
  }

  async stopMonthly(user: SessionUser, id: string) {
    const found = await this.db.query<{
      id: string;
      provider: string;
      provider_ref: string;
      provider_token: string | null;
      user_id: string | null;
      email: string;
      status: string;
    }>('select * from recurring_gifts where id = $1', [id]);
    const gift = found.rows[0];
    if (!gift || gift.status !== 'active') throw new NotFoundException();
    if (gift.user_id !== user.id && gift.email !== user.email.toLowerCase()) {
      throw new ForbiddenException();
    }
    try {
      if (gift.provider === 'stripe') {
        await stripeCancelSubscription(gift.provider_ref);
      } else {
        if (!gift.provider_token) {
          throw new ProviderError(
            'Paystack has not confirmed this monthly gift yet. Try again in a few minutes.',
          );
        }
        await paystackDisableSubscription(gift.provider_ref, gift.provider_token);
      }
    } catch (err) {
      if (err instanceof ProviderError) {
        throw new ServiceUnavailableException(err.message);
      }
      throw err;
    }
    await this.db.tx(async (client) => {
      await client.query(
        `update recurring_gifts set status = 'cancelled', cancelled_at = now()
         where id = $1`,
        [id],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: 'recurring_gift.stopped',
        objectType: 'recurring_gift',
        objectId: id,
        priorState: 'active',
        newState: 'cancelled',
      });
    });
  }
}
