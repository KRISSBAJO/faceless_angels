"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { FormError } from "@/components/Field";
import { api, ApiError, type CaseSummary } from "@/lib/api";
import {
  formatCents,
  formatDay,
  STATE_LABELS,
} from "@/lib/format";
import { useRequiredUser } from "@/lib/session";

export default function RequestsPage() {
  const user = useRequiredUser();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<CaseSummary[]>("/cases")
      .then((rows) => {
        if (active) setCases(rows);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Try again.");
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return <AppShell>{null}</AppShell>;

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl sm:text-5xl">My requests</h1>
        <Link href="/ask" className="btn btn-primary">
          Ask for help
        </Link>
      </div>

      <FormError message={error} />

      {cases && cases.length === 0 ? (
        <p className="leading-7 text-muted">
          You have not asked for help yet. When you do, you can follow your
          request here.
        </p>
      ) : null}

      {cases && cases.length > 0 ? (
        <ul className="flex flex-col">
          {cases.map((c) => (
            <li key={c.id} className="border-t border-line last:border-b">
              <Link
                href={`/requests/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5 hover:bg-surface"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-muted">
                    {c.publicRef}
                  </span>
                  <span className="font-medium">
                    {c.categoryLabel}
                    {c.providerName ? ` · ${c.providerName}` : ""}
                  </span>
                  <span className="text-sm text-muted">
                    {c.dueDate
                      ? `Due ${formatDay(c.dueDate)}`
                      : "Small request"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 sm:items-end">
                  <span className="font-serif text-2xl tabular-nums">
                    {formatCents(c.amountRequestedCents)}
                  </span>
                  <span className="text-sm text-muted">
                    {STATE_LABELS[c.state] ?? c.state}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}
