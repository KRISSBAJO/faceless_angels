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

## What is not built

Payments. A pledge is a recorded promise and no money moves. Who legally
receives and controls contributions must be settled with counsel and a payment
provider first.

Sessions made through a meeting provider. Today a host makes the meeting in
Patvero, Zoom, or Teams and pastes its link. Providers sit behind one
interface in `api/src/prayer/meeting-providers.ts`, so Patvero can gain real
integration without changing group or session records.

A pasted Patvero link is checked against Patvero's public lookup, so a
meeting that has ended or never existed is refused. Creating Patvero
meetings from here needs Patvero to offer an API key for meetings, which it
does not yet.

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
