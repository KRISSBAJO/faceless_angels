"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import PublicShell from "@/components/PublicShell";
import { api } from "@/lib/api";
import { money, type CheckoutStatus } from "@/lib/giving";

const TRIES = 20;

function Thanks() {
  const id = useSearchParams().get("checkout") ?? "";
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  // The payment company tells our server, not the browser, so ask until it has.
  useEffect(() => {
    if (!id) return;
    let active = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    function ask() {
      api<CheckoutStatus>(`/giving/checkouts/${encodeURIComponent(id)}`)
        .then((s) => {
          if (!active) return;
          setStatus(s);
          if (s.status === "open" && ++tries < TRIES) timer = setTimeout(ask, 2500);
          else if (s.status === "open") setGaveUp(true);
        })
        .catch(() => active && setGaveUp(true));
    }
    ask();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);

  const paid = status?.status === "paid";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-6 text-center">
      {paid && status ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
            Gift received
          </p>
          <h1 className="font-serif text-4xl leading-tight">Thank you</h1>
          <p className="leading-7 text-muted">
            Your {status.kind === "monthly" ? "monthly " : ""}gift of{" "}
            <span className="font-medium text-ink tabular-nums">
              {money(status.amount, status.currency)}
            </span>{" "}
            keeps Faceless Angels running. A receipt is on its way to your email.
          </p>
          {status.testMode ? (
            <p className="text-sm text-muted">This was a test payment. No real money moved.</p>
          ) : null}
          <p className="text-sm italic text-muted">
            “God loveth a cheerful giver.” 2 Corinthians 9:7 (KJV)
          </p>
        </>
      ) : gaveUp || !id ? (
        <>
          <h1 className="font-serif text-4xl leading-tight">Still waiting to hear</h1>
          <p className="leading-7 text-muted">
            The payment company has not confirmed this gift yet. If you paid,
            your receipt will arrive by email once it does. You will not be
            charged twice.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-serif text-4xl leading-tight">Confirming your gift…</h1>
          <p className="leading-7 text-muted">
            This usually takes a few seconds.
          </p>
        </>
      )}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link href="/transparency" className="btn btn-primary">
          See where the money goes
        </Link>
        <Link href="/" className="btn btn-ghost">
          Back to the home page
        </Link>
      </div>
    </div>
  );
}

export default function ThanksPage() {
  return (
    <PublicShell>
      <Suspense fallback={null}>
        <Thanks />
      </Suspense>
    </PublicShell>
  );
}
