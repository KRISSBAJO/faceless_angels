"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { money, type MyGiving } from "@/lib/giving";

/** Gifts that support Faceless Angels itself, and monthly gifts to stop. */
export default function MyGifts() {
  const [data, setData] = useState<MyGiving | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statements, setStatements] = useState<
    { year: number; currency: string; gifts: number }[]
  >([]);

  const load = useCallback(() => api<MyGiving>("/giving/mine").then(setData), []);

  useEffect(() => {
    let active = true;
    api<MyGiving>("/giving/mine")
      .then((d) => active && setData(d))
      .catch((err) => active && setError(errorMessage(err)));
    api<{ year: number; currency: string; gifts: number }[]>("/giving/statements")
      .then((list) => active && setStatements(list))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function stop(id: string) {
    setBusy(true);
    setError(null);
    setConfirming(null);
    try {
      await api(`/giving/monthly/${id}/stop`, { method: "POST" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-2xl">Gifts to support Faceless Angels</h2>
        <Link href="/donate" className="text-sm font-medium underline underline-offset-4">
          Give again
        </Link>
      </div>
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
      {!data ? null : (
        <>
          {data.monthly.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4"
            >
              <span>
                <span className="font-medium tabular-nums">{money(m.amount, m.currency)}</span> every
                month since {new Date(m.since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                {m.testMode ? <span className="ml-2 text-xs text-muted">(test)</span> : null}
              </span>
              {confirming === m.id ? (
                <span className="flex gap-4 text-sm">
                  <button type="button" className="font-medium underline underline-offset-4" disabled={busy} onClick={() => void stop(m.id)}>
                    Yes, stop it
                  </button>
                  <button type="button" className="text-muted underline underline-offset-4" onClick={() => setConfirming(null)}>
                    Keep giving
                  </button>
                </span>
              ) : (
                <button type="button" className="text-sm underline underline-offset-4" onClick={() => setConfirming(m.id)}>
                  Stop monthly gift
                </button>
              )}
            </div>
          ))}
          {data.gifts.length === 0 ? (
            <p className="text-muted">
              No gifts yet.{" "}
              <Link href="/donate" className="underline underline-offset-4">
                Support the work
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col text-sm">
              {data.gifts.map((g) => (
                <li key={g.id} className="flex flex-wrap justify-between gap-3 border-t border-line py-3 last:border-b">
                  <span className="text-muted">
                    {new Date(g.receivedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                    {g.kind === "monthly" ? " · monthly" : ""}
                    {g.testMode ? " · test" : ""}
                    {g.status === "refunded" ? " · refunded" : ""}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="font-medium tabular-nums">{money(g.amount, g.currency)}</span>
                    <Link href={`/giving/receipts/${g.id}`} className="underline underline-offset-4">
                      Receipt
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {statements.length > 0 ? (
            <div className="flex flex-col gap-2 pt-2">
              <h3 className="font-medium">Yearly statements for your records</h3>
              <p className="text-sm text-muted">
                One document per year listing every gift, for the tax season.
                We also email it each January.
              </p>
              <ul className="flex flex-wrap gap-2 text-sm">
                {statements.map((st) => (
                  <li key={`${st.year}-${st.currency}`}>
                    <Link
                      href={`/giving/statements/${st.year}?currency=${st.currency}`}
                      className="inline-flex rounded-full border border-line bg-surface px-3.5 py-1.5 hover:border-ink"
                    >
                      {st.year} · {st.currency.toUpperCase()}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
