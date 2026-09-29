"use client";

import Link from "next/link";
import {
  longDate,
  money,
  type GiftReceipt,
  type GivingEntity,
  type GivingStatement,
} from "@/lib/giving";

/** The organisation block at the top of a receipt or statement. */
function Issuer({ entity }: { entity: GivingEntity }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span className="font-serif text-xl">{entity.legalName || "Faceless Angels"}</span>
      {entity.address ? (
        <span className="whitespace-pre-line text-muted">{entity.address}</span>
      ) : null}
      {entity.registrationNumber ? (
        <span className="text-muted">
          {entity.registrationLabel}: {entity.registrationNumber}
        </span>
      ) : null}
    </div>
  );
}

function Frame({
  title,
  number,
  entity,
  testMode,
  children,
  tax,
  issuedAt,
}: {
  title: string;
  number: string;
  entity: GivingEntity;
  testMode: boolean;
  children: React.ReactNode;
  tax: { exchange: string; status: string };
  issuedAt: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/giving" className="text-sm text-muted hover:text-ink">
          ← My giving
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-8 rounded-2xl border border-line bg-surface p-8 sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0">
        {testMode ? (
          <p className="rounded-lg border border-gold-bright bg-gold-soft px-4 py-2 text-center text-sm font-medium">
            Test payment. This is not a real gift and is not for tax use.
          </p>
        ) : null}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <Issuer entity={entity} />
          <div className="flex flex-col items-end gap-0.5 text-right text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">{title}</span>
            <span className="font-mono">{number}</span>
            <span className="text-muted">Issued {longDate(issuedAt)}</span>
          </div>
        </header>
        {children}
        <footer className="flex flex-col gap-2 border-t border-line pt-6 text-sm leading-6">
          <p>{tax.exchange}</p>
          <p className={entity.taxStatus === "recognised" ? "" : "font-medium"}>{tax.status}</p>
          <p className="text-muted">
            Gifts support the running of Faceless Angels. They do not go to a
            specific need.
          </p>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-0.5 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function ReceiptView({ receipt: r }: { receipt: GiftReceipt }) {
  return (
    <Frame
      title="Gift receipt"
      number={r.receiptNumber}
      entity={r.entity}
      testMode={r.testMode}
      tax={r.tax}
      issuedAt={r.issuedAt}
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">Received with thanks from</span>
        <span className="font-medium">{r.giver.name ?? r.giver.email}</span>
        {r.giver.name && r.giver.email ? (
          <span className="text-sm text-muted">{r.giver.email}</span>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-1">
        <span className="text-sm text-muted">Amount</span>
        <span className="font-serif text-5xl tabular-nums">{money(r.amount, r.currency)}</span>
      </div>
      <dl className="flex flex-col text-sm tabular-nums">
        <Row label="Date received" value={longDate(r.receivedAt)} />
        <Row label="Kind of gift" value={r.kind === "monthly" ? "Monthly gift" : "One-time gift"} />
        <Row label="Paid by" value={r.method} />
        <Row label="Payment reference" value={<span className="break-all font-mono text-xs">{r.reference}</span>} />
        {r.refunded > 0 ? (
          <Row
            label="Refunded"
            value={`${money(r.refunded, r.currency)}${r.status === "refunded" ? " (in full)" : ""}`}
          />
        ) : null}
      </dl>
    </Frame>
  );
}

export function StatementView({ statement: s }: { statement: GivingStatement }) {
  return (
    <Frame
      title={`Giving statement ${s.year}`}
      number={`${s.year} · ${s.currency.toUpperCase()}`}
      entity={s.entity}
      testMode={s.includesTest}
      tax={s.tax}
      issuedAt={s.issuedAt}
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted">Gifts from</span>
          <span className="font-medium">{s.giver.name ?? s.giver.email}</span>
          {s.giver.name ? <span className="text-sm text-muted">{s.giver.email}</span> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm text-muted">Total given in {s.year}</span>
          <span className="font-serif text-4xl tabular-nums">{money(s.total, s.currency)}</span>
        </div>
      </div>
      {s.gifts.length === 0 ? (
        <p className="text-muted">No gifts in {s.year}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-ink text-xs uppercase tracking-[0.1em] text-muted">
                <th className="py-2 pr-4 font-semibold">Date</th>
                <th className="py-2 pr-4 font-semibold">Receipt</th>
                <th className="py-2 pr-4 font-semibold">Kind</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {s.gifts.map((g) => (
                <tr key={g.receiptNumber} className="border-b border-line">
                  <td className="py-2 pr-4">{longDate(g.receivedAt)}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{g.receiptNumber}</td>
                  <td className="py-2 pr-4">{g.kind === "monthly" ? "Monthly" : "One-time"}</td>
                  <td className="py-2 text-right">
                    {money(g.kept, s.currency)}
                    {g.refunded > 0 ? (
                      <span className="block text-xs text-muted">
                        {money(g.amount, s.currency)} less {money(g.refunded, s.currency)} refunded
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 font-medium">Total</td>
                <td className="pt-3 text-right font-medium">{money(s.total, s.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Frame>
  );
}
