"use client";

import { useState } from "react";

const views = [
  { id: "recipient", label: "What the recipient sees" },
  { id: "platform", label: "What the platform records" },
] as const;

type ViewId = (typeof views)[number]["id"];

const record: [string, string][] = [
  ["Case", "FA-10492"],
  ["Requester identity", "Checked"],
  ["Bill", "Reviewed"],
  ["Balance with provider", "Confirmed, $212.60"],
  ["Prior assistance (12 months)", "1"],
  ["Duplicate documents", "None"],
  ["Reviewed by / payment approved by", "Two different people"],
  ["Funded by", "FA-3318, FA-7281"],
  ["Paid to", "Utility provider only"],
  ["Proof of payment", "Provider receipt on file"],
];

export default function CaseViews() {
  const [view, setView] = useState<ViewId>("recipient");

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Two views of the same gift"
        className="flex flex-wrap gap-2"
      >
        {views.map((v) => (
          <button
            key={v.id}
            id={`tab-${v.id}`}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            aria-controls={`panel-${v.id}`}
            onClick={() => setView(v.id)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              view === v.id
                ? "border-ink bg-ink text-surface"
                : "border-line bg-surface text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "recipient" ? (
        <div
          id="panel-recipient"
          role="tabpanel"
          aria-labelledby="tab-recipient"
          className="flex min-h-[22rem] flex-col justify-center gap-6 rounded-2xl border border-line bg-surface p-7 sm:p-10"
        >
          <p className="font-serif text-3xl leading-tight sm:text-4xl">
            A Faceless Angel covered your remaining balance.
          </p>
          <blockquote className="flex flex-col gap-2 border-l-2 border-gold-bright pl-5">
            <p className="font-serif text-lg italic">
              God is our refuge and strength, a very present help in trouble.
            </p>
            <cite className="text-sm not-italic text-muted">
              Psalm 46:1 (KJV)
            </cite>
          </blockquote>
          <p className="text-sm text-muted">
            No name. No amount beside a name. Nothing to repay.
          </p>
        </div>
      ) : (
        <div
          id="panel-platform"
          role="tabpanel"
          aria-labelledby="tab-platform"
          className="min-h-[22rem] rounded-2xl border border-line bg-surface p-7 sm:p-10"
        >
          <dl className="flex flex-col font-mono text-sm">
            {record.map(([label, value]) => (
              <div
                key={label}
                className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 last:border-b-0"
              >
                <dt className="text-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
