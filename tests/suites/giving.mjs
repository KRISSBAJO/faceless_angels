// Giving end to end, against the stand-in for Stripe and Paystack: checkout,
// signed webhooks, monthly gifts, refunds, and the two-person money records.
import { createHmac } from "node:crypto";
import { j, png, signIn, SITE, WEB } from "../lib.mjs";

export const name = "Giving and money records";

const STRIPE_WHSEC = "whsec_local_standin";
const PAYSTACK_KEY = "sk_test_local_standin_paystack";
const now = () => Math.floor(Date.now() / 1000);

function stripeSig(payload, t = now(), secret = STRIPE_WHSEC) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}
async function stripeHook(event, sig) {
  const payload = JSON.stringify(event);
  const r = await fetch(`${WEB}/giving/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sig ?? stripeSig(payload) },
    body: payload,
  });
  return r.status;
}
async function paystackHook(event, key = PAYSTACK_KEY) {
  const payload = JSON.stringify(event);
  const r = await fetch(`${WEB}/giving/webhooks/paystack`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": createHmac("sha512", key).update(payload).digest("hex"),
    },
    body: payload,
  });
  return r.status;
}
const post = (path, cookie, body) =>
  fetch(`${WEB}${path}`, { method: "POST", headers: cookie ? { cookie } : {}, body }).then(async (x) => ({
    status: x.status,
    body: await x.json().catch(() => null),
  }));

export default async function run({ check, env, standin }) {
  const tag = Date.now().toString(36);
  const giver = `giver-${tag}@example.test`;

  let r = await j("/giving/options");
  const offered = (r.body?.options ?? []).map((o) => `${o.currency}:${o.testMode ? "test" : "live"}`).join(",");
  check("USD and naira offered, in test mode", offered === "usd:test,ngn:test", offered);
  check("options reveal no key", !JSON.stringify(r.body).includes("sk_"));

  r = await j("/giving/checkout", { method: "POST", body: JSON.stringify({ currency: "usd", kind: "one_time", amount: 0.5, email: giver }) });
  check("too small a dollar gift refused", r.status === 400);
  r = await j("/giving/checkout", { method: "POST", body: JSON.stringify({ currency: "ngn", kind: "one_time", amount: 100, email: giver }) });
  check("too small a naira gift refused", r.status === 400);

  // ---- Stripe, once
  r = await j("/giving/checkout", { method: "POST", body: JSON.stringify({ currency: "usd", kind: "one_time", amount: 25, email: giver }) });
  check("dollar checkout opens Stripe's page", r.status === 201 && r.body?.url?.startsWith("https://checkout.stripe.test"), `${r.status}`);
  const sCall = standin.last((c) => c.url === "/stripe/v1/checkout/sessions");
  const sForm = new URLSearchParams(sCall?.body ?? "");
  const checkoutA = sForm.get("client_reference_id");
  check("Stripe asked for $25.00 once, as a donation", sForm.get("mode") === "payment" && sForm.get("line_items[0][price_data][unit_amount]") === "2500" && sForm.get("submit_type") === "donate");
  check("Stripe got the key as a Bearer token", sCall?.auth === "Bearer sk_test_local_standin");
  r = await j(`/giving/checkouts/${checkoutA}`);
  check("checkout open before the webhook", r.body?.status === "open");

  const pi = `pi_test_${tag}`;
  const completed = {
    id: `evt_${tag}a`, type: "checkout.session.completed", livemode: false,
    data: { object: { id: "cs_x", mode: "payment", payment_status: "paid", payment_intent: pi, client_reference_id: checkoutA, amount_total: 2500, currency: "usd", customer_details: { email: giver }, created: now() } },
  };
  check("forged Stripe signature refused", (await stripeHook(completed, stripeSig(JSON.stringify(completed), now(), "whsec_wrong"))) === 400);
  check("old Stripe signature refused", (await stripeHook(completed, stripeSig(JSON.stringify(completed), now() - 3600))) === 400);
  check("signed Stripe webhook accepted", (await stripeHook(completed)) === 200);
  check("the same webhook again accepted", (await stripeHook(completed)) === 200);
  r = await j(`/giving/checkouts/${checkoutA}`);
  check("checkout now paid", r.body?.status === "paid" && r.body?.amount === 25 && r.body?.testMode === true);

  // ---- Stripe, monthly, by a signed-in member
  const member = await signIn(env.TEST_MEMBER_EMAIL, env.TEST_MEMBER_PASSWORD);
  await j("/giving/checkout", { method: "POST", headers: { cookie: member }, body: JSON.stringify({ currency: "usd", kind: "monthly", amount: 10, email: "ignored@example.test" }) });
  const mForm = new URLSearchParams(standin.last((c) => c.url === "/stripe/v1/checkout/sessions")?.body ?? "");
  const checkoutM = mForm.get("client_reference_id");
  check("monthly Stripe checkout is a subscription", mForm.get("mode") === "subscription" && mForm.get("line_items[0][price_data][recurring][interval]") === "month");
  check("a signed-in giver's own address is used", mForm.get("customer_email") === env.TEST_MEMBER_EMAIL.toLowerCase());
  const sub = `sub_test_${tag}`;
  await stripeHook({ id: `evt_${tag}b`, type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_m", mode: "subscription", payment_status: "paid", subscription: sub, client_reference_id: checkoutM, amount_total: 1000, currency: "usd", customer_details: { email: env.TEST_MEMBER_EMAIL } } } });
  for (const n of [1, 2]) {
    await stripeHook({ id: `evt_${tag}i${n}`, type: "invoice.paid", livemode: false, data: { object: { id: `in_test_${tag}_${n}`, subscription: sub, amount_paid: 1000, currency: "usd", charge: `ch_${n}`, customer_email: env.TEST_MEMBER_EMAIL, status_transitions: { paid_at: now() }, subscription_details: { metadata: { checkout_id: checkoutM } } } } });
  }
  r = await j("/giving/mine", { headers: { cookie: member } });
  check("member sees two monthly payments", (r.body?.gifts ?? []).filter((g) => g.kind === "monthly" && g.amount === 10).length >= 2);
  const monthly = r.body?.monthly?.find((m) => m.amount === 10 && m.currency === "usd");
  check("member sees an active monthly gift", Boolean(monthly));

  const editor = await signIn(env.TEST_EDITOR_EMAIL, env.TEST_EDITOR_PASSWORD);
  r = await j(`/giving/monthly/${monthly?.id}/stop`, { method: "POST", headers: { cookie: editor } });
  check("another person cannot stop it", r.status === 403);
  r = await j(`/giving/monthly/${monthly?.id}/stop`, { method: "POST", headers: { cookie: member } });
  check("the giver stops their monthly gift", r.status === 204 && standin.cancelled.has(sub));

  check("refund webhook accepted", (await stripeHook({ id: `evt_${tag}r`, type: "charge.refunded", livemode: false, data: { object: { id: "ch_r", payment_intent: pi, amount_refunded: 2500, amount: 2500 } } })) === 200);
  check("a live Stripe event is ignored in test mode", (await stripeHook({ id: `evt_${tag}live`, type: "checkout.session.completed", livemode: true, data: { object: { mode: "payment", payment_status: "paid", payment_intent: `pi_live_${tag}`, amount_total: 99900, currency: "usd", customer_details: { email: giver }, created: now() } } })) === 200);

  // ---- Paystack, once, confirmed by the thank-you page before the webhook
  r = await j("/giving/checkout", { method: "POST", body: JSON.stringify({ currency: "ngn", kind: "one_time", amount: 10000, email: giver }) });
  const init = JSON.parse(standin.last((c) => c.url === "/paystack/transaction/initialize")?.body ?? "{}");
  check("naira checkout opens Paystack's page", r.status === 201 && r.body?.url?.startsWith("https://checkout.paystack.test"));
  check("Paystack asked for ₦10,000 in kobo with our reference", init.amount === 1000000 && init.currency === "NGN" && init.reference === init.metadata?.checkout_id);
  standin.paystackCharges.set(init.reference, { reference: init.reference, status: "success", amount: 1000000, currency: "NGN", fees: 16000, paid_at: new Date().toISOString(), domain: "test", customer: { email: giver }, metadata: { checkout_id: init.reference }, plan: {} });
  r = await j(`/giving/checkouts/${init.reference}`);
  check("thank-you page confirms with Paystack directly", r.body?.status === "paid" && r.body?.amount === 10000);
  const charge = { event: "charge.success", data: standin.paystackCharges.get(init.reference) };
  check("forged Paystack signature refused", (await paystackHook(charge, "sk_test_wrong")) === 400);
  check("signed Paystack webhook accepted", (await paystackHook(charge)) === 200);

  // ---- Paystack, monthly
  const plansBefore = standin.plans;
  for (let n = 0; n < 2; n++) {
    await j("/giving/checkout", { method: "POST", body: JSON.stringify({ currency: "ngn", kind: "monthly", amount: 5000, email: giver }) });
  }
  check("one Paystack plan per amount, reused", standin.plans - plansBefore <= 1);
  const mInit = JSON.parse(standin.last((c) => c.url === "/paystack/transaction/initialize")?.body ?? "{}");
  check("monthly Paystack checkout carries the plan", typeof mInit.plan === "string" && mInit.plan.startsWith("PLN_test"));
  await paystackHook({ event: "subscription.create", data: { subscription_code: `SUB_${tag}`, email_token: "tok123", amount: 500000, customer: { email: giver }, plan: { plan_code: mInit.plan } } });
  for (const ref of [mInit.reference, `renewal_${tag}`]) {
    await paystackHook({ event: "charge.success", data: { reference: ref, status: "success", amount: 500000, currency: "NGN", fees: 8500, paid_at: new Date().toISOString(), domain: "test", customer: { email: giver }, metadata: ref === mInit.reference ? { checkout_id: ref } : null, plan: { plan_code: mInit.plan } } });
  }
  check("a live Paystack event is ignored in test mode", (await paystackHook({ event: "charge.success", data: { reference: `live_${tag}`, status: "success", amount: 9900000, currency: "NGN", domain: "live", customer: { email: giver }, plan: {} } })) === 200);

  // ---- Money records: two people
  const admin = await signIn(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD);
  const treasurer = await signIn(env.TEST_TREASURER_EMAIL, env.TEST_TREASURER_PASSWORD);
  r = await j("/finance/overview", { headers: { cookie: member } });
  check("a member cannot see the money records", r.status === 403);
  r = await j("/finance/overview", { headers: { cookie: admin } });
  const gifts = (r.body?.gifts ?? []).filter((g) => g.email === giver);
  check("Stripe fee recorded ($1.03)", gifts.some((g) => g.currency === "usd" && g.fee === 1.03));
  check("refunded gift shows as refunded", gifts.some((g) => g.currency === "usd" && g.status === "refunded"));
  check("no live gift recorded", !(r.body?.gifts ?? []).some((g) => g.testMode === false));
  check("one gift for the once-off despite two webhooks", gifts.filter((g) => g.currency === "usd").length === 1);
  check("naira: once-off plus two monthly", gifts.filter((g) => g.currency === "ngn").length === 3);
  check("both companies heard from", r.body?.providers?.every((p) => p.lastWebhook));

  const form = (fields, withFile = true) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    if (withFile) f.set("receipt", new Blob([png()], { type: "image/png" }), "receipt.png");
    return f;
  };
  const today = new Date().toISOString().slice(0, 10);
  const cost = { kind: "expense", category: "hosting", description: `Hosting ${tag}`, payee: "Render", currency: "usd", amount: "19.00", paidOn: today };
  r = await post("/finance/entries", admin, form(cost, false));
  check("a cost without a receipt is refused", r.status === 400);
  r = await post("/finance/entries", member, form(cost));
  check("a member cannot record costs", r.status === 403);
  r = await post("/finance/entries", admin, form(cost));
  const costId = r.body?.id;
  check("admin records a cost with its receipt", r.status === 201 && costId);
  r = await j(`/finance/entries/${costId}/decision`, { method: "POST", headers: { cookie: admin }, body: JSON.stringify({ outcome: "approved" }) });
  check("whoever recorded it cannot approve it", r.status === 403);
  r = await j(`/finance/entries/${costId}/decision`, { method: "POST", headers: { cookie: treasurer }, body: JSON.stringify({ outcome: "rejected" }) });
  check("rejecting needs a reason", r.status === 400);
  r = await j(`/finance/entries/${costId}/decision`, { method: "POST", headers: { cookie: treasurer }, body: JSON.stringify({ outcome: "approved" }) });
  check("a second person approves it", r.status === 204);
  r = await j(`/finance/entries/${costId}/decision`, { method: "POST", headers: { cookie: treasurer }, body: JSON.stringify({ outcome: "approved" }) });
  check("it cannot be decided twice", r.status === 409);
  const rec = await fetch(`${WEB}/finance/entries/${costId}/receipt`, { headers: { cookie: admin } });
  check("receipt opens for staff, unchanged", rec.ok && Buffer.from(await rec.arrayBuffer()).equals(png()));
  check("receipt closed to a member", (await fetch(`${WEB}/finance/entries/${costId}/receipt`, { headers: { cookie: member } })).status === 403);

  const help = { kind: "help", category: "utilities", description: `Electricity bill ${tag}`, payee: "Nashville Electric Service", currency: "usd", amount: "60", paidOn: today };
  r = await post("/finance/entries", treasurer, form({ ...help, caseRef: "FA-0000000" }));
  check("help with an unknown request reference refused", r.status === 400);
  r = await post("/finance/entries", treasurer, form(help));
  const helpId = r.body?.id;
  check("treasurer records help paid", r.status === 201);
  const before = (await j("/transparency")).body?.currencies?.find((c) => c.currency === "usd")?.helped ?? 0;
  r = await j(`/finance/entries/${helpId}/decision`, { method: "POST", headers: { cookie: admin }, body: JSON.stringify({ outcome: "approved" }) });
  check("admin approves the treasurer's entry", r.status === 204);

  // ---- The public page
  r = await j("/transparency");
  const usd = r.body?.currencies?.find((c) => c.currency === "usd");
  const ngn = r.body?.currencies?.find((c) => c.currency === "ngn");
  check("help counts publicly only once approved", Math.abs(usd?.helped - before - 60) < 0.001, `${before} -> ${usd?.helped}`);
  check("public shows hosting costs", usd?.expenses?.some((e) => e.category === "hosting"));
  check("public naira total counts this run", ngn?.received >= 20000);
  check("public page carries no email address", !JSON.stringify(r.body).includes("@"));
  check("public page marked test mode", usd?.testMode === true && ngn?.testMode === true);
  check("twelve months shown", usd?.months?.length === 12);
  const html = await fetch(`${SITE}/transparency`).then((x) => x.text());
  check("transparency page renders", html.includes("Where the money goes"));
}
