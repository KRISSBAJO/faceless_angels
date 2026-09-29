"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { StatementView } from "@/components/GivingDocument";
import { api, errorMessage } from "@/lib/api";
import type { GivingStatement } from "@/lib/giving";
import { useRequiredUser } from "@/lib/session";

function Statement() {
  const user = useRequiredUser();
  const { year } = useParams<{ year: string }>();
  const currency = useSearchParams().get("currency") ?? "usd";
  const [statement, setStatement] = useState<GivingStatement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<GivingStatement>(
      `/giving/statements/${encodeURIComponent(year)}?currency=${encodeURIComponent(currency)}`,
    )
      .then((s) => active && setStatement(s))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [user, year, currency]);

  return (
    <AppShell user={user}>
      {error ? (
        <p className="text-muted">{error}</p>
      ) : statement ? (
        <StatementView statement={statement} />
      ) : (
        <p className="text-muted">Loading your statement…</p>
      )}
    </AppShell>
  );
}

export default function StatementPage() {
  return (
    <Suspense fallback={null}>
      <Statement />
    </Suspense>
  );
}
