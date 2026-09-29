// A local stand-in for Stripe and Paystack. docker-compose.test.yml points
// the API at it. It answers the few calls Faceless Angels makes, and records
// them so tests can check what was asked.
import http from "node:http";
import { randomUUID } from "node:crypto";

export const PORT = 47330;

export function startStandIn() {
  const state = {
    calls: [],
    cancelled: new Set(),
    plans: 0,
    paystackCharges: new Map(),
    last(predicate) {
      return [...this.calls].reverse().find(predicate);
    },
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      state.calls.push({ method: req.method, url: req.url, body, auth: req.headers.authorization });
      const send = (status, obj) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      const u = req.url ?? "";
      if (u === "/stripe/v1/checkout/sessions" && req.method === "POST") {
        return send(200, { id: `cs_test_${randomUUID().slice(0, 8)}`, url: "https://checkout.stripe.test/pay/abc" });
      }
      if (u.startsWith("/stripe/v1/payment_intents/")) {
        return send(200, { latest_charge: { balance_transaction: { fee: 103 } } });
      }
      if (u.startsWith("/stripe/v1/charges/")) {
        return send(200, { balance_transaction: { fee: 59 } });
      }
      if (u.startsWith("/stripe/v1/subscriptions/") && req.method === "DELETE") {
        const id = u.split("/").pop();
        state.cancelled.add(id);
        return send(200, { id, status: "canceled" });
      }
      if (u === "/paystack/plan" && req.method === "POST") {
        state.plans++;
        return send(200, { status: true, data: { plan_code: `PLN_test${state.plans}` } });
      }
      if (u === "/paystack/transaction/initialize") {
        const b = JSON.parse(body);
        return send(200, {
          status: true,
          data: { authorization_url: "https://checkout.paystack.test/xyz", access_code: "ac", reference: b.reference },
        });
      }
      if (u.startsWith("/paystack/transaction/verify/")) {
        const ref = decodeURIComponent(u.split("/").pop());
        const charge = state.paystackCharges.get(ref);
        return send(200, {
          status: true,
          data: charge ?? { reference: ref, status: "abandoned", amount: 0, currency: "NGN" },
        });
      }
      if (u === "/paystack/subscription/disable") {
        state.cancelled.add(JSON.parse(body).code);
        return send(200, { status: true, message: "Subscription disabled successfully" });
      }
      send(404, { error: "not in the stand-in" });
    });
  });

  // In CI the API container reaches the host through Docker's bridge, so
  // listen there too. Locally, Docker Desktop reaches 127.0.0.1.
  const host = process.env.CI ? "0.0.0.0" : "127.0.0.1";
  return new Promise((resolve) =>
    server.listen(PORT, host, () => resolve({ state, close: () => server.close() })),
  );
}
