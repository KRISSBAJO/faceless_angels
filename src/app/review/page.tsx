"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { FormError } from "@/components/Field";
import { api, ApiError, type ReviewSummary } from "@/lib/api";
import {
  daysSince,
  formatCents,
  formatDay,
  STATE_LABELS,
} from "@/lib/format";
import { useRequiredUser } from "@/lib/session";

function Group({
  title,
  empty,
  cases,
}: {
  title: string;
  empty: string;
  cases: ReviewSummary[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl">
        {title}{" "}
        <span className="font-sans text-base text-muted tabular-nums">
          {cases.length}
        </span>
      </h2>
      {cases.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-xs uppercase tracking-[0.08em] text-muted">
                <th className="py-2 pr-4 font-semibold">Case</th>
                <th className="py-2 pr-4 font-semibold">Need</th>
                <th className="py-2 pr-4 text-right font-semibold">Amount</th>
                <th className="py-2 pr-4 font-semibold">Due</th>
                <th className="py-2 pr-4 font-semibold">Waiting</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b border-line">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/review/${c.id}`}
                      className="font-mono font-medium underline underline-offset-4"
                    >
                      {c.publicRef}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    {c.categoryLabel}
                    <span className="block text-muted">
                      {c.kind === "quick" ? "Small request · " : ""}
                      {c.city}, {c.region}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatCents(c.amountRequestedCents)}
                  </td>
                  <td className="py-3 pr-4">
                    {c.dueDate ? formatDay(c.dueDate) : "No date"}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {c.submittedAt
                      ? `${daysSince(c.submittedAt)} d`
                      : ""}
                  </td>
                  <td className="py-3">
                    {STATE_LABELS[c.state] ?? c.state}
                    {c.state === "published" && c.approvedAmountCents ? (
                      <span className="block text-muted tabular-nums">
                        {formatCents(c.pledgedCents)} of{" "}
                        {formatCents(c.approvedAmountCents)} pledged
                      </span>
                    ) : null}
                    {c.state === "appealed" && c.decidedByMe ? (
                      <span className="block text-muted">
                        You decided first. Someone else must take it.
                      </span>
                    ) : null}
                    {c.assigned && !c.assignedToMe ? (
                      <span className="block text-muted">
                        With {c.reviewerName}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ReviewQueuePage() {
  const user = useRequiredUser();
  const [cases, setCases] = useState<ReviewSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<ReviewSummary[]>("/review/cases")
      .then((rows) => {
        if (active) setCases(rows);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Try again.");
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return <AppShell>{null}</AppShell>;

  const decided = ["approved", "published"];
  const open = cases?.filter((c) => !decided.includes(c.state)) ?? [];
  const mine = open.filter((c) => c.assignedToMe);
  const toList = cases?.filter((c) => c.state === "approved") ?? [];
  const listed = cases?.filter((c) => c.state === "published") ?? [];
  const waiting = open.filter((c) => !c.assigned && c.state === "submitted");
  const appeals = open.filter((c) => !c.assigned && c.state === "appealed");
  const others = open.filter((c) => c.assigned && !c.assignedToMe);

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl sm:text-5xl">Review queue</h1>
        <p className="max-w-2xl leading-7 text-muted">
          Requests with the nearest due date come first. Opening a case is
          recorded in its audit log.
        </p>
      </div>

      <FormError message={error} />

      {cases ? (
        <>
          <Group
            title="With you"
            empty="You have no requests in hand."
            cases={mine}
          />
          <Group
            title="Waiting for a reviewer"
            empty="Nothing is waiting."
            cases={waiting}
          />
          <Group
            title="Appeals"
            empty="No appeals are waiting."
            cases={appeals}
          />
          <Group
            title="Approved, not yet listed"
            empty="Nothing is waiting to be listed."
            cases={toList}
          />
          <Group
            title="Listed for Angels"
            empty="No needs are listed."
            cases={listed}
          />
          <Group
            title="With other reviewers"
            empty="No one else has a request in hand."
            cases={others}
          />
        </>
      ) : null}
    </AppShell>
  );
}
