"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import { api, ApiError, type CaseDetail } from "@/lib/api";
import {
  DECLINE_REASON_LABELS,
  EVENT_LABELS,
  formatCents,
  formatDay,
  formatMoment,
} from "@/lib/format";
import { useRequiredUser } from "@/lib/session";

// The order a request moves in. Funding and payment are not built yet.
const TRACK = [
  { state: "draft", label: "Started", note: "Your request is saved but not sent." },
  { state: "submitted", label: "Submitted", note: "Waiting for a reviewer." },
  { state: "in_review", label: "Review", note: "We check your identity and documents." },
  { state: "decided", label: "Decision", note: "We tell you the outcome and the reason." },
  { state: "published", label: "Listed", note: "Angels can see your need and pledge toward it." },
  { state: "funded", label: "Funded", note: "Angels cover the approved amount." },
  { state: "provider_paid", label: "Provider paid", note: "We pay the provider and file the receipt." },
];

// Where each state sits on the track above.
const POSITION: Record<string, number> = {
  draft: 0,
  submitted: 1,
  in_review: 2,
  needs_more_information: 2,
  appealed: 2,
  approved: 3,
  declined: 3,
  published: 4,
};

const CAN_WITHDRAW = [
  "draft",
  "submitted",
  "in_review",
  "needs_more_information",
  "approved",
  "published",
];

function message(err: unknown) {
  return err instanceof ApiError ? err.message : "Try again.";
}

export default function RequestPage() {
  const { id } = useParams<{ id: string }>();
  const user = useRequiredUser();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  const load = useCallback(
    () => api<CaseDetail>(`/cases/${id}`).then(setDetail),
    [id],
  );

  useEffect(() => {
    if (!user) return;
    load().catch((err) => setError(message(err)));
  }, [user, load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    void run(async () => {
      await api(`/cases/${id}/evidence`, { body: form });
      formEl.reset();
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() =>
      api(`/cases/${id}/submit`, { body: { consent: true, attest: true } }),
    );
  }

  function onMessage(
    event: React.FormEvent<HTMLFormElement>,
    step: "reply" | "appeal",
  ) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const body = { message: String(new FormData(formEl).get("message")).trim() };
    void run(async () => {
      await api(`/cases/${id}/${step}`, { body });
      formEl.reset();
    });
  }

  function onWithdraw() {
    setConfirmingWithdraw(false);
    void run(() => api(`/cases/${id}/withdraw`, { method: "POST" }));
  }

  if (!user) return <AppShell>{null}</AppShell>;
  if (!detail) {
    return (
      <AppShell user={user}>
        <FormError message={error} />
      </AppShell>
    );
  }

  const isDraft = detail.state === "draft";
  const isWithdrawn = detail.state === "withdrawn";
  const needsInfo = detail.state === "needs_more_information";
  const canUpload = isDraft || needsInfo;
  const canWithdraw = CAN_WITHDRAW.includes(detail.state);
  const position = POSITION[detail.state] ?? -1;
  const { decision } = detail;

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-3">
        <p className="font-mono text-sm text-muted">{detail.publicRef}</p>
        <h1 className="font-serif text-4xl sm:text-5xl">
          {detail.categoryLabel},{" "}
          <span className="tabular-nums">
            {formatCents(detail.amountRequestedCents)}
          </span>
        </h1>
        <p className="text-muted">
          {[
            detail.kind === "quick" ? "Small request." : null,
            detail.providerName ? `Owed to ${detail.providerName}.` : null,
            detail.dueDate ? `Due ${formatDay(detail.dueDate)}.` : null,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      </div>

      <FormError message={error} />

      {isWithdrawn ? (
        <p className="rounded-lg border border-line bg-surface px-5 py-4 leading-7">
          You withdrew this request. Nothing more will happen with it.
        </p>
      ) : (
        <section aria-labelledby="status" className="flex flex-col gap-5">
          <h2 id="status" className="font-serif text-2xl">
            Where your request stands
          </h2>
          <ol className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRACK.map((step, i) => {
              const current = i === position;
              const done = i < position;
              return (
                <li
                  key={step.state}
                  aria-current={current ? "step" : undefined}
                  className={`flex flex-col gap-1 border-t-2 pt-3 ${
                    current
                      ? "border-gold-bright"
                      : done
                        ? "border-ink"
                        : "border-line"
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      current || done ? "" : "text-muted"
                    }`}
                  >
                    {step.label}
                    {current ? " (now)" : done ? " ✓" : ""}
                  </span>
                  <span className="text-sm leading-6 text-muted">
                    {step.note}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {decision ? (
        <section
          aria-labelledby="decision"
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6"
        >
          <h2 id="decision" className="font-serif text-2xl">
            {decision.outcome === "approved"
              ? `Approved for ${formatCents(decision.approvedAmountCents ?? 0)}`
              : decision.kind === "appeal"
                ? "Declined after appeal"
                : "Declined"}
          </h2>
          {decision.reasonCode ? (
            <p className="font-medium">
              {DECLINE_REASON_LABELS[decision.reasonCode] ?? decision.reasonCode}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap break-words leading-7">
            {decision.rationale}
          </p>
          {decision.outcome === "approved" ? (
            <p className="text-sm leading-6 text-muted">
              This approval holds until{" "}
              {decision.expiresOn ? formatDay(decision.expiresOn) : "we tell you"}
              . Approval means the request can be funded. It is not a promise
              that it will be.
              {decision.restrictions ? ` ${decision.restrictions}` : ""}
            </p>
          ) : null}
          {detail.state === "appealed" ? (
            <p className="text-sm text-muted">
              Your appeal is with a different reviewer.
            </p>
          ) : null}
          {decision.kind === "appeal" && decision.outcome === "declined" ? (
            <p className="text-sm text-muted">This decision is final.</p>
          ) : null}
        </section>
      ) : null}

      {detail.listing ? (
        <section
          aria-labelledby="listing"
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6"
        >
          <h2 id="listing" className="font-serif text-2xl">
            What Angels see
          </h2>
          <p className="leading-7">{detail.listing.summary}</p>
          <p className="text-sm leading-6 text-muted">
            {detail.categoryLabel} · {detail.city}, {detail.region} ·{" "}
            {detail.listing.visibility === "public"
              ? "Shown on the public list."
              : "Shown to confirmed Angels only."}{" "}
            If this could point to you, reply to us and we will change it.
          </p>
          <p className="font-medium tabular-nums">
            {detail.pledgedCents === 0
              ? "No pledges yet."
              : `${formatCents(detail.pledgedCents)} pledged by ${
                  detail.angels === 1
                    ? "a Faceless Angel"
                    : `${detail.angels} Faceless Angels`
                }.`}
          </p>
          <p className="text-sm leading-6 text-muted">
            A pledge is a promise to give. We will tell you when the provider
            has been paid.
          </p>
        </section>
      ) : null}

      {detail.canAppeal ? (
        <section aria-labelledby="appeal" className="flex flex-col gap-4">
          <h2 id="appeal" className="font-serif text-2xl">
            Ask for another look
          </h2>
          <p className="max-w-xl leading-7 text-muted">
            If something is wrong or missing, tell us. A different reviewer
            will decide your appeal.
          </p>
          <form
            onSubmit={(event) => onMessage(event, "appeal")}
            className="flex max-w-xl flex-col gap-4"
          >
            <Field id="appeal-message" label="What should we look at again?">
              <textarea
                id="appeal-message"
                name="message"
                className="input"
                rows={4}
                required
                minLength={10}
                maxLength={2000}
              />
            </Field>
            <div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Send appeal
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {detail.messages.length > 0 ? (
        <section aria-labelledby="messages" className="flex flex-col gap-4">
          <h2 id="messages" className="font-serif text-2xl">
            Messages
          </h2>
          <ul className="flex flex-col gap-4">
            {detail.messages.map((m) => (
              <li key={m.id} className="flex flex-col gap-1">
                <span className="text-sm text-muted">
                  {m.fromYou ? "You" : "Review team"} · {formatMoment(m.at)}
                </span>
                <p className="whitespace-pre-wrap break-words leading-7">
                  {m.body}
                </p>
              </li>
            ))}
          </ul>
          {needsInfo ? (
            <form
              onSubmit={(event) => onMessage(event, "reply")}
              className="flex max-w-xl flex-col gap-4"
            >
              <Field
                id="reply-message"
                label="Your reply"
                hint="Add any documents below first, then send your reply."
              >
                <textarea
                  id="reply-message"
                  name="message"
                  className="input"
                  rows={4}
                  required
                  minLength={10}
                  maxLength={2000}
                />
              </Field>
              <div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy}
                >
                  Send reply
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="documents" className="flex flex-col gap-4">
        <h2 id="documents" className="font-serif text-2xl">
          Documents
        </h2>
        {detail.evidence.length === 0 ? (
          <p className="text-muted">No documents yet.</p>
        ) : (
          <ul className="flex flex-col">
            {detail.evidence.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line py-3 text-sm last:border-b"
              >
                <span className="break-all font-medium">{doc.name}</span>
                <span className="text-muted">
                  Added {formatMoment(doc.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canUpload ? (
          <form
            onSubmit={onUpload}
            className="flex max-w-xl flex-col gap-4 rounded-xl border border-line bg-surface p-5"
          >
            <Field id="kind" label="What are you uploading?">
              <select id="kind" name="kind" className="input" required>
                <option value="bill">Bill</option>
                <option value="notice">Shut-off or late notice</option>
                <option value="invoice">Invoice</option>
                <option value="receipt">Receipt</option>
                <option value="other">Something else</option>
              </select>
            </Field>
            <Field id="file" label="Photo or PDF" hint="PDF, JPG, or PNG. Up to 8 MB.">
              <input
                id="file"
                name="file"
                type="file"
                className="input"
                accept="application/pdf,image/jpeg,image/png"
                required
              />
            </Field>
            <div>
              <button type="submit" className="btn btn-ghost" disabled={busy}>
                Add document
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {isDraft ? (
        <section aria-labelledby="send" className="flex flex-col gap-4">
          <h2 id="send" className="font-serif text-2xl">
            Send your request
          </h2>
          <p className="max-w-xl leading-7 text-muted">
            This request has not been sent.{" "}
            {detail.documentRequired
              ? "Add the bill or notice above, then submit it for review."
              : "Submit it for review when you are ready."}
          </p>
          <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
            <label className="flex items-start gap-3 leading-6">
              <input
                id="consent"
                type="checkbox"
                className="mt-1 size-4"
                required
              />
              <span>
                I agree that Faceless Angels may review this request and
                confirm the balance with the provider.
              </span>
            </label>
            <label className="flex items-start gap-3 leading-6">
              <input
                id="attest"
                type="checkbox"
                className="mt-1 size-4"
                required
              />
              <span>
                Everything I have written is true, and I have listed all other
                help I asked for or received for this need.
              </span>
            </label>
            <div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  busy ||
                  (detail.documentRequired && detail.evidence.length === 0)
                }
              >
                Submit request
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="details" className="flex flex-col gap-4">
        <h2 id="details" className="font-serif text-2xl">
          What you told us
        </h2>
        <dl className="flex flex-col text-sm">
          {(
            [
              ["What you need", detail.whatHappened],
              ["If it is not paid", detail.consequence],
              [
                "One-time or recurring",
                detail.recurrence === null
                  ? null
                  : detail.recurrence === "one_time"
                    ? "One time"
                    : "Recurring",
              ],
              [
                "You have paid",
                detail.kind === "quick"
                  ? null
                  : formatCents(detail.alreadyPaidCents),
              ],
              ["Help from others", formatCents(detail.otherAssistanceCents)],
              ["Location", `${detail.city}, ${detail.region}`],
            ] as [string, string | null][]
          )
            .filter((row): row is [string, string] => row[1] !== null)
            .map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 border-t border-line py-3 last:border-b sm:grid-cols-[12rem_1fr]"
            >
              <dt className="text-muted">{label}</dt>
              <dd className="whitespace-pre-wrap break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-4">
        <h2 id="history" className="font-serif text-2xl">
          History
        </h2>
        <ol className="flex flex-col text-sm">
          {detail.timeline.map((event, i) => (
            <li
              key={i}
              className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line py-3 last:border-b"
            >
              <span>{EVENT_LABELS[event.action] ?? event.action}</span>
              <span className="text-muted">{formatMoment(event.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      {canWithdraw ? (
        <section className="flex flex-wrap items-center gap-3">
          {confirmingWithdraw ? (
            <>
              <span className="text-sm">
                Withdraw this request? You cannot undo this. Any pledges
                toward it are released.
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onWithdraw}
                disabled={busy}
              >
                Yes, withdraw
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmingWithdraw(false)}
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmingWithdraw(true)}
              disabled={busy}
            >
              Withdraw request
            </button>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
