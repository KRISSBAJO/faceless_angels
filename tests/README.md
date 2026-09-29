# End-to-end tests

These drive the real website and API the way a browser, Stripe, and Paystack
would. No real payment is made and no real email is sent.

## Run them

Start the database and API (`docker compose up -d`) and the website
(`npm run dev -- --port 3230`), then:

```bash
node tests/run.mjs
```

The runner:

1. Restarts the API with `docker-compose.test.yml` on top: payments go to a
   local stand-in for Stripe and Paystack (made-up keys), and email is only
   written to the log.
2. Creates any missing test accounts and saves their passwords in
   `.env.test.local`, which git ignores. Test accounts use `@example.test`
   addresses, which can never receive mail.
3. Runs each suite in `tests/suites/`.
4. Restarts the API with your normal settings, even if a suite fails.

## Suites

| Suite | What it covers |
|---|---|
| `web-proxy` | The website passing `/api` to the API: cookies, errors, uploads, pictures, main pages |
| `giving` | Checkout, signed webhooks, monthly gifts, refunds, live events ignored, two-person money records, the public page |
| `receipts` | Legal details, numbered receipts, signed links, yearly statements, who may see each |
| `patvero` | The Patvero client against Patvero's published OpenAPI file (skipped if it cannot be downloaded) |

GitHub runs all of this on every push; see `.github/workflows/ci.yml`.
