"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import MyGifts from "@/components/MyGifts";
import { FormError } from "@/components/Field";
import { api, errorMessage, type Giving } from "@/lib/api";
import { formatCents, formatMoment } from "@/lib/format";
import { useRequiredUser } from "@/lib/session";

const STATUS_LABELS: Record<string, string> = {
  active: "Pledged",
  withdrawn: "You withdrew this",
  released: "Released",
};

export default function GivingPage() {
  const user = useRequiredUser();
  const [giving, setGiving] = useState<Giving | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Giving>("/giving").then(setGiving), []);

  useEffect(() => {
    if (!user) return;
    load().catch((err) => setError(errorMessage(err)));
  }, [user, load]);

  async function withdraw(id: string) {
    setBusy(true);
    setError(null);
    setConfirming(null);
    try {
      await api(`/giving/${id}/withdraw`, { method: "POST" });
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl sm:text-5xl">My giving</h1>
        <Link href="/needs" className="btn btn-primary">
          See open needs
        </Link>
      </div>

      <FormError message={error} />

      {giving ? (
        <>
          <section
            aria-label="Your Angel profile"
            className="flex max-w-md flex-col gap-4 rounded-2xl border border-line bg-surface p-6"
          >
            <p className="font-mono text-sm">
              {giving.angelRef
                ? `Faceless Angel #${giving.angelRef}`
                : "You get your Angel name with your first pledge"}
            </p>
            <dl className="flex flex-col text-sm tabular-nums">
              <div className="flex justify-between gap-4 border-b border-line py-2.5">
                <dt className="text-muted">Needs you have pledged to</dt>
                <dd className="font-medium">{giving.needsPledgedTo}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-line py-2.5">
                <dt className="text-muted">Pledged now</dt>
                <dd className="font-medium">
                  {formatCents(giving.activePledgedCents)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">Member since</dt>
                <dd className="font-medium">
                  {new Date(giving.memberSince).getFullYear()}
                </dd>
              </div>
            </dl>
            <p className="text-sm">
              {giving.identityStatus === "verified" ? (
                <span className="font-medium text-verified">
                  ✓ Identity checked
                </span>
              ) : (
                <>
                  <span className="text-muted">
                    Your identity is not confirmed yet. It will be needed
                    before you can give.{" "}
                  </span>
                  <Link
                    href="/account"
                    className="underline underline-offset-4"
                  >
                    Send your ID
                  </Link>
                </>
              )}
            </p>
            <p className="text-sm leading-6 text-muted">
              Only you see this page. There is no leaderboard.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl">Your pledges</h2>
            {giving.pledges.length === 0 ? (
              <p className="text-muted">You have not pledged yet.</p>
            ) : (
              <ul className="flex flex-col">
                {giving.pledges.map((pledge) => {
                  const active = pledge.status === "active";
                  return (
                    <li
                      key={pledge.id}
                      className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-line py-5 last:border-b"
                    >
                      <div className="flex max-w-xl flex-col gap-1">
                        <span className="font-mono text-xs text-muted">
                          {pledge.need.ref} · {pledge.need.categoryLabel} ·{" "}
                          {pledge.need.city}, {pledge.need.region}
                        </span>
                        {pledge.need.summary ? (
                          pledge.need.listed ? (
                            <Link
                              href={`/needs/${pledge.need.ref}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {pledge.need.summary}
                            </Link>
                          ) : (
                            <span className="font-medium">
                              {pledge.need.summary}
                            </span>
                          )
                        ) : null}
                        <span className="text-sm text-muted">
                          {STATUS_LABELS[pledge.status] ?? pledge.status}{" "}
                          {formatMoment(pledge.at)}
                          {pledge.endedReason && pledge.status === "released"
                            ? `. ${pledge.endedReason}.`
                            : ""}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <span
                          className={`font-serif text-2xl tabular-nums ${
                            active ? "" : "text-muted line-through"
                          }`}
                        >
                          {formatCents(pledge.amountCents)}
                        </span>
                        {active ? (
                          confirming === pledge.id ? (
                            <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                              <button
                                type="button"
                                className="font-medium underline underline-offset-4"
                                disabled={busy}
                                onClick={() => void withdraw(pledge.id)}
                              >
                                Yes, withdraw
                              </button>
                              <button
                                type="button"
                                className="text-muted underline underline-offset-4"
                                onClick={() => setConfirming(null)}
                              >
                                Keep it
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="text-sm underline underline-offset-4"
                              disabled={busy}
                              onClick={() => setConfirming(pledge.id)}
                            >
                              Withdraw pledge
                            </button>
                          )
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <MyGifts />
    </AppShell>
  );
}
