import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config, FINANCE_ROLES, type Role } from '../config';
import { DbService } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { paystackStatus, stripeStatus } from './providers';

/**
 * Receipts for each gift and a statement for each year, so givers have a
 * record for their taxes. What a gift is worth to a giver's taxes depends on
 * the legal body that received it, so receipts carry that body's details and
 * say plainly when it is not yet recognised as tax-exempt.
 */

export interface Entity {
  currency: 'usd' | 'ngn';
  legalName: string;
  registrationLabel: string;
  registrationNumber: string;
  address: string;
  taxStatus: 'not_recognised' | 'recognised';
  taxStatement: string;
  religiousBenefits: boolean;
}

interface EntityRow {
  currency: 'usd' | 'ngn';
  legal_name: string;
  registration_label: string;
  registration_number: string;
  address: string;
  tax_status: 'not_recognised' | 'recognised';
  tax_statement: string;
  religious_benefits: boolean;
}

interface GiftRow {
  id: string;
  receipt_no: string;
  provider: string;
  provider_ref: string;
  kind: string;
  currency: 'usd' | 'ngn';
  amount_minor: string;
  refunded_minor: string;
  status: string;
  email: string | null;
  user_id: string | null;
  livemode: boolean;
  received_at: Date;
  full_name: string | null;
}

const PROVIDERS: Record<string, string> = { stripe: 'Stripe', paystack: 'Paystack' };

function toEntity(r: EntityRow): Entity {
  return {
    currency: r.currency,
    legalName: r.legal_name,
    registrationLabel: r.registration_label,
    registrationNumber: r.registration_number,
    address: r.address,
    taxStatus: r.tax_status,
    taxStatement: r.tax_statement,
    religiousBenefits: r.religious_benefits,
  };
}

/** The words every receipt and statement carries about taxes. */
export function taxLines(entity: Entity) {
  const name = entity.legalName || 'Faceless Angels';
  return {
    exchange: entity.religiousBenefits
      ? 'No goods or services were provided in exchange for this gift, other than intangible religious benefits.'
      : 'No goods or services were provided in exchange for this gift.',
    status:
      entity.taxStatus === 'recognised'
        ? entity.taxStatement ||
          `${name} is recognised as a tax-exempt organisation. Keep this receipt for your tax records.`
        : `${name} is not yet recognised as a tax-exempt organisation, so this gift may not be tax-deductible. Ask your tax adviser.`,
  };
}

export function receiptNumber(n: string | number) {
  return `FA-R-${n}`;
}

function money(minor: number, currency: string) {
  return new Intl.NumberFormat(currency === 'ngn' ? 'en-NG' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

// Links in emails must work without sign-in and must not be guessable.
function sign(kind: string, id: string) {
  return createHmac('sha256', `giving-${kind}:${config.storage.encryptionKey}`)
    .update(id)
    .digest('base64url');
}

function signed(kind: string, id: string, token: string | undefined) {
  if (!token) return false;
  const expected = Buffer.from(sign(kind, id));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const GIFT_SQL = `
  select d.id, d.receipt_no, d.provider, d.provider_ref, d.kind, d.currency,
         d.amount_minor, d.refunded_minor, d.status, d.email, d.user_id,
         d.livemode, d.received_at, u.full_name
  from donations d left join users u on u.id = d.user_id`;

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class ReceiptsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(ReceiptsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  // ---- Legal details

  async entities(): Promise<Entity[]> {
    const found = await this.db.query<EntityRow>(
      'select * from giving_entities order by currency desc',
    );
    return found.rows.map(toEntity);
  }

  private async entity(currency: string): Promise<Entity> {
    const found = await this.db.query<EntityRow>(
      'select * from giving_entities where currency = $1',
      [currency],
    );
    if (!found.rows[0]) throw new NotFoundException();
    return toEntity(found.rows[0]);
  }

  async updateEntity(
    user: SessionUser,
    currency: 'usd' | 'ngn',
    input: Omit<Entity, 'currency' | 'registrationLabel'>,
  ) {
    if (input.taxStatus === 'recognised' && !input.legalName.trim()) {
      throw new BadRequestException(
        'Enter the legal name before marking it as recognised.',
      );
    }
    if (input.taxStatus === 'recognised' && !input.registrationNumber.trim()) {
      throw new BadRequestException(
        'Enter the registration or tax ID number before marking it as recognised.',
      );
    }
    await this.db.tx(async (client) => {
      const before = await client.query<{ tax_status: string }>(
        'select tax_status from giving_entities where currency = $1 for update',
        [currency],
      );
      await client.query(
        `update giving_entities
           set legal_name = $2, registration_number = $3, address = $4,
               tax_status = $5, tax_statement = $6, religious_benefits = $7,
               updated_by = $8, updated_at = now()
         where currency = $1`,
        [
          currency,
          input.legalName.trim(),
          input.registrationNumber.trim(),
          input.address.trim(),
          input.taxStatus,
          input.taxStatement.trim(),
          input.religiousBenefits,
          user.id,
        ],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: 'giving.entity.updated',
        objectType: 'giving_entity',
        objectKey: currency,
        priorState: before.rows[0]?.tax_status ?? null,
        newState: input.taxStatus,
      });
    });
  }

  // ---- One gift

  private async gift(id: string): Promise<GiftRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException();
    const found = await this.db.query<GiftRow>(`${GIFT_SQL} where d.id = $1`, [id]);
    if (!found.rows[0]) throw new NotFoundException();
    return found.rows[0];
  }

  receiptUrl(id: string) {
    return `${config.webUrl}/giving/receipts/${id}?t=${sign('receipt', id)}`;
  }

  /** Open to the giver, to staff who look after money, or to a signed link. */
  async receipt(id: string, viewer: SessionUser | undefined, token?: string) {
    const gift = await this.gift(id);
    const own =
      viewer &&
      (gift.user_id === viewer.id ||
        (gift.email && gift.email === viewer.email.toLowerCase()));
    const staff = viewer && FINANCE_ROLES.includes(viewer.role as Role);
    if (!own && !staff && !signed('receipt', id, token)) {
      throw new ForbiddenException('This receipt belongs to someone else.');
    }
    const entity = await this.entity(gift.currency);
    return {
      receiptNumber: receiptNumber(gift.receipt_no),
      receivedAt: gift.received_at,
      giver: { name: gift.full_name, email: gift.email },
      kind: gift.kind,
      currency: gift.currency,
      amount: Number(gift.amount_minor) / 100,
      refunded: Number(gift.refunded_minor) / 100,
      status: gift.status,
      method: `Card, through ${PROVIDERS[gift.provider] ?? gift.provider}`,
      reference: gift.provider_ref,
      testMode: !gift.livemode,
      entity,
      tax: taxLines(entity),
      issuedAt: new Date().toISOString(),
    };
  }

  /** The emailed receipt. Sent once per gift, unless staff send it again. */
  async emailReceipt(id: string, again = false) {
    const gift = await this.gift(id);
    if (!gift.email) return { sent: false, reason: 'No email address on this gift.' };
    const entity = await this.entity(gift.currency);
    const tax = taxLines(entity);
    const amount = money(Number(gift.amount_minor), gift.currency);
    const date = gift.received_at.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const name = entity.legalName || 'Faceless Angels';
    const result = await this.mail.send({
      to: gift.email,
      subject: `Receipt ${receiptNumber(gift.receipt_no)}: your gift of ${amount}`,
      paragraphs: [
        `Thank you. ${name} received your ${gift.kind === 'monthly' ? 'monthly ' : ''}gift of ${amount} on ${date}.`,
        `Receipt number: ${receiptNumber(gift.receipt_no)}. Payment reference: ${gift.provider_ref}.`,
        ...(entity.registrationNumber
          ? [`${entity.registrationLabel}: ${entity.registrationNumber}.`]
          : []),
        tax.exchange,
        tax.status,
        'It supports the running of Faceless Angels: the people and tools that check requests, keep documents safe, and serve the prayer network. It does not go to a specific need.',
        ...(gift.livemode ? [] : ['This was a test payment. No real money moved.']),
        ...(config.giving.receiptNote ? [config.giving.receiptNote] : []),
        `See where the money goes: ${config.webUrl}/transparency`,
      ],
      action: { label: 'View or print your receipt', url: this.receiptUrl(gift.id) },
      idempotencyKey: again ? undefined : `receipt-${gift.id}`,
    });
    if (result.sent) {
      await this.db.query(
        'update donations set receipt_sent_at = now() where id = $1',
        [gift.id],
      );
    }
    return result;
  }

  async resend(user: SessionUser, id: string) {
    const result = await this.emailReceipt(id, true);
    await this.db.tx((client) =>
      this.audit.record(client, {
        actorId: user.id,
        action: 'donation.receipt.resent',
        objectType: 'donation',
        objectId: id,
        newState: result.sent ? 'sent' : 'not sent',
        reason: result.reason ?? null,
      }),
    );
    return result;
  }

  // ---- Yearly statements

  /** The mode a currency's gifts are in now: live once its keys are live. */
  private currencyLive(currency: string) {
    const p = [stripeStatus(), paystackStatus()].find((s) => s.currency === currency);
    return Boolean(p?.ready && p.livemode);
  }

  private async statementFor(
    who: { userId?: string | null; email: string },
    year: number,
    currency: string,
    livemode: boolean | null,
  ) {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new NotFoundException();
    }
    if (currency !== 'usd' && currency !== 'ngn') throw new NotFoundException();
    const found = await this.db.query<GiftRow>(
      `${GIFT_SQL}
       where (d.user_id = $1 or d.email = $2)
         and d.currency = $3
         and d.received_at >= make_date($4, 1, 1)
         and d.received_at < make_date($4 + 1, 1, 1)
         and d.status <> 'disputed'
         and ($5::boolean is null or d.livemode = $5)
       order by d.received_at`,
      [who.userId ?? null, who.email.toLowerCase(), currency, year, livemode],
    );
    const gifts = found.rows.map((g) => ({
      receiptNumber: receiptNumber(g.receipt_no),
      receivedAt: g.received_at,
      kind: g.kind,
      amount: Number(g.amount_minor) / 100,
      refunded: Number(g.refunded_minor) / 100,
      kept: (Number(g.amount_minor) - Number(g.refunded_minor)) / 100,
      testMode: !g.livemode,
    }));
    const entity = await this.entity(currency);
    return {
      year,
      currency,
      giver: {
        name: found.rows.find((g) => g.full_name)?.full_name ?? null,
        email: who.email.toLowerCase(),
      },
      gifts,
      total: Math.round(gifts.reduce((n, g) => n + g.kept, 0) * 100) / 100,
      includesTest: gifts.some((g) => g.testMode),
      entity,
      tax: taxLines(entity),
      issuedAt: new Date().toISOString(),
    };
  }

  /** The years and currencies a signed-in giver has statements for. */
  async myStatements(user: SessionUser) {
    const found = await this.db.query<{ year: number; currency: string; gifts: string }>(
      `select extract(year from received_at)::int as year, currency, count(*) as gifts
       from donations
       where (user_id = $1 or email = $2) and status <> 'disputed'
       group by 1, 2 order by 1 desc, 2 desc`,
      [user.id, user.email.toLowerCase()],
    );
    return found.rows.map((r) => ({
      year: r.year,
      currency: r.currency,
      gifts: Number(r.gifts),
    }));
  }

  async myStatement(user: SessionUser, year: number, currency: string) {
    return this.statementFor({ userId: user.id, email: user.email }, year, currency, null);
  }

  /** A statement opened from its emailed link. */
  async statementByLink(id: string, token: string | undefined) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !signed('statement', id, token)) {
      throw new ForbiddenException('This link is not valid.');
    }
    const found = await this.db.query<{
      email: string;
      year: number;
      currency: string;
      livemode: boolean;
    }>('select email, year, currency, livemode from giving_statements_sent where id = $1', [id]);
    const row = found.rows[0];
    if (!row) throw new NotFoundException();
    return this.statementFor({ email: row.email }, row.year, row.currency, row.livemode);
  }

  /**
   * Emails each giver their statement for a year, once per address and
   * currency. Gifts count in the mode each currency is in now, so test
   * statements are never mixed with real ones.
   */
  async sendStatements(year: number, actor: SessionUser | null, onlyLive = false) {
    let sent = 0;
    let skipped = 0;
    for (const currency of ['usd', 'ngn'] as const) {
      const livemode = this.currencyLive(currency);
      if (onlyLive && !livemode) continue;
      const givers = await this.db.query<{ email: string }>(
        `select distinct email from donations
         where currency = $1 and livemode = $2 and email is not null
           and status = 'succeeded'
           and received_at >= make_date($3, 1, 1)
           and received_at < make_date($3 + 1, 1, 1)`,
        [currency, livemode, year],
      );
      for (const { email } of givers.rows) {
        const claimed = await this.db.query<{ id: string }>(
          `insert into giving_statements_sent (email, year, currency, livemode)
           values ($1, $2, $3, $4) on conflict do nothing returning id`,
          [email, year, currency, livemode],
        );
        const id = claimed.rows[0]?.id;
        if (!id) {
          skipped++;
          continue;
        }
        const statement = await this.statementFor({ email }, year, currency, livemode);
        const name = statement.entity.legalName || 'Faceless Angels';
        const result = await this.mail.send({
          to: email,
          subject: `Your ${year} giving statement from ${name}`,
          paragraphs: [
            `Thank you for giving in ${year}. Your gifts to ${name} came to ${money(Math.round(statement.total * 100), currency)} across ${statement.gifts.length} ${statement.gifts.length === 1 ? 'gift' : 'gifts'}.`,
            'Your statement lists each gift with its receipt number. Keep it with your records for the tax season.',
            statement.tax.exchange,
            statement.tax.status,
            ...(livemode ? [] : ['These were test payments. No real money moved.']),
          ],
          action: {
            label: 'View or print your statement',
            url: `${config.webUrl}/giving/statements/view?s=${id}&t=${sign('statement', id)}`,
          },
          idempotencyKey: `statement-${id}`,
        });
        if (result.sent) {
          sent++;
        } else {
          // A failed delivery is released so the next check tries again. An
          // address that can never receive mail here stays claimed.
          if (result.reason !== 'not_deliverable_here') {
            await this.db.query('delete from giving_statements_sent where id = $1', [id]);
          }
          skipped++;
        }
      }
    }
    if (actor) {
      await this.db.tx((client) =>
        this.audit.record(client, {
          actorId: actor.id,
          action: 'giving.statements.sent',
          objectType: 'giving_statements',
          objectKey: String(year),
          newState: `${sent} sent`,
        }),
      );
    }
    return { sent, skipped };
  }

  // Each January, from the 10th, last year's statements go out for real
  // gifts. Late webhooks and December refunds settle first.
  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.january(), CHECK_EVERY_MS);
    setTimeout(() => void this.january(), 60_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async january() {
    const now = new Date();
    if (now.getUTCMonth() !== 0 || now.getUTCDate() < 10) return;
    try {
      const { sent } = await this.sendStatements(now.getUTCFullYear() - 1, null, true);
      if (sent) this.log.log(`Sent ${sent} yearly giving statements.`);
    } catch (err) {
      this.log.warn(`Yearly statements failed: ${(err as Error).message}`);
    }
  }
}

export function statementLinkToken(id: string) {
  return sign('statement', id);
}
