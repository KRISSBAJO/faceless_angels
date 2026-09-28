"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import { PrayedButton } from "@/components/PrayerCard";
import { api, errorMessage } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import {
  AUDIENCE_LABELS,
  REQUEST_STATUS_LABELS,
  type PrayerRequestDetail,
} from "@/lib/prayer";
import { useRequiredUser } from "@/lib/session";

type Panel = null | "edit" | "answered" | "withdraw" | "report" | "block";

export default function PrayerRequestPage() {
  const { id } = useParams<{ id: string }>();
  const user = useRequiredUser();
  const router = useRouter();
  const [request, setRequest] = useState<PrayerRequestDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [reportOn, setReportOn] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api<PrayerRequestDetail>(`/prayer/requests/${id}`).then(setRequest),
    [id],
  );

  useEffect(() => {
    if (!user) return;
    load().catch(() => setMissing(true));
  }, [user, load]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setPanel(null);
      setReportOn(null);
      if (done) setNotice(done);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <AppShell>{null}</AppShell>;
  if (missing) {
    return (
      <AppShell user={user}>
        <h1 className="font-serif text-4xl">This request is not available</h1>
        <p className="max-w-xl leading-7 text-muted">
          It may have been withdrawn, or it may be shared with a group you
          are not in.
        </p>
        <div>
          <Link href="/prayer" className="btn btn-primary">
            Back to prayer
          </Link>
        </div>
      </AppShell>
    );
  }
  if (!request) return <AppShell user={user}>{null}</AppShell>;

  const base = `/prayer/requests/${request.id}`;
  const open = request.status === "active" && !request.ended;
  const canEdit =
    request.mine && ["active", "pending", "hidden"].includes(request.status);

  function text(event: React.FormEvent<HTMLFormElement>, name: string) {
    event.preventDefault();
    return String(new FormData(event.currentTarget).get(name) ?? "").trim();
  }

  return (
    <AppShell user={user}>
      <Link
        href={
          request.mine
            ? "/prayer/mine"
            : request.groupId
              ? `/prayer/groups/${request.groupId}`
              : "/prayer"
        }
        className="text-sm text-muted hover:text-ink"
      >
        ← Back
      </Link>

      <article className="flex max-w-3xl flex-col gap-5">
        <p className="text-sm text-muted">
          {request.mine ? "You" : (request.by ?? "A member of the network")} ·{" "}
          {request.audience === "group"
            ? request.groupName
            : AUDIENCE_LABELS[request.audience]}{" "}
          · {formatMoment(request.at)}
          {request.editedAt ? " · changed since" : ""}
          {request.mine
            ? ` · ${
                request.ended && request.status === "active"
                  ? "Ended"
                  : (REQUEST_STATUS_LABELS[request.status] ?? request.status)
              }`
            : ""}
          {request.needsCare ? " · May need care" : ""}
          {request.forwarded ? " · Passed on by a group leader" : ""}
        </p>
        <h1 className="whitespace-pre-wrap break-words font-serif text-3xl leading-snug sm:text-4xl">
          {request.body}
        </h1>

        {request.mine && request.help ? (
          <p className="rounded-xl border border-gold-bright bg-gold-soft p-5 leading-7">
            {request.help}
          </p>
        ) : null}
        {request.mine && request.status === "hidden" ? (
          <p className="rounded-xl border border-line bg-surface p-5 leading-7">
            This request is not being shown.{" "}
            {request.moderationNote ?? ""} You can change it and it will be
            looked at again.
          </p>
        ) : null}
        {request.mine && (request.prayedCount ?? 0) > 0 ? (
          <p className="text-sm text-muted">
            {request.prayedCount === 1
              ? "Someone prayed for this."
              : `${request.prayedCount} people prayed for this.`}{" "}
            Only you can see this.
          </p>
        ) : null}

        {request.answeredAt ? (
          <section className="flex flex-col gap-2 border-l-2 border-gold-bright pl-5">
            <h2 className="text-sm font-medium text-verified">
              Answered {formatMoment(request.answeredAt)}
            </h2>
            {request.testimony ? (
              <p className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">
                {request.testimony}
              </p>
            ) : null}
            {request.mine && request.testimonyStatus ? (
              <p className="text-sm text-muted">
                {request.testimonyStatus === "pending"
                  ? "A moderator will look at your testimony before it is published."
                  : request.testimonyStatus === "approved"
                    ? "Your testimony is published, with no name."
                    : "Your testimony was not published. It stays private."}
              </p>
            ) : null}
          </section>
        ) : null}

        <FormError message={error} />
        {notice ? (
          <p role="status" className="text-sm text-verified">
            {notice}
          </p>
        ) : null}

        {request.mine ? null : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <PrayedButton request={request} />
            {request.allowFollow ? (
              <button
                type="button"
                className="underline underline-offset-4"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(`${base}/follow`, {
                      method: request.iFollow ? "DELETE" : "PUT",
                    });
                    await load();
                  })
                }
              >
                {request.iFollow
                  ? "Stop following"
                  : "Tell me if this is answered"}
              </button>
            ) : null}
            {request.canForward ? (
              <button
                type="button"
                className="underline underline-offset-4"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(`${base}/forward`, { method: "POST" });
                    await load();
                  }, "Passed to the prayer team.")
                }
              >
                Pass to the prayer team
              </button>
            ) : null}
            <button
              type="button"
              className="text-muted underline underline-offset-4"
              onClick={() => {
                setReportOn(null);
                setPanel(panel === "report" ? null : "report");
              }}
            >
              Report
            </button>
            <button
              type="button"
              className="text-muted underline underline-offset-4"
              onClick={() => setPanel(panel === "block" ? null : "block")}
            >
              Hide this person
            </button>
          </div>
        )}

        {canEdit ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {(
              [
                ["edit", "Change it"],
                ["answered", "Mark as answered"],
                ["withdraw", "Withdraw it"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="underline underline-offset-4"
                onClick={() => setPanel(panel === value ? null : value)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {panel === "edit" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                setRequest(
                  await api<PrayerRequestDetail>(base, {
                    method: "PATCH",
                    body: {
                      body: String(form.get("body")).trim(),
                      showName: form.get("showName") === "on",
                      allowResponses: form.get("allowResponses") === "on",
                      allowFollow: form.get("allowFollow") === "on",
                      allowForward: form.get("allowForward") === "on",
                    },
                  }),
                );
              }, "Saved.");
            }}
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
          >
            <Field
              id="edit-body"
              label="Your request"
              hint={
                request.audience === "network"
                  ? "New words go back to a moderator before they are shown."
                  : undefined
              }
            >
              <textarea
                id="edit-body"
                name="body"
                className="input"
                rows={5}
                defaultValue={request.body}
                required
                minLength={10}
                maxLength={1500}
              />
            </Field>
            {request.audience === "personal" ? null : (
              <div className="flex flex-col gap-2 text-sm">
                {(
                  [
                    ["showName", "Show my first name and last initial", request.showName],
                    ["allowResponses", "Let people write encouragement", request.allowResponses],
                    ["allowFollow", "Let people follow this request", request.allowFollow],
                    ["allowForward", "Let a group leader pass this to the prayer team", request.allowForward],
                  ] as const
                ).map(([name, label, on]) => (
                  <label key={name} className="flex items-center gap-2">
                    <input
                      id={`edit-${name}`}
                      name={name}
                      type="checkbox"
                      className="size-4"
                      defaultChecked={on}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            <div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        ) : null}

        {panel === "answered" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                setRequest(
                  await api<PrayerRequestDetail>(`${base}/answered`, {
                    body: {
                      testimony: String(form.get("testimony")).trim() || undefined,
                      publish: form.get("publish") === "on",
                    },
                  }),
                );
              });
            }}
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
          >
            <Field
              id="testimony"
              label="What happened? (optional)"
              hint="Leave out names."
            >
              <textarea
                id="testimony"
                name="testimony"
                className="input"
                rows={4}
                maxLength={1500}
              />
            </Field>
            <label className="flex items-start gap-3 text-sm leading-6">
              <input
                id="publish"
                name="publish"
                type="checkbox"
                className="mt-1 size-4"
              />
              <span>
                Publish this as an answered prayer, with no name. A moderator
                looks at it first. Leave this off to keep it private.
              </span>
            </label>
            <div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Mark as answered
              </button>
            </div>
          </form>
        ) : null}

        {panel === "withdraw" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-5 text-sm">
            <span>
              Withdraw this request? Its words are deleted and cannot be
              brought back.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(base, { method: "DELETE" });
                  router.push("/prayer/mine");
                })
              }
            >
              Yes, withdraw
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setPanel(null)}
            >
              Keep it
            </button>
          </div>
        ) : null}

        {panel === "report" ? (
          <form
            onSubmit={(event) => {
              const reason = text(event, "reason");
              void run(
                () =>
                  api(
                    reportOn
                      ? `/prayer/responses/${reportOn}/report`
                      : `${base}/report`,
                    { body: { reason } },
                  ),
                "Thank you. Someone will look at it.",
              );
            }}
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
          >
            <Field
              id="reason"
              label={reportOn ? "What is wrong with this reply?" : "What is wrong with this request?"}
              hint={
                request.groupId
                  ? "The leaders of this group will look at it."
                  : "A moderator will look at it."
              }
            >
              <input
                id="reason"
                name="reason"
                className="input"
                required
                minLength={5}
                maxLength={500}
              />
            </Field>
            <div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Send report
              </button>
            </div>
          </form>
        ) : null}

        {panel === "block" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-5 text-sm">
            <span>
              Hide everything this person writes? They are not told, and they
              can no longer reply to your requests.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("/prayer/blocks", {
                    body: { type: "request", id: request.id },
                  });
                  router.push("/prayer");
                })
              }
            >
              Yes, hide
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setPanel(null)}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </article>

      {request.audience === "personal" ? null : (
        <section className="flex max-w-3xl flex-col gap-4 border-t border-line pt-6">
          <h2 className="font-serif text-2xl">Encouragement</h2>
          {request.responses.length === 0 ? (
            <p className="text-sm text-muted">
              {request.allowResponses
                ? "No one has written yet."
                : "The person who wrote this asked for prayer only, without replies."}
            </p>
          ) : (
            <ul className="flex flex-col gap-5">
              {request.responses.map((reply) => (
                <li key={reply.id} className="flex flex-col gap-1">
                  <span className="text-sm text-muted">
                    {reply.mine
                      ? "You"
                      : reply.fromAuthor
                        ? "The person who asked"
                        : reply.by}{" "}
                    · {formatMoment(reply.at)}
                    {reply.waiting ? " · waiting for a moderator" : ""}
                  </span>
                  <p className="whitespace-pre-wrap break-words leading-7">
                    {reply.body}
                  </p>
                  {reply.mine ? null : (
                    <button
                      type="button"
                      className="self-start text-sm text-muted underline underline-offset-4"
                      onClick={() => {
                        setReportOn(reply.id);
                        setPanel("report");
                      }}
                    >
                      Report
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {open && (request.allowResponses || request.mine) ? (
            <form
              onSubmit={(event) => {
                const formEl = event.currentTarget;
                const body = text(event, "reply");
                void run(async () => {
                  const result = await api<{ waiting: boolean }>(
                    `${base}/responses`,
                    { body: { body } },
                  );
                  formEl.reset();
                  await load();
                  if (result.waiting) {
                    setNotice(
                      "Thank you. A moderator looks at it before it is shown.",
                    );
                  }
                });
              }}
              className="flex flex-col gap-4"
            >
              <Field
                id="reply"
                label={request.mine ? "Add an update" : "Write a word of encouragement"}
                hint={
                  request.mine
                    ? undefined
                    : "Encourage and pray. Do not give advice that was not asked for."
                }
              >
                <textarea
                  id="reply"
                  name="reply"
                  className="input"
                  rows={3}
                  required
                  minLength={2}
                  maxLength={600}
                />
              </Field>
              <div>
                <button type="submit" className="btn btn-ghost" disabled={busy}>
                  Send
                </button>
              </div>
            </form>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}
