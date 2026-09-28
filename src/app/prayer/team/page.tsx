"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { FormError } from "@/components/Field";
import PrayerCard from "@/components/PrayerCard";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import {
  ACCESS_LABELS,
  REPORT_CATEGORY_LABELS,
  REPORT_KIND_LABELS,
  type ManagedGroup,
  type ModerationQueue,
  type PrayerAbout,
  type PrayerRequest,
} from "@/lib/prayer";
import { useRequiredUser } from "@/lib/session";

const IDENTITY: Record<string, string> = {
  unverified: "ID not sent",
  pending: "ID waiting for a check",
  verified: "ID confirmed",
  rejected: "ID not accepted",
};

function Block({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="font-serif text-2xl">
        {title}{" "}
        <span className="font-sans text-base text-muted tabular-nums">
          {count}
        </span>
      </h2>
      {count === 0 ? <p className="text-sm text-muted">{empty}</p> : children}
    </section>
  );
}

/** Approve, or hide with a reason the author will read. */
function Decide({
  approveLabel,
  hideLabel,
  needsReason,
  busy,
  onDecide,
}: {
  approveLabel: string;
  hideLabel: string;
  needsReason: boolean;
  busy: boolean;
  onDecide: (action: "approve" | "hide", note?: string) => void;
}) {
  const [hiding, setHiding] = useState(false);

  if (hiding) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const note = String(new FormData(event.currentTarget).get("note"));
          onDecide("hide", note.trim());
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex min-w-64 flex-1 flex-col gap-1.5 text-sm font-medium">
          Reason the person will read
          <input
            name="note"
            className="input font-normal"
            placeholder="It names another person. Please take the name out."
            required
            minLength={10}
            maxLength={500}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary px-4 py-2 text-sm"
          disabled={busy}
        >
          {hideLabel}
        </button>
        <button
          type="button"
          className="btn btn-ghost px-4 py-2 text-sm"
          onClick={() => setHiding(false)}
        >
          Cancel
        </button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        className="btn btn-primary px-4 py-2 text-sm"
        disabled={busy}
        onClick={() => onDecide("approve")}
      >
        {approveLabel}
      </button>
      <button
        type="button"
        className="btn btn-ghost px-4 py-2 text-sm"
        disabled={busy}
        onClick={() => (needsReason ? setHiding(true) : onDecide("hide"))}
      >
        {hideLabel}
      </button>
    </div>
  );
}

function GroupRow({
  group,
  busy,
  onAct,
}: {
  group: ManagedGroup;
  busy: boolean;
  onAct: (action: "suspend" | "reinstate" | "close", note?: string) => void;
}) {
  const [asking, setAsking] = useState<null | "suspend" | "close">(null);
  const suspended = group.status === "suspended";

  return (
    <li className="flex flex-col gap-3 border-t border-line py-5 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <Link
            href={`/prayer/groups/${group.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {group.name}
          </Link>
          <span className="text-sm text-muted">
            {[
              ACCESS_LABELS[group.access],
              group.city && group.region
                ? `${group.city}, ${group.region}`
                : (group.city ?? group.region),
              group.members === 1 ? "1 member" : `${group.members} members`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="text-sm text-muted">
            {group.admins.length === 0
              ? "No admin"
              : `Admins: ${group.admins.join(", ")}`}
          </span>
        </div>
        <div className="flex flex-col gap-1 text-sm sm:items-end">
          <span className={suspended ? "font-medium" : "text-muted"}>
            {suspended ? "Suspended" : "Open"}
          </span>
          {group.openReports > 0 ? (
            <span className="font-medium tabular-nums">
              {group.openReports === 1
                ? "1 open report"
                : `${group.openReports} open reports`}
            </span>
          ) : null}
        </div>
      </div>
      {suspended && group.statusNote ? (
        <p className="text-sm">Reason: {group.statusNote}</p>
      ) : null}

      {asking ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const note = String(new FormData(event.currentTarget).get("note"));
            onAct(asking, note.trim());
            setAsking(null);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex min-w-64 flex-1 flex-col gap-1.5 text-sm font-medium">
            {asking === "suspend"
              ? "Why is the group suspended?"
              : "Why is the group closed?"}
            <input
              name="note"
              className="input font-normal"
              placeholder="The group's admins and members read this."
              required
              minLength={10}
              maxLength={500}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary px-4 py-2 text-sm"
            disabled={busy}
          >
            {asking === "suspend" ? "Suspend the group" : "Close for good"}
          </button>
          <button
            type="button"
            className="btn btn-ghost px-4 py-2 text-sm"
            onClick={() => setAsking(null)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {suspended ? (
            <button
              type="button"
              className="underline underline-offset-4"
              disabled={busy}
              onClick={() => onAct("reinstate")}
            >
              Open the group again
            </button>
          ) : (
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => setAsking("suspend")}
            >
              Suspend
            </button>
          )}
          <button
            type="button"
            className="text-muted underline underline-offset-4"
            onClick={() => setAsking("close")}
          >
            Close for good
          </button>
        </div>
      )}
    </li>
  );
}

export default function PrayerTeamPage() {
  const user = useRequiredUser();
  const [inbox, setInbox] = useState<PrayerRequest[] | null>(null);
  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [groups, setGroups] = useState<ManagedGroup[]>([]);
  const [about, setAbout] = useState<PrayerAbout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    // Someone may hold one of the two duties and not the other.
    const allowed = <T,>(request: Promise<T>) =>
      request.catch((err) => {
        if (err instanceof ApiError && err.status === 403) return null;
        throw err;
      });
    return Promise.all([
      allowed(api<PrayerRequest[]>("/prayer/team/inbox")),
      allowed(api<ModerationQueue>("/prayer/team/queue")),
      allowed(api<ManagedGroup[]>("/prayer/team/groups")),
    ]).then(([i, q, g]) => {
      setInbox(i);
      setQueue(q);
      setGroups(g ?? []);
      if (!i && !q) setError("Your account cannot open this page.");
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    load().catch((err) => setError(errorMessage(err)));
    api<PrayerAbout>("/prayer/about")
      .then(setAbout)
      .catch(() => undefined);
  }, [user, load]);

  async function act(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { body });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <AppShell>{null}</AppShell>;

  return (
    <AppShell user={user}>
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-serif text-4xl sm:text-5xl">Prayer team</h1>
        <p className="leading-7 text-muted">
          What is written here is given in trust. Pray, keep it in
          confidence, and do not contact anyone outside this site.
        </p>
      </div>

      <FormError message={error} />

      {queue && queue.mayNeedCare.length > 0 ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-gold-bright bg-gold-soft p-6">
          <h2 className="font-serif text-2xl">
            Someone may be in danger{" "}
            <span className="font-sans text-base tabular-nums">
              {queue.mayNeedCare.length}
            </span>
          </h2>
          <p className="max-w-2xl text-sm leading-6">
            These requests use words that suggest danger. Open each one and
            reply with care. Point the person to help. Do not promise a
            rescue, a cure, or a quick answer.
          </p>
          {about ? (
            <p className="max-w-2xl text-sm font-medium leading-6">
              {about.crisisResources}
            </p>
          ) : null}
          <ul className="grid gap-6 md:grid-cols-2">
            {queue.mayNeedCare.map((request) => (
              <li key={request.id}>
                <PrayerCard request={request} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inbox ? (
        <Block
          title="Sent to the prayer team"
          count={inbox.length}
          empty="No requests are waiting for prayer."
        >
          <ul className="grid gap-6 md:grid-cols-2">
            {inbox.map((request) => (
              <li key={request.id}>
                <PrayerCard request={request} />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {queue ? (
        <>
          <Block
            title="Requests for the network wall"
            count={queue.requests.length}
            empty="Nothing is waiting."
          >
            <ul className="flex flex-col">
              {queue.requests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-3 border-t border-line py-5 first:border-t-0"
                >
                  <p className="text-sm text-muted">
                    {request.by} · {formatMoment(request.at)}
                    {request.needsCare ? " · May need care" : ""}
                    {request.editedAt ? " · changed by the author" : ""}
                  </p>
                  <p className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">
                    {request.body}
                  </p>
                  <Decide
                    approveLabel="Share with the network"
                    hideLabel="Do not share"
                    needsReason
                    busy={busy}
                    onDecide={(action, note) =>
                      void act(`/prayer/team/requests/${request.id}`, {
                        action,
                        note,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </Block>

          <Block
            title="Replies waiting"
            count={queue.responses.length}
            empty="Nothing is waiting."
          >
            <ul className="flex flex-col">
              {queue.responses.map((reply) => (
                <li
                  key={reply.id}
                  className="flex flex-col gap-3 border-t border-line py-5 first:border-t-0"
                >
                  <p className="text-sm leading-6 text-muted">
                    {reply.by} replied to: “{reply.replyingTo}”
                  </p>
                  <p className="whitespace-pre-wrap break-words leading-7">
                    {reply.body}
                  </p>
                  <Decide
                    approveLabel="Show the reply"
                    hideLabel="Do not show"
                    needsReason={false}
                    busy={busy}
                    onDecide={(action) =>
                      void act(`/prayer/team/responses/${reply.id}`, { action })
                    }
                  />
                </li>
              ))}
            </ul>
          </Block>

          <Block
            title="Testimonies offered for publishing"
            count={queue.testimonies.length}
            empty="Nothing is waiting."
          >
            <ul className="flex flex-col">
              {queue.testimonies.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-3 border-t border-line py-5 first:border-t-0"
                >
                  <p className="text-sm leading-6 text-muted">
                    The request: “{t.request}”
                  </p>
                  <p className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">
                    {t.testimony}
                  </p>
                  <p className="text-sm text-muted">
                    Check that nothing here could point to a person. It is
                    published for anyone to read.
                  </p>
                  <Decide
                    approveLabel="Publish"
                    hideLabel="Keep private"
                    needsReason={false}
                    busy={busy}
                    onDecide={(action) =>
                      void act(`/prayer/team/testimonies/${t.id}`, { action })
                    }
                  />
                </li>
              ))}
            </ul>
          </Block>

          <Block
            title="Reports"
            count={queue.reports.length}
            empty="Nothing is reported."
          >
            <ul className="flex flex-col">
              {queue.reports.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-col gap-2 border-t border-line py-5 first:border-t-0"
                >
                  <p className="text-sm text-muted">
                    {REPORT_KIND_LABELS[report.kind] ?? report.kind}
                    {report.groupName ? (
                      <>
                        {" in "}
                        <Link
                          href={`/prayer/groups/${report.groupId}`}
                          className="underline underline-offset-4"
                        >
                          {report.groupName}
                        </Link>
                      </>
                    ) : (
                      " on the network wall"
                    )}{" "}
                    · reported {formatMoment(report.at)}
                    {report.reports > 1 ? ` · ${report.reports} reports` : ""}
                  </p>
                  <p className="font-medium">
                    {REPORT_CATEGORY_LABELS[report.category] ?? report.category}
                  </p>
                  {report.memberName ? (
                    <p className="leading-7">
                      About the member <strong>{report.memberName}</strong>
                    </p>
                  ) : null}
                  {report.text ? (
                    <p className="whitespace-pre-wrap break-words border-l-2 border-line pl-4 leading-7">
                      {report.text}
                    </p>
                  ) : null}
                  <p className="text-sm">What they said: {report.reason}</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn btn-ghost px-4 py-2 text-sm"
                      disabled={busy}
                      onClick={() =>
                        void act(`/prayer/reports/${report.id}/resolve`, {
                          action: "remove",
                        })
                      }
                    >
                      {report.kind === "group"
                        ? "Suspend the group"
                        : report.kind === "member"
                          ? "Remove the member from the group"
                          : "Remove it"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-4 py-2 text-sm"
                      disabled={busy}
                      onClick={() =>
                        void act(`/prayer/reports/${report.id}/resolve`, {
                          action: "keep",
                        })
                      }
                    >
                      {report.kind === "group" || report.kind === "member"
                        ? "No action needed"
                        : "It is fine, keep it"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Block>

          <Block
            title="New groups to approve"
            count={queue.groups.length}
            empty="No groups are waiting."
          >
            <ul className="flex flex-col">
              {queue.groups.map((group) => (
                <li
                  key={group.id}
                  className="flex flex-col gap-3 border-t border-line py-5 first:border-t-0"
                >
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/prayer/groups/${group.id}`}
                      className="font-serif text-xl underline-offset-4 hover:underline"
                    >
                      {group.name}
                    </Link>
                    <p className="text-sm text-muted">
                      {[
                        group.language,
                        group.city && group.region
                          ? `${group.city}, ${group.region}`
                          : (group.city ?? group.region),
                        group.church,
                        ACCESS_LABELS[group.access],
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {group.description}
                  </p>
                  {group.membershipRules ? (
                    <p className="text-sm">For: {group.membershipRules}</p>
                  ) : null}
                  {group.groupRules ? (
                    <p className="whitespace-pre-wrap text-sm">
                      Own rules: {group.groupRules}
                    </p>
                  ) : null}
                  <p className="text-sm text-muted">
                    Check that the group does not shut people out by race,
                    color, or where they come from.
                  </p>
                  <p className="text-sm">
                    Started by <strong>{group.leader}</strong>, who becomes
                    its admin ·{" "}
                    <span className="break-all">{group.leaderEmail}</span> ·{" "}
                    {IDENTITY[group.leaderIdentity] ?? group.leaderIdentity}
                  </p>
                  <Decide
                    approveLabel="Approve the group"
                    hideLabel="Do not approve"
                    needsReason
                    busy={busy}
                    onDecide={(action, note) =>
                      void act(`/prayer/team/groups/${group.id}`, {
                        action: action === "approve" ? "approve" : "decline",
                        note,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </Block>
          <Block
            title="All groups"
            count={groups.length}
            empty="No groups are open."
          >
            <ul className="flex flex-col">
              {groups.map((group) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  busy={busy}
                  onAct={(action, note) =>
                    void act(`/prayer/team/groups/${group.id}/status`, {
                      action,
                      note,
                    })
                  }
                />
              ))}
            </ul>
          </Block>
        </>
      ) : null}
    </AppShell>
  );
}
