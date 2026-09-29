# Faceless Angels

Help quietly. Love openly.

A Christian community that connects people with documented needs to people
willing to help, without seeking recognition. The helper stays hidden from the
person they help. Nobody is hidden from the platform.

## What is here

| Part | Tech | Port |
|---|---|---|
| Web app | Next.js, Tailwind | 3230 |
| API | NestJS | 4010 |
| Database | Postgres 17 | 5442 |

The API and database run in Docker. The web app runs with the Next.js dev
server.

## Run it

1. Copy `.env.example` to `.env` and fill it in. The file explains each value.
2. Start the database and API:

   ```bash
   docker compose up -d --build
   ```

3. Start the web app:

   ```bash
   npm install
   npm run dev -- --port 3230
   ```

4. Open http://localhost:3230.

Database changes are plain SQL files in `api/migrations`. The API applies new
ones when it starts.

To check everything still works end to end, run `node tests/run.mjs` with the
site running. It uses stand-ins for Stripe and Paystack and never sends real
email. GitHub runs the same checks on every push. See `tests/README.md`.

If calls from the API container to Patvero or RelyKit fail with "unable to
verify the first certificate", antivirus on the computer (Norton, for one) is
re-signing secure connections. Export its root certificate to
`.certs/local-root.pem` and trust it in a `docker-compose.override.yml` with
`NODE_EXTRA_CA_CERTS`. Both are git-ignored and only matter on that computer.

## The first administrator

Set `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` in `.env`. The API creates
that account at startup while no administrator exists. The account must choose
a new password at first sign-in.

Staff cannot sign themselves up. An administrator invites them from
**Admin → Invitations**.

## Going online

### Vercel website + Render API + Renviq database

Use `render-vercel.yaml` for this setup. It creates only the API on Render;
the existing `render.yaml` is for hosting all three parts on Render.

1. In Renviq, create a **separate Faceless Angels PostgreSQL database**. Do
   not use a LogaDash database. Copy its connection URL from Renviq's
   credentials screen; keep it secret. The API applies its SQL migrations on
   first start, so a new database starts with the schema it needs. If you want
   existing local records online, migrate them before pointing the live API at
   the database.
2. In Render, create a Blueprint from this repository and select
   `render-vercel.yaml`. Set `DATABASE_URL` to that Renviq URL. Fill in the
   other prompted values. In particular, production requires a separate S3
   bucket and credentials for encrypted documents. Keep `GIVING_LIVE=false`
   and use payment test keys. The Blueprint creates a public HTTPS API in
   Render's Ohio region, near Renviq's Chicago region. The Blueprint requests
   Render's free web service plan, which sleeps after 15 minutes idle and
   takes about a minute to wake. Check
   `https://<render-api-host>/api/health` after it deploys.
3. In Vercel, import this repository as a Next.js project with the repository
   root as its root directory. Set `API_URL` to the Render API's **public
   HTTPS origin** (no `/api` suffix), `WEB_URL` to the final Vercel or custom
   domain URL, and `CONTACT_EMAIL` to the address shown on the site. Enable
   Vercel's system environment variables so `VERCEL=1` is available at build
   time. Deploy and check `/healthz`, `/api/health`, and a sign-in on the
   Vercel domain.
4. Set `WEB_URL` on the Render API to the same final Vercel URL and redeploy
   the API. Configure Stripe and Paystack webhook URLs under that website
   domain when you are ready to test giving. Save Render's generated
   `EVIDENCE_ENCRYPTION_KEY` outside Render; losing it makes stored documents
   unreadable.

On Vercel, Next.js uses an external rewrite for `/api/*`, keeping API calls
and session cookies on the website's address. This also sends document and
Word uploads directly through Vercel's proxy. The local and all-Render setups
continue using the Next.js route handler. Vercel Functions have a 4.5 MB
request limit, which is too small for this app's 8 MB documents and 20 MB Word
imports.

The Renviq database URL and all API secrets belong on Render only. Vercel
needs only `API_URL`, `WEB_URL`, and `CONTACT_EMAIL` for this setup. Never put
the database URL or payment keys in a `NEXT_PUBLIC_` variable.

### All on Render

`render.yaml` describes the whole site for [Render](https://render.com):

| Part | Render type | Who can reach it |
|---|---|---|
| Website (`Dockerfile`) | Web service | Everyone |
| API (`api/Dockerfile`) | Private service | Only the website |
| Database | Postgres | Only the API |

The website passes `/api` calls to the API over Render's private network
(`src/app/api/[...path]/route.ts`), so the API never faces the internet.

1. In Render, choose **New → Blueprint** and pick this repository.
2. Fill in the values it asks for:
   - `WEB_URL`, on both the website and the API: the public address, such as
     `https://faceless-web.onrender.com`. Change it when the real domain is ready.
   - `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Use a
     separate bucket from the one used on this computer.
   - `MAIL_FROM` and `RELYKIT_API_KEY`.
   - `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` for the first administrator.
   - `PATVERO_API_KEY`, optional: a read-only key made for Faceless Angels
     alone in Patvero (Workspace → Developer API, scopes `workspace.read`
     and `meetings.read`). It stays on the API server. **Admin →
     Connections** shows whether it works. Patvero keys expire, 90 days by
     default, so make a new one before then.
3. Once it is running, open the API's **Environment** page and copy
   `EVIDENCE_ENCRYPTION_KEY` somewhere safe. Render made it. Without it, the
   stored bills and IDs cannot be read.
4. To use your own domain, add it under the website's **Custom Domains**, set
   `WEB_URL` on both services to it, and deploy both again.

Costs: the private API and the database need paid plans. A free database is
deleted after 30 days and has no backups, so the blueprint does not use one.
The website can run on the free plan, but it sleeps when idle and then takes
about a minute to wake.

In production the API refuses to start without `WEB_URL` or an S3 bucket,
because emails would link to the wrong place and documents would be lost on
the next deploy.

Rate limits count each visitor by the first address in `X-Forwarded-For`. If
Render names a header visitors cannot forge, put its name in
`CLIENT_IP_HEADER` on the website.

## What is built

- Ask for help, as a full request or a short one for small needs
- Email confirmation and a private ID check
- Reviewer workspace: checks, questions, decisions, and appeals
- A list of approved needs with no names, and pledges from Angels
- Prayer: requests with four audiences, a network wall, and answered prayers
- Prayer groups with their own admins and moderators, and a code of conduct
- Reports of abuse about a request, a reply, a member, or a group
- Site moderation of groups: approve, suspend, open again, or close
- Live prayer sessions on Patvero, Zoom, or Teams, or in person
- Prayer campaigns over a set number of days, and prayer chains taken in turns
- A prayer team inbox and a moderation queue
- The Journal: articles, series, search, comments, saved articles, and
  private notes, with email when a followed category has something new
- The Studio: a writing editor with review by a second person, scheduling,
  versions, corrections, and numbers for each article
- Word import: a .docx file becomes a draft in the editor, with its headings,
  lists, quotes, tables, and pictures, for the writer to check before saving
- Scripture lookup: type a reference and the exact words are filled in from
  the King James Version or the World English Bible, both public domain and
  held in `api/data/bible`. No AI is used for scripture.
- Admin: people, invitations, need types and limits, agreement wording, audit log

## Giving

People can give once or every month to support the running of Faceless
Angels: Stripe for US dollars, Paystack for naira. Gifts to a specific need
are still pledges only.

- `/donate` sends the giver to Stripe's or Paystack's own payment page. Card
  details never reach our servers.
- A gift is recorded only when the payment company confirms it to the API
  (`/api/giving/webhooks/stripe` and `/api/giving/webhooks/paystack`), and
  each is recorded once however often it arrives. Signatures are checked.
- Every gift gets a numbered receipt (FA-R-…), emailed with a signed link
  that opens it without signing in. Givers can print or save any receipt,
  and a yearly statement listing every gift, from **My giving**, and can
  stop a monthly gift there.
- Yearly statements are emailed each January from the 10th, once gifts are
  real, and staff can send them by hand. No one gets the same one twice.
- Receipts carry the legal name, tax ID, and address of the body that
  received the gift: the US body for dollars, the Nigerian body for naira.
  An administrator sets these in **Admin → Money**. Until a body is marked
  as recognised as tax-exempt, receipts say the gift may not be
  tax-deductible. Have an accountant confirm the wording for each country.
- **Admin → Money** records running costs and help paid to people. Each needs
  a receipt, and a second person must approve it. The person who recorded it
  cannot.
- `/transparency` shows the totals: gifts, fees, costs by kind, help by need,
  and what is held, month by month. No names or single gifts.

Use test keys (`sk_test_`) until the legal body is settled. Live keys are
refused unless `GIVING_LIVE=true`. When going live, set the webhook address
in each dashboard and put Stripe's signing secret in `STRIPE_WEBHOOK_SECRET`.

## What is not built

Real money. Giving runs in test mode until the legal body that receives
gifts is settled with counsel (see Giving above). Gifts to a specific need
are still pledges: a recorded promise, with no money moving.

Sessions made through a meeting provider. Today a host makes the meeting in
Patvero, Zoom, or Teams and pastes its link. Providers sit behind one
interface in `api/src/prayer/meeting-providers.ts`, so Patvero can gain real
integration without changing group or session records.

A pasted Patvero link is checked against Patvero's public lookup, so a
meeting that has ended or never existed is refused. Patvero's Developer API
is read-only and its meeting list has no join links, so meetings cannot yet
be created or picked from here.

## Safeguards

- Bills and IDs are encrypted in the API before they are stored.
- Every change, and every time staff open a case or document, is written to an
  audit log.
- A reviewer cannot review their own request or decide an appeal of their own
  decision.
- A personal prayer request is never open to staff, whatever their role.
- No group may shut people out by race, color, or origin. Every group keeps
  this rule, and members can report a group that breaks it.
- A report about a member or a group goes to site moderators, never to that
  group's own admins. The person reported is not told who sent it.
- Prayer has no part in who receives help. Prayer roles cannot open cases.
- An article is published after a second person approves it. An
  administrator may publish their own, and that is recorded.
- A reader's private notes on an article are never shown to staff.
- Emails to reserved test domains such as `example.test` are never sent.

Back up `EVIDENCE_ENCRYPTION_KEY`. Without it, stored documents cannot be read.

Faceless Angels is not an emergency service.
