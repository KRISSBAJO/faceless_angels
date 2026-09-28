"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { FormError } from "@/components/Field";
import { api, errorMessage, type AuditEntry } from "@/lib/api";
import { EVENT_LABELS, formatMoment, STATE_LABELS } from "@/lib/format";
import { ROLE_LABELS, useRequiredUser } from "@/lib/session";

const PAGE = 50;

const FILTERS: [string, string][] = [
  ["", "Everything"],
  ["case.", "Requests"],
  ["evidence.", "Documents"],
  ["identity.", "IDs"],
  ["user.", "Accounts"],
  ["invite.", "Invitations"],
  ["category.", "Need types"],
  ["policy.", "Agreement wording"],
];

function describe(value: string | null) {
  if (value === null) return null;
  // Setting changes store the whole before and after. Too long to show inline.
  if (value.startsWith("{")) return null;
  return STATE_LABELS[value] ?? ROLE_LABELS[value] ?? value;
}

export default function AuditPage() {
  const user = useRequiredUser();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(action: string, before?: number) {
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: String(PAGE) });
      if (action) query.set("action", action);
      if (before) query.set("before", String(before));
      const rows = await api<AuditEntry[]>(`/admin/audit?${query}`);
      setEntries((old) => (before ? [...old, ...rows] : rows));
      setMore(rows.length === PAGE);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    queueMicrotask(() => void load(filter));
  }, [user, filter]);

  if (!user) return null;

  return (
    <AdminShell
      user={user}
      title="Audit log"
      intro="Every change and every time staff open a case, a document, or an ID. Entries cannot be edited."
    >
      <label className="flex max-w-xs flex-col gap-1.5 text-sm font-medium">
        Show
        <select
          id="audit-filter"
          className="input font-normal"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          {FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <FormError message={error} />

      {entries.length === 0 && !busy ? (
        <p className="text-muted">Nothing recorded for this filter.</p>
      ) : null}

      {entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-xs uppercase tracking-[0.08em] text-muted">
                <th className="py-2 pr-4 font-semibold">When</th>
                <th className="py-2 pr-4 font-semibold">Who</th>
                <th className="py-2 pr-4 font-semibold">What</th>
                <th className="py-2 pr-4 font-semibold">On</th>
                <th className="py-2 font-semibold">Change</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const from = describe(entry.priorState);
                const to = describe(entry.newState);
                return (
                  <tr key={entry.id} className="border-b border-line align-top">
                    <td className="whitespace-nowrap py-2.5 pr-4 text-muted">
                      {formatMoment(entry.at)}
                    </td>
                    <td className="py-2.5 pr-4">{entry.by ?? "System"}</td>
                    <td className="py-2.5 pr-4">
                      {EVENT_LABELS[entry.action] ?? entry.action}
                    </td>
                    <td className="break-all py-2.5 pr-4 font-mono text-xs">
                      {entry.object}
                    </td>
                    <td className="py-2.5 text-muted">
                      {from && to && from !== to
                        ? `${from} → ${to}`
                        : (to ?? "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {more ? (
        <div>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void load(filter, entries.at(-1)?.id)}
          >
            Show older entries
          </button>
        </div>
      ) : null}
    </AdminShell>
  );
}
