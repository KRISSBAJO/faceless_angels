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

## The first administrator

Set `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` in `.env`. The API creates
that account at startup while no administrator exists. The account must choose
a new password at first sign-in.

Staff cannot sign themselves up. An administrator invites them from
**Admin → Invitations**.

## What is built

- Ask for help, as a full request or a short one for small needs
- Email confirmation and a private ID check
- Reviewer workspace: checks, questions, decisions, and appeals
- A list of approved needs with no names, and pledges from Angels
- Admin: people, invitations, need types and limits, agreement wording, audit log

## What is not built

Payments. A pledge is a recorded promise and no money moves. Who legally
receives and controls contributions must be settled with counsel and a payment
provider first.

## Safeguards

- Bills and IDs are encrypted in the API before they are stored.
- Every change, and every time staff open a case or document, is written to an
  audit log.
- A reviewer cannot review their own request or decide an appeal of their own
  decision.
- Emails to reserved test domains such as `example.test` are never sent.

Back up `EVIDENCE_ENCRYPTION_KEY`. Without it, stored documents cannot be read.

Faceless Angels is not an emergency service.
