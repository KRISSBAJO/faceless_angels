import type { Need } from "@/lib/api";
import { formatCents, formatDay } from "@/lib/format";

export function Badges({ badges }: { badges: string[] }) {
  if (badges.length === 0) {
    return (
      <p className="text-sm text-muted">
        Approved by a reviewer. No separate checks are recorded.
      </p>
    );
  }
  return (
    <ul
      aria-label="Checks completed"
      className="flex flex-wrap gap-2 text-sm font-medium text-verified"
    >
      {badges.map((badge) => (
        <li key={badge} className="rounded-full bg-verified-soft px-3 py-1">
          ✓ {badge}
        </li>
      ))}
    </ul>
  );
}

export function PledgeProgress({ need }: { need: Need }) {
  const percent = Math.round((need.pledgedCents / need.amountCents) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label="Amount pledged"
        aria-valuemin={0}
        aria-valuemax={need.amountCents / 100}
        aria-valuenow={need.pledgedCents / 100}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-gold-bright"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between gap-4 text-sm tabular-nums text-muted">
        <span>{formatCents(need.pledgedCents)} pledged</span>
        <span>
          {need.remainingCents === 0
            ? "Fully pledged"
            : `${formatCents(need.remainingCents)} still needed`}
        </span>
      </div>
    </div>
  );
}

/** The header lines every view of a need shares. */
export function NeedFacts({ need }: { need: Need }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
      {need.categoryLabel} · {need.city}, {need.region}
      {need.dueDate ? ` · Due ${formatDay(need.dueDate)}` : ""}
    </p>
  );
}
