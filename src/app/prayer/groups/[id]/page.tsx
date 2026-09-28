"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import GroupForm, { type GroupValues } from "@/components/GroupForm";
import PrayerCard from "@/components/PrayerCard";
import { Campaigns, Chains } from "@/components/PrayTogether";
import SessionList from "@/components/SessionList";
import { api, errorMessage } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import {
  ACCESS_LABELS,
  GROUP_ROLE_LABELS,
  TIMEZONES,
  type PrayerAbout,
  type PrayerGroupDetail,
  type PrayerReport,
  type PrayerRequest,
  type PrayerSession,
} from "@/lib/prayer";
import { useRequiredUser } from "@/lib/session";

function Section({
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

function Rules({ code }: { code: string }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
      {code
        .split("\n")
        .filter((line) => line.trim())
        .map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
    </ul>
  );
}

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const user = useRequiredUser();
  const router = useRouter();
  const [group, setGroup] = useState<PrayerGroupDetail | null>(null);
  const [sessions, setSessions] = useState<PrayerSession[]>([]);
  const [wall, setWall] = useState<PrayerRequest[]>([]);
  const [reports, setReports] = useState<PrayerReport[]>([]);
  const [about, setAbout] = useState<PrayerAbout | null>(null);
  const [missing, setMissing] = useState(false);
  const [panel, setPanel] = useState<null | "schedule" | "edit" | "leave">(null);
  const [place, setPlace] = useState("online");
  const [notice, setNotice] = useState<string | null>(null);
  // What the meeting provider told us about a session just scheduled.
  const [hostNotes, setHostNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `/prayer/groups/${id}`;

  const loadSessions = useCallback(
    () => api<PrayerSession[]>(`${base}/sessions`).then(setSessions),
    [base],
  );

  const load = useCallback(
    () =>
      api<PrayerGroupDetail>(base).then((detail) => {
        setGroup(detail);
        // The rest is for members of an open group.
        if (detail.myStatus !== "active" || detail.status !== "active") return;
        return Promise.all([
          api<PrayerSession[]>(`${base}/sessions`),
          api<PrayerRequest[]>(`${base}/requests`),
          detail.canModerate
            ? api<PrayerReport[]>(`${base}/reports`)
            : Promise.resolve([]),
        ]).then(([s, w, r]) => {
          setSessions(s);
          setWall(w);
          setReports(r);
        });
      }),
    [base],
  );

  useEffect(() => {
    if (!user) return;
    let active = true;
    load().catch(() => {
      if (active) setMissing(true);
    });
    api<PrayerAbout>("/prayer/about")
      .then((a) => active && setAbout(a))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, base, load]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
      setPanel(null);
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
        <h1 className="font-serif text-4xl">This group is not available</h1>
        <p className="max-w-xl leading-7 text-muted">
          It may be private, closed, or still waiting for approval.
        </p>
        <div>
          <Link href="/prayer/groups" className="btn btn-primary">
            See prayer groups
          </Link>
        </div>
      </AppShell>
    );
  }
  if (!group) return <AppShell user={user}>{null}</AppShell>;

  const inside = group.myStatus === "active" && group.status === "active";
  const pending = group.status === "pending";
  const canJoin =
    group.status === "active" &&
    (group.myStatus === "invited" ||
      (!group.myStatus || group.myStatus === "left"
        ? group.access === "open" || group.access === "apply"
        : false));
  const member = (userId: string, action: string, done: string) =>
    run(() => api(`${base}/members/${userId}`, { body: { action } }), done);

  function schedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const online = place !== "in_person";
    void run(async () => {
      const made = await api<{ created: number; notes: string[] }>(
        `${base}/sessions`,
        {
          body: {
            title: text("title"),
            startsLocal: text("startsLocal"),
            timezone: text("timezone"),
            durationMinutes: Number(text("durationMinutes")),
            capacity: text("capacity") ? Number(text("capacity")) : undefined,
            provider: online ? place : undefined,
            url: online ? text("url") : undefined,
            place: text("place") || undefined,
            notes: text("notes") || undefined,
            weeks: Number(text("weeks")),
          },
        },
      );
      setHostNotes(made.notes);
    }, "Scheduled.");
  }

  return (
    <AppShell user={user}>
      <Link href="/prayer/groups" className="text-sm text-muted hover:text-ink">
        ← Prayer groups
      </Link>

      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
          {[
            group.language,
            group.city && group.region
              ? `${group.city}, ${group.region}`
              : (group.city ?? group.region),
            group.meetsOnline ? "Online" : "In person",
            ACCESS_LABELS[group.access],
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl">{group.name}</h1>
        <p className="max-w-2xl whitespace-pre-wrap leading-7 text-muted">
          {group.description}
        </p>
        <dl className="flex max-w-2xl flex-col text-sm">
          {(
            [
              ["Led by", group.leaders.join(", ")],
              ["Meets", group.schedule],
              ["Theme", group.theme],
              ["Church", group.church],
              ["For", group.membershipRules],
              [
                "Members",
                group.memberCount === 1 ? "1 person" : `${group.memberCount} people`,
              ],
            ] as [string, string | null][]
          )
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div
                key={label}
                className="grid gap-1 border-t border-line py-2.5 first:border-t-0 sm:grid-cols-[8rem_1fr]"
              >
                <dt className="text-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      <FormError message={error} />
      {notice ? (
        <p role="status" className="text-sm text-verified">
          {notice}
        </p>
      ) : null}

      {hostNotes.length > 0 ? (
        <div
          role="status"
          className="flex max-w-2xl flex-col gap-2 rounded-xl border border-gold-bright bg-gold-soft p-5 text-sm leading-6"
        >
          <p className="font-medium">Before the session</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {hostNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {pending ? (
        <p className="max-w-2xl rounded-xl border border-line bg-surface p-5 leading-7">
          This group is waiting for a moderator to approve it. You can invite
          people and schedule sessions once it is approved.
        </p>
      ) : null}
      {group.myStatus === "applied" ? (
        <p className="max-w-2xl rounded-xl border border-line bg-surface p-5 leading-7">
          You asked to join. A leader will look at your request.
        </p>
      ) : null}
      {group.myStatus === "removed" ? (
        <p className="max-w-2xl rounded-xl border border-line bg-surface p-5 leading-7">
          A leader removed you from this group. Contact the prayer team if you
          think this is a mistake.
        </p>
      ) : null}

      {canJoin ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => api(`${base}/join`, { body: { acceptCode: true } }),
              group.access === "apply" && group.myStatus !== "invited"
                ? "You asked to join."
                : "Welcome to the group.",
            );
          }}
          className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-line bg-surface p-6"
        >
          <h2 className="font-serif text-2xl">
            {group.myStatus === "invited"
              ? "You are invited to this group"
              : "Join this group"}
          </h2>
          <p className="text-sm text-muted">The group&apos;s code of conduct:</p>
          <Rules code={group.codeOfConduct} />
          <label className="flex items-start gap-3 leading-6">
            <input
              id="acceptCode"
              type="checkbox"
              className="mt-1.5 size-4"
              required
            />
            <span>I agree to keep this code of conduct.</span>
          </label>
          {user.emailVerified ? null : (
            <p className="text-sm">
              Confirm your email first. Use the link we sent you, or the
              button at the top of the page.
            </p>
          )}
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !user.emailVerified}
            >
              {group.myStatus === "invited"
                ? "Accept and join"
                : group.access === "apply"
                  ? "Ask to join"
                  : "Join"}
            </button>
          </div>
        </form>
      ) : null}

      {!inside && !canJoin && !group.myStatus && group.status === "active" ? (
        <p className="max-w-2xl text-sm leading-6 text-muted">
          People join this group by invitation from a leader.
        </p>
      ) : null}

      {inside ? (
        <>
          <Section id="sessions" title="Coming sessions">
            {sessions.length === 0 ? (
              <p className="text-sm text-muted">No sessions are scheduled.</p>
            ) : (
              <SessionList
                sessions={sessions}
                canLead={group.canLead}
                onChanged={loadSessions}
              />
            )}
            {group.canLead ? (
              panel === "schedule" ? (
                <form
                  onSubmit={schedule}
                  className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2"
                >
                  <Field id="title" label="Title">
                    <input
                      id="title"
                      name="title"
                      className="input"
                      placeholder="Evening prayer"
                      required
                      minLength={3}
                      maxLength={120}
                    />
                  </Field>
                  <Field id="startsLocal" label="Date and time">
                    <input
                      id="startsLocal"
                      name="startsLocal"
                      type="datetime-local"
                      className="input"
                      required
                    />
                  </Field>
                  <Field id="timezone" label="Time zone">
                    <select
                      id="timezone"
                      name="timezone"
                      className="input"
                      defaultValue={group.timezone}
                    >
                      {TIMEZONES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="durationMinutes" label="Length in minutes">
                    <input
                      id="durationMinutes"
                      name="durationMinutes"
                      type="number"
                      className="input"
                      defaultValue={60}
                      min={5}
                      max={600}
                      required
                    />
                  </Field>
                  <Field id="session-place" label="Where">
                    <select
                      id="session-place"
                      className="input"
                      value={place}
                      onChange={(event) => setPlace(event.target.value)}
                    >
                      {place === "online" ? (
                        <option value="online" disabled>
                          Choose
                        </option>
                      ) : null}
                      {about?.providers.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name}
                        </option>
                      ))}
                      <option value="in_person">In person only</option>
                    </select>
                  </Field>
                  {place === "in_person" ? null : (
                    <Field
                      id="url"
                      label="Join link"
                      hint={
                        place === "patvero"
                          ? "Make the meeting in Patvero, then paste its link. It looks like https://www.patvero.com/?room=abc12-xyz9q. Members see it only after they say they are coming."
                          : "Paste the link from the meeting you made. Members see it only after they say they are coming."
                      }
                    >
                      <input
                        id="url"
                        name="url"
                        type="url"
                        className="input"
                        placeholder="https://"
                        required
                      />
                    </Field>
                  )}
                  <Field
                    id="place"
                    label={
                      place === "in_person"
                        ? "Where you meet"
                        : "Also meeting in person at (optional)"
                    }
                  >
                    <input
                      id="place"
                      name="place"
                      className="input"
                      required={place === "in_person"}
                      maxLength={200}
                    />
                  </Field>
                  <Field
                    id="capacity"
                    label="Most people who can come (optional)"
                  >
                    <input
                      id="capacity"
                      name="capacity"
                      type="number"
                      className="input"
                      min={2}
                      max={5000}
                    />
                  </Field>
                  <Field id="weeks" label="Repeat weekly for">
                    <select id="weeks" name="weeks" className="input">
                      <option value="1">This once</option>
                      <option value="4">4 weeks</option>
                      <option value="8">8 weeks</option>
                      <option value="12">12 weeks</option>
                      <option value="26">26 weeks</option>
                    </select>
                  </Field>
                  <Field id="notes" label="Notes for members (optional)">
                    <input
                      id="notes"
                      name="notes"
                      className="input"
                      maxLength={1000}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-3 sm:col-span-2">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={busy || place === "online"}
                    >
                      Schedule
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setPanel(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setPlace(about?.providers[0]?.key ?? "online");
                      setPanel("schedule");
                    }}
                  >
                    Schedule a session
                  </button>
                </div>
              )
            ) : null}
          </Section>

          <Section id="campaigns" title="Campaigns">
            <Campaigns groupId={group.id} canLead={group.canLead} />
          </Section>

          <Section id="chains" title="Prayer chains">
            <Chains
              groupId={group.id}
              canLead={group.canLead}
              timezone={group.timezone}
            />
          </Section>

          <Section id="wall" title="Prayer requests in this group">
            <div>
              <Link
                href={`/prayer/new?group=${group.id}`}
                className="btn btn-ghost"
              >
                Ask this group to pray
              </Link>
            </div>
            {wall.length === 0 ? (
              <p className="text-sm text-muted">No requests are open.</p>
            ) : (
              <ul className="grid gap-6 md:grid-cols-2">
                {wall.map((request) => (
                  <li key={request.id}>
                    <PrayerCard request={request} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {group.canModerate ? (
            <Section id="reports" title="Reports from members">
              {reports.length === 0 ? (
                <p className="text-sm text-muted">Nothing is reported.</p>
              ) : (
                <ul className="flex flex-col">
                  {reports.map((report) => (
                    <li
                      key={report.id}
                      className="flex flex-col gap-2 border-t border-line py-4 first:border-t-0"
                    >
                      <p className="text-sm text-muted">
                        {report.kind === "request" ? "A request" : "A reply"} ·
                        reported {formatMoment(report.at)}
                        {report.reports > 1
                          ? ` · ${report.reports} reports`
                          : ""}
                      </p>
                      <p className="whitespace-pre-wrap break-words leading-7">
                        {report.text}
                      </p>
                      <p className="text-sm">Reason given: {report.reason}</p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="btn btn-ghost px-4 py-2 text-sm"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              api(`/prayer/reports/${report.id}/resolve`, {
                                body: { action: "remove" },
                              }),
                            )
                          }
                        >
                          Remove it
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-4 py-2 text-sm"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              api(`/prayer/reports/${report.id}/resolve`, {
                                body: { action: "keep" },
                              }),
                            )
                          }
                        >
                          It is fine, keep it
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}

          <Section id="members" title="Members">
            {group.waiting && group.waiting.length > 0 ? (
              <ul className="flex flex-col rounded-xl border border-gold-bright bg-gold-soft px-5">
                {group.waiting.map((person) => (
                  <li
                    key={person.userId}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line py-3 text-sm first:border-t-0"
                  >
                    <span>
                      <span className="font-medium">{person.name}</span>{" "}
                      {person.status === "invited"
                        ? "was invited and has not answered"
                        : "asked to join"}
                    </span>
                    <span className="flex flex-wrap gap-x-4">
                      {person.status === "applied" ? (
                        <button
                          type="button"
                          className="font-medium underline underline-offset-4"
                          disabled={busy}
                          onClick={() =>
                            void member(person.userId, "approve", "Approved.")
                          }
                        >
                          Approve
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        disabled={busy}
                        onClick={() =>
                          void member(person.userId, "remove", "Done.")
                        }
                      >
                        {person.status === "applied"
                          ? "Decline"
                          : "Withdraw invitation"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="flex flex-col text-sm">
              {group.members?.map((person) => (
                <li
                  key={person.userId}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line py-3 first:border-t-0"
                >
                  <span>
                    <span className="font-medium">{person.name}</span>
                    {person.isYou ? " (you)" : ""}
                    <span className="text-muted">
                      {" · "}
                      {GROUP_ROLE_LABELS[person.role]}
                    </span>
                  </span>
                  {group.canLead && !person.isYou ? (
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <select
                        id={`role-${person.userId}`}
                        aria-label={`Role for ${person.name}`}
                        className="input w-auto py-1.5"
                        value={person.role}
                        disabled={busy}
                        onChange={(event) =>
                          void member(
                            person.userId,
                            `make_${event.target.value}`,
                            "Saved.",
                          )
                        }
                      >
                        {Object.entries(GROUP_ROLE_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        disabled={busy}
                        onClick={() =>
                          void member(person.userId, "remove", "Removed.")
                        }
                      >
                        Remove
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>

            {group.canLead ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const formEl = event.currentTarget;
                  const email = String(
                    new FormData(formEl).get("email"),
                  ).trim();
                  void run(async () => {
                    await api(`${base}/invite`, { body: { email } });
                    formEl.reset();
                  }, `We sent an invitation to ${email}.`);
                }}
                className="flex max-w-xl flex-wrap items-end gap-3"
              >
                <div className="min-w-56 flex-1">
                  <Field id="invite-email" label="Invite someone by email">
                    <input
                      id="invite-email"
                      name="email"
                      type="email"
                      className="input"
                      autoComplete="off"
                      required
                    />
                  </Field>
                </div>
                <button type="submit" className="btn btn-ghost" disabled={busy}>
                  Send invitation
                </button>
              </form>
            ) : null}
          </Section>

          <Section id="code" title="Code of conduct">
            <Rules code={group.codeOfConduct} />
            <p className="text-sm leading-6 text-muted">
              To report something, open the request and choose Report. The
              leaders of this group look at every report.
            </p>
          </Section>
        </>
      ) : null}

      {group.myStatus === "active" ? (
        <section className="flex flex-col gap-4 border-t border-line pt-6">
          {panel === "edit" ? (
            <GroupForm
              group={group}
              submitLabel="Save changes"
              error={null}
              busy={busy}
              onSubmit={(values: GroupValues) =>
                void run(
                  () => api(base, { method: "PATCH", body: values }),
                  "Saved.",
                )
              }
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {group.canLead && panel !== "edit" ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPanel("edit")}
              >
                Change group details
              </button>
            ) : null}
            {panel === "leave" ? (
              <>
                <span>
                  Leave this group? Your requests come off its wall.
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`${base}/leave`, { method: "POST" });
                      router.push("/prayer");
                    })
                  }
                >
                  Yes, leave
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setPanel(null)}
                >
                  Stay
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPanel("leave")}
              >
                Leave group
              </button>
            )}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
