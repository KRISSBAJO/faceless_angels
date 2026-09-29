"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { FormError } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";
import { money, PROVIDER_NAMES, type Currency } from "@/lib/giving";
import { useRequiredUser } from "@/lib/session";

interface Overview {
  providers: {
    provider: "stripe" | "paystack";
    currency: Currency;
    ready: boolean;
    livemode: boolean;
    problem: string | null;
    lastWebhook: { last_event: string; received_at: string } | null;
  }[];
  gifts: {
    id: string;
    provider: "stripe" | "paystack";
    kind: string;
    currency: Currency;
    amount: number;
    fee: number | null;
    refunded: number;
    status: string;
    email: string | null;
    testMode: boolean;
    receivedAt: string;
    receiptSent: boolean;
  }[];
  entries: {
    id: string;
    kind: "expense" | "help";
    category: string;
    description: string;
    payee: string;
    currency: Currency;
    amount: number;
    paidOn: string;
    caseRef: string | null;
    status: "proposed" | "approved" | "rejected";
    proposedById: string;
    proposedBy: string;
    decidedBy: string | null;
    decisionNote: string | null;
    hasReceipt: boolean;
  }[];
  categories: { expense: Record<string, string>; help: Record<string, string> };
}

const WRITERS = ["admin", "payment_approver"];
const READERS = [...WRITERS, "auditor"];

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function MoneyPage() {
  const user = useRequiredUser();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    return api<Overview>("/finance/overview")
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!user || !READERS.includes(user.role)) return;
    let active = true;
    api<Overview>("/finance/overview")
      .then((d) => active && setData(d))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;
  if (!READERS.includes(user.role)) {
    return (
      <AdminShell user={user} title="Money">
        <p className="text-muted">This page is for the people who look after the money.</p>
      </AdminShell>
    );
  }
  const canWrite = WRITERS.includes(user.role);

  async function decide(id: string, outcome: "approved" | "rejected") {
    let note: string | undefined;
    if (outcome === "rejected") {
      const input = document.getElementById(`note-${id}`) as HTMLInputElement | null;
      note = input?.value.trim();
      if (!note) {
        setError("Say why it is rejected.");
        return;
      }
    }
    setError(null);
    try {
      await api(`/finance/entries/${id}/decision`, { body: { outcome, note } });
      setNotice(outcome === "approved" ? "Approved. It now shows on the public page." : "Rejected.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const waiting = data?.entries.filter((e) => e.status === "proposed") ?? [];
  const decided = data?.entries.filter((e) => e.status !== "proposed") ?? [];
  const label = (e: Overview["entries"][number]) =>
    (e.kind === "expense" ? data?.categories.expense : data?.categories.help)?.[e.category] ?? e.category;

  return (
    <AdminShell
      user={user}
      title="Money"
      intro="Gifts received, running costs, and help paid to people in need. Costs and help count only after a second person approves them."
    >
      <FormError message={error} />
      {notice ? (
        <p role="status" className="rounded-lg border border-line px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}

      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            {data.providers.map((p) => (
              <div key={p.provider} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">
                    {PROVIDER_NAMES[p.provider]} · {p.currency.toUpperCase()}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.ready ? "bg-verified-soft text-verified" : "bg-gold-soft text-gold"
                    }`}
                  >
                    {p.ready ? (p.livemode ? "Live" : "Test mode") : "Not set up"}
                  </span>
                </div>
                {p.problem ? <p className="text-sm leading-6 text-muted">{p.problem}</p> : null}
                <p className="text-xs leading-5 text-muted">
                  Webhook address:{" "}
                  <code className="break-all">
                    {typeof window === "undefined" ? "" : window.location.origin}/api/giving/webhooks/{p.provider}
                  </code>
                </p>
                <p className="text-xs text-muted">
                  {p.lastWebhook
                    ? `Last heard from ${PROVIDER_NAMES[p.provider]}: ${when(p.lastWebhook.received_at)} (${p.lastWebhook.last_event})`
                    : `Not heard from ${PROVIDER_NAMES[p.provider]} yet.`}
                </p>
              </div>
            ))}
          </section>

          {canWrite ? <EntryForm categories={data.categories} onSaved={async () => { setNotice("Recorded. Someone else must now check and approve it."); await load(); }} /> : null}

          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl">Waiting for a second check</h2>
            {waiting.length === 0 ? (
              <p className="text-sm text-muted">Nothing is waiting.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {waiting.map((e) => (
                  <li key={e.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {e.kind === "expense" ? "Cost" : "Help given"} · {label(e)}
                        </span>
                        <span>{e.description}</span>
                        <span className="text-muted">
                          Paid to {e.payee} on {e.paidOn}
                          {e.caseRef ? ` · request ${e.caseRef}` : ""} · recorded by {e.proposedBy}
                        </span>
                      </div>
                      <span className="font-serif text-2xl tabular-nums">{money(e.amount, e.currency)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={`/api/finance/entries/${e.id}/receipt`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                      >
                        Open the receipt
                      </a>
                      {!canWrite ? null : e.proposedById === user.id ? (
                        <span className="text-muted">You recorded this, so someone else must check it.</span>
                      ) : (
                        <>
                          <button type="button" className="btn btn-primary px-4 py-2 text-sm" onClick={() => void decide(e.id, "approved")}>
                            Approve
                          </button>
                          <input id={`note-${e.id}`} className="input max-w-xs text-sm" placeholder="Reason, if rejecting" aria-label="Reason for rejecting" />
                          <button type="button" className="btn btn-ghost px-4 py-2 text-sm" onClick={() => void decide(e.id, "rejected")}>
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl">Costs and help recorded</h2>
            {decided.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink text-xs uppercase tracking-[0.1em] text-muted">
                      <th className="py-2 pr-4 font-semibold">Paid on</th>
                      <th className="py-2 pr-4 font-semibold">What</th>
                      <th className="py-2 pr-4 font-semibold">Amount</th>
                      <th className="py-2 pr-4 font-semibold">Status</th>
                      <th className="py-2 font-semibold">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decided.map((e) => (
                      <tr key={e.id} className="border-b border-line align-top">
                        <td className="py-2.5 pr-4 tabular-nums">{e.paidOn}</td>
                        <td className="py-2.5 pr-4">
                          <span className="font-medium">{label(e)}</span> · {e.description}
                          <span className="block text-muted">Paid to {e.payee}</span>
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums">{money(e.amount, e.currency)}</td>
                        <td className="py-2.5 pr-4">
                          {e.status === "approved" ? `Approved by ${e.decidedBy}` : `Rejected by ${e.decidedBy}: ${e.decisionNote}`}
                        </td>
                        <td className="py-2.5">
                          <a href={`/api/finance/entries/${e.id}/receipt`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                            Open
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl">Gifts received</h2>
            <p className="text-sm text-muted">Givers&apos; addresses are private. They are never shown on the public page.</p>
            {data.gifts.length === 0 ? (
              <p className="text-sm text-muted">No gifts yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink text-xs uppercase tracking-[0.1em] text-muted">
                      <th className="py-2 pr-4 font-semibold">Received</th>
                      <th className="py-2 pr-4 font-semibold">Amount</th>
                      <th className="py-2 pr-4 font-semibold">Fee</th>
                      <th className="py-2 pr-4 font-semibold">Giver</th>
                      <th className="py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.gifts.map((g) => (
                      <tr key={g.id} className="border-b border-line">
                        <td className="py-2.5 pr-4">{when(g.receivedAt)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">
                          {money(g.amount, g.currency)}
                          {g.kind === "monthly" ? " monthly" : ""}
                          {g.testMode ? <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-xs text-gold">test</span> : null}
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums text-muted">{g.fee === null ? "Not known yet" : money(g.fee, g.currency)}</td>
                        <td className="py-2.5 pr-4 break-all">{g.email ?? "—"}</td>
                        <td className="py-2.5">
                          {g.status === "succeeded" ? (g.receiptSent ? "Received, receipt sent" : "Received") : g.status === "refunded" ? "Refunded" : "Disputed by the card holder"}
                          {g.refunded > 0 && g.status !== "refunded" ? ` (${money(g.refunded, g.currency)} refunded)` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}

function EntryForm({
  categories,
  onSaved,
}: {
  categories: Overview["categories"];
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"expense" | "help">("expense");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = kind === "expense" ? categories.expense : categories.help;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    form.set("kind", kind);
    if (!(form.get("receipt") as File | null)?.size) {
      setError("Attach the receipt or invoice. Nothing is recorded without one.");
      return;
    }
    if (kind === "expense") form.delete("caseRef");
    setBusy(true);
    setError(null);
    try {
      await api("/finance/entries", { body: form });
      formEl.reset();
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">Record money going out</h2>
        <div className="inline-flex rounded-full border border-line p-1 text-sm">
          {(
            [
              ["expense", "A running cost"],
              ["help", "Help paid to someone"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={`rounded-full px-4 py-1.5 font-medium ${kind === value ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {kind === "expense" ? "Kind of cost" : "Kind of need"}
          <select name="category" className="input font-normal" required defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            {Object.entries(list).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Paid to
          <input name="payee" className="input font-normal" required maxLength={120} placeholder={kind === "expense" ? "Render" : "Nashville Electric Service"} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
          What it was for
          <input name="description" className="input font-normal" required maxLength={300} placeholder={kind === "expense" ? "Website hosting for October" : "Electricity bill for a single-parent household"} />
        </label>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Currency
            <select name="currency" className="input font-normal" defaultValue="usd">
              <option value="usd">USD</option>
              <option value="ngn">NGN</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Amount
            <input name="amount" className="input font-normal tabular-nums" inputMode="decimal" required placeholder="120.00" />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Date paid
          <input name="paidOn" type="date" className="input font-normal" required max={new Date().toISOString().slice(0, 10)} />
        </label>
        {kind === "help" ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Request reference, if there is one
            <input name="caseRef" className="input font-normal" maxLength={20} placeholder="FA-10492" />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Receipt or invoice (PDF, JPG, or PNG)
          <input name="receipt" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="text-sm font-normal" required />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Record it"}
        </button>
        <span className="text-xs text-muted">It shows publicly only after someone else approves it.</span>
      </div>
    </form>
  );
}
