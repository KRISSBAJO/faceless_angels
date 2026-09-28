"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { FormError } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";
import { useRequiredUser } from "@/lib/session";

type Problem =
  | "not_configured"
  | "key_rejected"
  | "missing_scope"
  | "rate_limited"
  | "unavailable";

interface PatveroMeeting {
  id: string;
  title: string;
  type: string | null;
  startsAt: string | null;
  durationMinutes: number | null;
  timeZone: string | null;
  status: string | null;
}

interface PatveroConnection {
  configured: boolean;
  problem: Problem | null;
  workspace?: {
    name: string;
    status: string | null;
    keyName: string | null;
    scopes: string[];
  };
  meetings?: PatveroMeeting[] | null;
  meetingsProblem?: Problem | null;
}

const PROBLEMS: Record<Problem, string> = {
  not_configured:
    "No Patvero key is set. In Patvero, open Workspace → Developer API and make a key for Faceless Angels with the workspace.read and meetings.read scopes. Put it in PATVERO_API_KEY on the API server, then restart the API.",
  key_rejected:
    "Patvero turned the key down. It may have expired, been revoked, or been copied wrongly. Make a new key in Patvero and replace PATVERO_API_KEY.",
  missing_scope:
    "The key works but is missing a scope. Make a new key with workspace.read and meetings.read.",
  rate_limited:
    "Patvero asked us to slow down. Try again in a minute.",
  unavailable:
    "Patvero could not be reached just now. Try again in a minute.",
};

function when(meeting: PatveroMeeting) {
  if (!meeting.startsAt) return "No time set";
  const start = new Date(meeting.startsAt);
  const text = start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: meeting.timeZone ?? undefined,
    timeZoneName: "short",
  });
  return meeting.durationMinutes ? `${text} · ${meeting.durationMinutes} min` : text;
}

export default function ConnectionsPage() {
  const user = useRequiredUser();
  const [patvero, setPatvero] = useState<PatveroConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  function check() {
    setChecking(true);
    setError(null);
    api<PatveroConnection>("/admin/connections/patvero")
      .then(setPatvero)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setChecking(false));
  }

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    let active = true;
    api<PatveroConnection>("/admin/connections/patvero")
      .then((result) => active && setPatvero(result))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;

  const connected = patvero?.configured && !patvero.problem;

  return (
    <AdminShell
      user={user}
      title="Connections"
      intro="Other services Faceless Angels reads from. Keys stay on the server and are never shown here."
    >
      <FormError message={error} />

      <section className="flex max-w-3xl flex-col gap-5 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-2xl">Patvero</h2>
            <p className="text-sm text-muted">
              Read-only. Faceless Angels can see your workspace and its
              meetings, and cannot change anything in Patvero.
            </p>
          </div>
          {patvero ? (
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                connected
                  ? "bg-verified-soft text-verified"
                  : "bg-gold-soft text-gold"
              }`}
            >
              {connected
                ? "✓ Connected"
                : patvero.configured
                  ? "Needs attention"
                  : "Not set up"}
            </span>
          ) : null}
        </div>

        {!patvero && !error ? (
          <p className="text-sm text-muted">Checking the connection…</p>
        ) : null}

        {patvero?.problem ? (
          <p className="rounded-lg border border-line px-4 py-3 text-sm leading-6">
            {PROBLEMS[patvero.problem]}
          </p>
        ) : null}

        {patvero?.workspace ? (
          <dl className="flex flex-col text-sm">
            <div className="flex justify-between gap-6 border-b border-line py-2.5">
              <dt className="text-muted">Workspace</dt>
              <dd className="font-medium">{patvero.workspace.name}</dd>
            </div>
            {patvero.workspace.keyName ? (
              <div className="flex justify-between gap-6 border-b border-line py-2.5">
                <dt className="text-muted">Key name</dt>
                <dd>{patvero.workspace.keyName}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-6 py-2.5">
              <dt className="text-muted">Allowed to read</dt>
              <dd className="text-right font-mono text-xs">
                {patvero.workspace.scopes.join(", ") || "Nothing"}
              </dd>
            </div>
          </dl>
        ) : null}

        {connected ? (
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <h3 className="font-medium">Coming meetings in Patvero</h3>
            {patvero?.meetingsProblem ? (
              <p className="text-sm leading-6 text-muted">
                {PROBLEMS[patvero.meetingsProblem]}
              </p>
            ) : patvero?.meetings && patvero.meetings.length > 0 ? (
              <ul className="flex flex-col text-sm">
                {patvero.meetings.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 last:border-b-0"
                  >
                    <span className="font-medium">{m.title}</span>
                    <span className="text-muted tabular-nums">{when(m)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                No scheduled meetings in this workspace.
              </p>
            )}
            <p className="text-xs leading-5 text-muted">
              To use one for a prayer session, copy its join link in Patvero
              and paste it into the session. Patvero does not share join links
              through this connection yet.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={check}
          disabled={checking}
          className="btn btn-ghost self-start px-4 py-2 text-sm"
        >
          {checking ? "Checking…" : "Check again"}
        </button>
      </section>
    </AdminShell>
  );
}
