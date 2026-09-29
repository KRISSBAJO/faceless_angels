import { createHmac, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { config } from '../config';

/**
 * Stripe (US dollars) and Paystack (naira). Both host their own payment
 * pages, so card details never reach this server. Secret keys are sent only
 * to their own APIs and are never logged.
 */

export type Currency = 'usd' | 'ngn';
export type Kind = 'one_time' | 'monthly';

export class ProviderError extends Error {}

const log = new Logger('GivingProviders');
const TIMEOUT_MS = 10_000;

/** Live keys start with sk_live_, test keys with sk_test_, at both companies. */
export function keyMode(key: string): 'live' | 'test' | null {
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return null;
}

export interface ProviderStatus {
  provider: 'stripe' | 'paystack';
  currency: Currency;
  ready: boolean;
  livemode: boolean;
  /** Why it is not ready, for staff. */
  problem: string | null;
}

function status(
  provider: 'stripe' | 'paystack',
  currency: Currency,
  key: string,
  extra: string | null,
): ProviderStatus {
  const mode = key ? keyMode(key) : null;
  let problem: string | null = null;
  if (!key) problem = 'No secret key is set.';
  else if (!mode) problem = 'The secret key is not a Stripe or Paystack secret key.';
  else if (mode === 'live' && !config.giving.live) {
    problem = 'A live key is set, but GIVING_LIVE is not true. Live keys are refused until giving is switched on.';
  } else problem = extra;
  return {
    provider,
    currency,
    ready: problem === null,
    livemode: mode === 'live',
    problem,
  };
}

export function stripeStatus() {
  return status(
    'stripe',
    'usd',
    config.giving.stripe.secretKey,
    config.giving.stripe.webhookSecret ? null : 'No webhook signing secret is set.',
  );
}

export function paystackStatus() {
  return status('paystack', 'ngn', config.giving.paystack.secretKey, null);
}

// ---- Stripe

const STRIPE_VERSION = '2024-06-20';

/** Stripe's form encoding, with nested keys like a[b][c]. */
function form(data: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') {
      parts.push(...form(value as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

async function stripe<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.giving.stripe.apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.giving.stripe.secretKey}`,
        'stripe-version': STRIPE_VERSION,
        'content-type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: body ? form(body).join('&') : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    log.warn(`Could not reach Stripe (${method} ${path}): ${(err as Error).name}`);
    throw new ProviderError('Stripe could not be reached. Try again in a moment.');
  }
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { type?: string; code?: string } })
    | null;
  if (!res.ok || !json) {
    log.warn(
      `Stripe answered ${res.status} for ${method} ${path}` +
        (json?.error?.code ? ` (${json.error.code})` : ''),
    );
    throw new ProviderError('Stripe turned the request down. Try again, or give another way.');
  }
  return json;
}

export async function stripeCheckout(input: {
  checkoutId: string;
  kind: Kind;
  amountMinor: number;
  email: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const recurring = input.kind === 'monthly';
  const session = await stripe<{ id: string; url: string }>(
    'POST',
    '/v1/checkout/sessions',
    {
      mode: recurring ? 'subscription' : 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.email,
      client_reference_id: input.checkoutId,
      payment_method_types: { 0: 'card' },
      ...(recurring ? {} : { submit_type: 'donate' }),
      line_items: {
        0: {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: input.amountMinor,
            product_data: {
              name: recurring
                ? 'Monthly gift to Faceless Angels'
                : 'Gift to Faceless Angels',
            },
            ...(recurring ? { recurring: { interval: 'month' } } : {}),
          },
        },
      },
      metadata: { checkout_id: input.checkoutId },
      ...(recurring
        ? { subscription_data: { metadata: { checkout_id: input.checkoutId } } }
        : { payment_intent_data: { metadata: { checkout_id: input.checkoutId } } }),
    },
    `checkout-${input.checkoutId}`,
  );
  return { sessionId: session.id, url: session.url };
}

/** What Stripe kept as its fee for a payment, or null if it cannot say. */
export async function stripeFee(ref: {
  paymentIntent?: string | null;
  charge?: string | null;
}): Promise<number | null> {
  try {
    if (ref.paymentIntent) {
      const pi = await stripe<{
        latest_charge?: { balance_transaction?: { fee?: number } };
      }>(
        'GET',
        `/v1/payment_intents/${encodeURIComponent(ref.paymentIntent)}?expand[]=latest_charge.balance_transaction`,
      );
      return pi.latest_charge?.balance_transaction?.fee ?? null;
    }
    if (ref.charge) {
      const ch = await stripe<{ balance_transaction?: { fee?: number } }>(
        'GET',
        `/v1/charges/${encodeURIComponent(ref.charge)}?expand[]=balance_transaction`,
      );
      return ch.balance_transaction?.fee ?? null;
    }
  } catch {
    // The gift still counts. The fee is filled in by staff or left unknown.
  }
  return null;
}

export async function stripeCancelSubscription(id: string) {
  await stripe('DELETE', `/v1/subscriptions/${encodeURIComponent(id)}`);
}

/**
 * Checks the Stripe-Signature header: an HMAC-SHA256 of "timestamp.body"
 * with the webhook secret, no older than five minutes.
 */
export function verifyStripeSignature(raw: Buffer, header: string | undefined) {
  const secret = config.giving.stripe.webhookSecret;
  if (!secret || !header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac('sha256', secret)
    .update(`${t}.`)
    .update(raw)
    .digest();
  return signatures.some((sig) => {
    const given = Buffer.from(sig ?? '', 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// ---- Paystack

async function paystack<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.giving.paystack.apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.giving.paystack.secretKey}`,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    log.warn(`Could not reach Paystack (${method} ${path}): ${(err as Error).name}`);
    throw new ProviderError('Paystack could not be reached. Try again in a moment.');
  }
  const json = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;
  if (!res.ok || !json?.status) {
    // Paystack's own reason. It never contains the key.
    log.warn(
      `Paystack answered ${res.status} for ${method} ${path}` +
        (json?.message ? `: ${json.message.slice(0, 200)}` : ''),
    );
    if (/email/i.test(json?.message ?? '')) {
      throw new ProviderError('Paystack did not accept that email address. Check it and try again.');
    }
    throw new ProviderError('Paystack turned the request down. Try again, or give another way.');
  }
  // Some answers, like stopping a subscription, carry no data.
  return json.data as T;
}

function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null || value === '') {
    log.warn(`Paystack's answer had no ${what}`);
    throw new ProviderError('Paystack answered in an unexpected way. Try again in a moment.');
  }
  return value;
}

export async function paystackCreatePlan(amountMinor: number) {
  const plan = await paystack<{ plan_code: string }>('POST', '/plan', {
    name: `Faceless Angels monthly gift ₦${(amountMinor / 100).toLocaleString('en-NG')}`,
    interval: 'monthly',
    amount: amountMinor,
    currency: 'NGN',
  });
  return need(plan?.plan_code, 'plan code');
}

export async function paystackCheckout(input: {
  checkoutId: string;
  amountMinor: number;
  email: string;
  callbackUrl: string;
  planCode?: string;
}) {
  const data = await paystack<{ authorization_url: string; reference: string }>(
    'POST',
    '/transaction/initialize',
    {
      email: input.email,
      amount: input.amountMinor,
      currency: 'NGN',
      reference: input.checkoutId,
      callback_url: input.callbackUrl,
      metadata: { checkout_id: input.checkoutId },
      ...(input.planCode ? { plan: input.planCode } : {}),
    },
  );
  return {
    sessionId: need(data?.reference, 'reference'),
    url: need(data?.authorization_url, 'payment page address'),
  };
}

export interface PaystackCharge {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  fees?: number | null;
  paid_at?: string | null;
  domain?: string;
  customer?: { email?: string };
  metadata?: { checkout_id?: string } | string | null;
  plan?: { plan_code?: string } | string | null;
}

export async function paystackVerify(reference: string) {
  return need(
    await paystack<PaystackCharge>(
      'GET',
      `/transaction/verify/${encodeURIComponent(reference)}`,
    ),
    'transaction',
  );
}

export async function paystackDisableSubscription(code: string, token: string) {
  await paystack('POST', '/subscription/disable', { code, token });
}

/** Checks x-paystack-signature: an HMAC-SHA512 of the body with the secret key. */
export function verifyPaystackSignature(raw: Buffer, header: string | undefined) {
  const secret = config.giving.paystack.secretKey;
  if (!secret || !header) return false;
  const expected = createHmac('sha512', secret).update(raw).digest();
  const given = Buffer.from(header, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
