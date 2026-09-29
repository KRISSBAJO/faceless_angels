"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { StatementView } from "@/components/GivingDocument";
import PublicShell from "@/components/PublicShell";
import { api, errorMessage } from "@/lib/api";
import type { GivingStatement } from "@/lib/giving";

/** A yearly statement opened from its emailed link. No sign-in needed. */
function LinkedStatement() {
  const params = useSearchParams();
  const id = params.get("s") ?? "";
  const token = params.get("t") ?? "";
  const [statement, setStatement] = useState<GivingStatement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<GivingStatement>(
      `/giving/statement-links/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`,
    )
      .then((s) => active && setStatement(s))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [id, token]);

  if (error) return <p className="text-muted">{error}</p>;
  return statement ? (
    <StatementView statement={statement} />
  ) : (
    <p className="text-muted">Loading your statement…</p>
  );
}

export default function LinkedStatementPage() {
  return (
    <PublicShell>
      <Suspense fallback={null}>
        <LinkedStatement />
      </Suspense>
    </PublicShell>
  );
}
