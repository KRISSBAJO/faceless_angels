"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ReceiptView } from "@/components/GivingDocument";
import PublicShell from "@/components/PublicShell";
import { api, errorMessage } from "@/lib/api";
import type { GiftReceipt } from "@/lib/giving";

function Receipt() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get("t");
  const [receipt, setReceipt] = useState<GiftReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = token ? `?t=${encodeURIComponent(token)}` : "";
    api<GiftReceipt>(`/giving/receipts/${encodeURIComponent(id)}${query}`)
      .then((r) => active && setReceipt(r))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [id, token]);

  if (error) {
    return (
      <p className="text-muted">
        {error} If this is your gift, sign in with the email you gave with.
      </p>
    );
  }
  return receipt ? <ReceiptView receipt={receipt} /> : <p className="text-muted">Loading your receipt…</p>;
}

export default function ReceiptPage() {
  return (
    <PublicShell>
      <Suspense fallback={null}>
        <Receipt />
      </Suspense>
    </PublicShell>
  );
}
