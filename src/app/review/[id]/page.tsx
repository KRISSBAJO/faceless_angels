"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import { api, ApiError, type ReviewDetail } from "@/lib/api";
import {
  CLAIM_LABELS,
  DECLINE_REASON_LABELS,
  EVENT_LABELS,
  formatCents,
  formatDay,
  formatMoment,
  parseCents,
  RESULT_LABELS,
  STATE_LABELS,
} from "@/lib/format";
import { useRequiredUser } from "@/lib/session";

const IDENTITY_LABELS: Record<string, string> = {
  unverified: "Not confirmed. No ID sent yet.",
  pending: "ID sent, waiting for a check",
  verified: "Confirmed",
  rejected: "ID not accepted",
};

const MESSAGE_LABELS: Record<string, string> = {
  info_request: "Review team asked",
  reply: "Requester replied",
  appeal: "Requester appealed",
};

function message(err: unknown) {
  return err instanceof ApiError ? err.message : "Try again.";
}

function Panel({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 border-t border-line pt-6"
    >
      <h2 id={id} className="font-serif text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ReviewCasePage() {
  const { id } = useParams<{ id: string }>();
  const user = useRequiredUser();
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"approved" | "declined">("approved");

  const load = useCallback(
    () => api<ReviewDetail>(`/review/cases/${id}`).then(setDetail),
    [id],
  );

  useEffect(() => {
    if (!user) return;
    load().catch((err) => setError(message(err)));
  }, [user, load]);

  async function run(action: () => Promise<unknown>, formEl?: HTMLFormElement) {
    setBusy(true);
    setError(null);
    try {
      await action();
      formEl?.reset();
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  function post(path: string, body?: unknown, formEl?: HTMLFormElement) {
    return run(
      () => api(`/review/cases/${id}${path}`, { method: "POST", body }),
      formEl,
    );
  }

  function onCheck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post(
      "/checks",
      {
        claim: form.get("claim"),
        result: form.get("result"),
        method: String(form.get("method")).trim(),
        note: String(form.get("note")).trim() || undefined,
      },
      event.currentTarget,
    );
  }

  function onRequestInfo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post(
      "/request-info",
      { message: String(form.get("message")).trim() },
      event.currentTarget,
    );
  }

  function onPublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post("/publish", {
      summary: String(form.get("summary")).trim(),
      visibility: form.get("visibility"),
    });
  }

  function onUnpublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post(
      "/unpublish",
      { message: String(form.get("message")).trim() },
      event.currentTarget,
    );
  }

  function onDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rationale = String(form.get("rationale")).trim();
    const restrictions = String(form.get("restrictions") ?? "").trim();

    if (outcome === "declined") {
      void post("/decision", {
        outcome,
        rationale,
        reasonCode: form.get("reasonCode"),
      });
      return;
    }
    const cents = parseCents(String(form.get("approvedAmount")));
    if (cents === null || cents < 1) {
      setError("Enter the approved amount, like 187.42.");
      return;
    }
    void post("/decision", {
      outcome,
      rationale,
      approvedAmountCents: cents,
      paymentDestination: String(form.get("paymentDestination")).trim(),
      expiresOn: form.get("expiresOn"),
      restrictions: restrictions || undefined,
    });
  }

  if (!user) return <AppShell>{null}</AppShell>;
  if (!detail) {
    return (
      <AppShell user={user}>
        <FormError message={error} />
        <Link href="/review" className="underline underline-offset-4">
          Back to the queue
        </Link>
      </AppShell>
    );
  }

  const open = detail.state === "in_review" || detail.state === "appealed";
  const canWork = detail.assignedToMe && open;
  const canClaim =
    !detail.assigned &&
    (detail.state === "submitted" ||
      (detail.state === "appealed" && !detail.decidedByMe));
  const canList = detail.assignedToMe || user.role === "admin";
  const reused = detail.evidence.filter((e) => e.reusedOn.length > 0);

  return (
    <AppShell user={user}>
      <Link href="/review" className="text-sm text-muted hover:text-ink">
        ← Review queue
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm text-muted">{detail.publicRef}</p>
          <h1 className="font-serif text-4xl">
            {detail.categoryLabel},{" "}
            <span className="tabular-nums">
              {formatCents(detail.amountRequestedCents)}
            </span>
          </h1>
          <p className="text-muted">
            {detail.kind === "quick" ? "Small request · " : ""}
            {STATE_LABELS[detail.state] ?? detail.state}
            {detail.reviewerName
              ? detail.assignedToMe
                ? " · With you"
                : ` · With ${detail.reviewerName}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canClaim ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void post("/claim")}
            >
              Take this request
            </button>
          ) : null}
          {canWork ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void post("/release")}
            >
              Hand back
            </button>
          ) : null}
        </div>
      </div>

      <FormError message={error} />

      {detail.state === "appealed" && detail.decidedByMe ? (
        <p className="rounded-lg border border-line bg-surface px-5 py-4 leading-7">
          You made the first decision on this request. A different reviewer
          must decide the appeal.
        </p>
      ) : null}

      <Panel id="signals" title="Signals">
        <ul className="flex flex-col gap-2 text-sm leading-6">
          <li>
            Identity:{" "}
            <strong>
              {IDENTITY_LABELS[detail.requester.identityStatus] ??
                detail.requester.identityStatus}
            </strong>
            {detail.requester.identityStatus === "pending" ? (
              <>
                {" · "}
                <Link
                  href="/review/identity"
                  className="underline underline-offset-4"
                >
                  Open ID checks
                </Link>
              </>
            ) : null}
            {detail.requester.identityStatus === "verified"
              ? ""
              : " · Needed before you can approve."}
          </li>
          <li>
            Email:{" "}
            <strong>
              {detail.requester.emailVerified ? "Confirmed" : "Not confirmed"}
            </strong>
          </li>
          <li>
            Other requests from this person in the last 12 months:{" "}
            <strong className="tabular-nums">
              {detail.otherRequestsLast12Months}
            </strong>
          </li>
          <li>
            {reused.length === 0
              ? "No document here appears on another case."
              : reused.map((e) => (
                  <span key={e.id} className="block">
                    <strong>{e.name}</strong> also appears on{" "}
                    {e.reusedOn.join(", ")}.
                  </span>
                ))}
          </li>
        </ul>
        <p className="text-sm text-muted">
          Signals are reasons to look closer. They are not proof of deceit.
        </p>
      </Panel>

      <Panel id="request" title="The request">
        <dl className="flex flex-col text-sm">
          {(
            [
              ["Requester", `${detail.requester.name} (${detail.requester.email})`],
              ["Location", `${detail.city}, ${detail.region}`],
              ["Owed to", detail.providerName],
              ["Due", detail.dueDate ? formatDay(detail.dueDate) : null],
              ["What they need", detail.whatHappened],
              ["If it is not paid", detail.consequence],
              [
                "One-time or recurring",
                detail.recurrence === null
                  ? null
                  : detail.recurrence === "one_time"
                    ? "One time"
                    : "Recurring",
              ],
              ["Requester has paid", formatCents(detail.alreadyPaidCents)],
              [
                "Help from others",
                `${formatCents(detail.otherAssistanceCents)}${
                  detail.otherAssistanceNote
                    ? ` · ${detail.otherAssistanceNote}`
                    : ""
                }`,
              ],
            ] as [string, string | null][]
          )
            .filter((row): row is [string, string] => row[1] !== null)
            .map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 border-t border-line py-3 first:border-t-0 sm:grid-cols-[12rem_1fr]"
            >
              <dt className="text-muted">{label}</dt>
              <dd className="whitespace-pre-wrap break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel id="documents" title="Documents">
        {detail.evidence.length === 0 ? (
          <p className="text-sm text-muted">No documents.</p>
        ) : (
          <ul className="flex flex-col text-sm">
            {detail.evidence.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line py-3 first:border-t-0"
              >
                <a
                  href={`/api/review/cases/${detail.id}/evidence/${doc.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-medium underline underline-offset-4"
                >
                  {doc.name}
                </a>
                <span className="text-muted">
                  {doc.kind} · {Math.ceil(doc.sizeBytes / 1024)} KB · added{" "}
                  {formatMoment(doc.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted">
          Opening a document is recorded in the audit log.
        </p>
      </Panel>

      <Panel id="checks" title="Checks">
        {detail.checks.length === 0 ? (
          <p className="text-sm text-muted">No checks recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-ink text-xs uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-4 font-semibold">What</th>
                  <th className="py-2 pr-4 font-semibold">Finding</th>
                  <th className="py-2 pr-4 font-semibold">How</th>
                  <th className="py-2 font-semibold">By</th>
                </tr>
              </thead>
              <tbody>
                {detail.checks.map((check) => (
                  <tr key={check.id} className="border-b border-line align-top">
                    <td className="py-3 pr-4">
                      {CLAIM_LABELS[check.claim] ?? check.claim}
                    </td>
                    <td className="py-3 pr-4 font-medium">
                      {RESULT_LABELS[check.result] ?? check.result}
                    </td>
                    <td className="py-3 pr-4">
                      {check.method}
                      {check.note ? (
                        <span className="block text-muted">{check.note}</span>
                      ) : null}
                    </td>
                    <td className="py-3 text-muted">
                      {check.by}
                      <span className="block">{formatMoment(check.at)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canWork ? (
          <form
            onSubmit={onCheck}
            className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2"
          >
            <Field id="claim" label="What did you check?">
              <select id="claim" name="claim" className="input" required>
                {Object.entries(CLAIM_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="result" label="What did you find?">
              <select id="result" name="result" className="input" required>
                {Object.entries(RESULT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="method" label="How did you check it?">
              <input
                id="method"
                name="method"
                className="input"
                placeholder="Called the provider's billing line"
                required
                minLength={3}
                maxLength={300}
              />
            </Field>
            <Field id="note" label="Note (optional)">
              <input id="note" name="note" className="input" maxLength={1000} />
            </Field>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-ghost" disabled={busy}>
                Record check
              </button>
            </div>
          </form>
        ) : null}
      </Panel>

      <Panel id="messages" title="Messages">
        {detail.messages.length === 0 ? (
          <p className="text-sm text-muted">No messages.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {detail.messages.map((m) => (
              <li key={m.id} className="flex flex-col gap-1 text-sm">
                <span className="text-muted">
                  {MESSAGE_LABELS[m.kind] ?? m.kind} · {m.by} ·{" "}
                  {formatMoment(m.at)}
                </span>
                <p className="whitespace-pre-wrap break-words leading-6">
                  {m.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        {detail.assignedToMe && detail.state === "in_review" ? (
          <form
            onSubmit={onRequestInfo}
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
          >
            <Field
              id="message"
              label="Ask the requester for more"
              hint="They can reply and add documents. The request comes back to you."
            >
              <textarea
                id="message"
                name="message"
                className="input"
                rows={3}
                required
                minLength={10}
                maxLength={2000}
              />
            </Field>
            <div>
              <button type="submit" className="btn btn-ghost" disabled={busy}>
                Send request for information
              </button>
            </div>
          </form>
        ) : null}
      </Panel>

      <Panel id="decision" title="Decision">
        {detail.decisions.map((d) => (
          <div
            key={d.kind}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5 text-sm"
          >
            <p className="font-medium">
              {d.kind === "appeal" ? "Appeal decision" : "First decision"}:{" "}
              {d.outcome === "approved"
                ? `Approved for ${formatCents(d.approvedAmountCents ?? 0)}`
                : `Declined. ${DECLINE_REASON_LABELS[d.reasonCode ?? ""] ?? ""}`}
            </p>
            {d.outcome === "approved" ? (
              <p>
                Pay {d.paymentDestination}. Expires{" "}
                {d.expiresOn ? formatDay(d.expiresOn) : ""}.
              </p>
            ) : null}
            <p className="whitespace-pre-wrap break-words leading-6">
              {d.rationale}
            </p>
            {d.restrictions ? <p>Restrictions: {d.restrictions}</p> : null}
            <p className="text-muted">
              {d.by} · {formatMoment(d.at)} · policy {d.policyVersion}
            </p>
          </div>
        ))}

        {canWork ? (
          <form onSubmit={onDecision} className="flex flex-col gap-4">
            <fieldset className="flex flex-wrap gap-5">
              <legend className="mb-2 text-sm font-medium">
                {detail.state === "appealed"
                  ? "Final decision on the appeal"
                  : "Your decision"}
              </legend>
              <label className="flex items-center gap-2">
                <input
                  id="outcome-approved"
                  type="radio"
                  name="outcome"
                  checked={outcome === "approved"}
                  onChange={() => setOutcome("approved")}
                />
                Approve
              </label>
              <label className="flex items-center gap-2">
                <input
                  id="outcome-declined"
                  type="radio"
                  name="outcome"
                  checked={outcome === "declined"}
                  onChange={() => setOutcome("declined")}
                />
                Decline
              </label>
            </fieldset>

            {outcome === "approved" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="approvedAmount"
                  label="Approved amount (USD)"
                  hint={`Up to ${formatCents(detail.amountRequestedCents)}.`}
                >
                  <input
                    id="approvedAmount"
                    name="approvedAmount"
                    className="input tabular-nums"
                    inputMode="decimal"
                    required
                  />
                </Field>
                <Field
                  id="expiresOn"
                  label="Approval expires"
                  hint="Recheck the balance after this date."
                >
                  <input
                    id="expiresOn"
                    name="expiresOn"
                    type="date"
                    className="input"
                    required
                  />
                </Field>
                <Field id="paymentDestination" label="Who will be paid">
                  <input
                    id="paymentDestination"
                    name="paymentDestination"
                    className="input"
                    defaultValue={detail.providerName ?? ""}
                    required
                    minLength={2}
                    maxLength={200}
                  />
                </Field>
                <Field id="restrictions" label="Restrictions (optional)">
                  <input
                    id="restrictions"
                    name="restrictions"
                    className="input"
                    placeholder="Provider payment only"
                    maxLength={1000}
                  />
                </Field>
              </div>
            ) : (
              <Field id="reasonCode" label="Reason">
                <select
                  id="reasonCode"
                  name="reasonCode"
                  className="input"
                  required
                >
                  {Object.entries(DECLINE_REASON_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </Field>
            )}

            <Field
              id="rationale"
              label="Reason in plain words"
              hint="The requester reads this. Do not name other people or cases."
            >
              <textarea
                id="rationale"
                name="rationale"
                className="input"
                rows={4}
                required
                minLength={20}
                maxLength={2000}
              />
            </Field>
            <div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {outcome === "approved" ? "Approve request" : "Decline request"}
              </button>
            </div>
          </form>
        ) : null}

        {detail.decisions.length === 0 && !canWork ? (
          <p className="text-sm text-muted">No decision yet.</p>
        ) : null}
      </Panel>

      {detail.state === "approved" || detail.state === "published" ? (
        <Panel id="listing" title="Listing for Angels">
          {detail.state === "published" ? (
            <>
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5 text-sm">
                <p className="text-base leading-7">{detail.listing.summary}</p>
                <p className="text-muted">
                  {detail.listing.visibility === "public"
                    ? "On the public list"
                    : "Shown to confirmed Angels only"}
                  {detail.listing.publishedAt
                    ? ` since ${formatMoment(detail.listing.publishedAt)}`
                    : ""}
                  {detail.listing.expiresOn
                    ? `. Comes off the list after ${formatDay(detail.listing.expiresOn)}.`
                    : "."}
                </p>
                <p className="font-medium tabular-nums">
                  {formatCents(detail.pledgedCents)} of{" "}
                  {formatCents(detail.approvedAmountCents ?? 0)} pledged
                </p>
              </div>
              {canList ? (
                <form
                  onSubmit={onUnpublish}
                  className="flex flex-col gap-4 rounded-xl border border-line p-5"
                >
                  <Field
                    id="unpublish-reason"
                    label="Take this need off the list"
                    hint="Pledges toward it are released and those Angels get an email. Say why for the audit log."
                  >
                    <input
                      id="unpublish-reason"
                      name="message"
                      className="input"
                      placeholder="The provider reported the balance as paid."
                      required
                      minLength={10}
                      maxLength={2000}
                    />
                  </Field>
                  <div>
                    <button
                      type="submit"
                      className="btn btn-ghost"
                      disabled={busy}
                    >
                      Take off the list
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          ) : canList ? (
            <form onSubmit={onPublish} className="flex flex-col gap-4">
              <Field
                id="summary"
                label="Summary for Angels"
                hint="One or two sentences. No name, street, employer, school, or account number. The requester can read this."
              >
                <textarea
                  id="summary"
                  name="summary"
                  className="input"
                  rows={3}
                  placeholder="Single-parent household requesting assistance with an electricity bill."
                  defaultValue={detail.listing.summary ?? ""}
                  required
                  minLength={30}
                  maxLength={300}
                />
              </Field>
              <Field
                id="visibility"
                label="Who can see it"
                hint={
                  detail.listing.preference === "public"
                    ? "The requester allowed the public list."
                    : "The requester asked for confirmed Angels only."
                }
              >
                <select
                  id="visibility"
                  name="visibility"
                  className="input"
                  defaultValue={detail.listing.preference}
                >
                  {detail.listing.preference === "public" ? (
                    <option value="public">Anyone</option>
                  ) : null}
                  <option value="angels_only">Confirmed Angels only</option>
                </select>
              </Field>
              <p className="text-sm leading-6 text-muted">
                Angels will see the need type, {detail.city}, {detail.region},
                the approved amount, the due date, your summary, and a badge
                for each check recorded above.
              </p>
              <div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy}
                >
                  List this need
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted">
              The reviewer on this request or an administrator can list it.
            </p>
          )}
        </Panel>
      ) : null}

      <Panel id="audit" title="Audit log">
        <ol className="flex flex-col text-sm">
          {detail.timeline.map((event, i) => (
            <li
              key={i}
              className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line py-2.5 first:border-t-0"
            >
              <span>
                {EVENT_LABELS[event.action] ?? event.action}
                {event.state && event.priorState !== event.state
                  ? ` → ${STATE_LABELS[event.state] ?? event.state}`
                  : ""}
              </span>
              <span className="text-muted">
                {event.by ?? "System"} · {formatMoment(event.at)}
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </AppShell>
  );
}
