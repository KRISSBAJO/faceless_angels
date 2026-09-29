"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { FormError } from "@/components/Field";
import { api, errorMessage, type AdminOverview } from "@/lib/api";
import { STATE_LABELS } from "@/lib/format";
import { ROLE_LABELS, useRequiredUser } from "@/lib/session";

const MAIL_LABELS: Record<string, string> = {
  relykit: "RelyKit is sending email",
  smtp: "SMTP is sending email",
  log: "Email is going to the server log",
};

function QueueRow({ label, count, href, action }: { label: string; count: number; href?: string; action: string }) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-4">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold tabular-nums ${count ? "bg-gold-soft text-ink" : "bg-paper text-muted"}`}>{count}</span>
        <span className="min-w-0">
          <span className="block font-medium text-ink">{label}</span>
          <span className="block text-sm text-muted">{count ? `${count} waiting` : "Nothing waiting"}</span>
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium text-gold group-hover:underline">{action}</span>
    </>
  );
  const className = "group flex min-h-20 items-center justify-between gap-4 border-t border-line px-5 py-4 transition-colors hover:bg-paper sm:px-7";
  return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}

function Breakdown({ title, counts, labels, href }: { title: string; counts: Record<string, number>; labels: Record<string, string>; href?: string }) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div><h2 className="font-serif text-xl">{title}</h2><p className="mt-0.5 text-sm text-muted">{total} total</p></div>
        {href ? <Link href={href} className="shrink-0 text-sm font-medium text-gold hover:underline">View all →</Link> : null}
      </div>
      {rows.length ? (
        <dl className="px-5 py-2 text-sm sm:px-6">
          {rows.map(([key, count]) => (
            <div key={key} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="min-w-0 text-muted">{labels[key] ?? key}</dt>
              <dd className="font-semibold tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="px-5 py-5 text-sm text-muted sm:px-6">None yet.</p>}
    </section>
  );
}

export default function AdminOverviewPage() {
  const user = useRequiredUser();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<AdminOverview>("/admin/overview")
      .then((data) => active && setOverview(data))
      .catch((err) => active && setError(errorMessage(err)));
    return () => { active = false; };
  }, [user]);

  if (!user) return null;

  return (
    <AdminShell user={user} title="Overview" intro="The work waiting for your team, with a clear path into each section.">
      <FormError message={error} />
      {!overview && !error ? <p className="text-sm text-muted">Loading overview…</p> : null}
      {overview ? (
        <>
          <section aria-labelledby="attention-heading" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_12px_40px_-32px_rgba(20,33,61,0.5)]">
            <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-5 sm:px-7 sm:py-6">
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">Daily work</p><h2 id="attention-heading" className="mt-1 font-serif text-2xl sm:text-3xl">Needs attention</h2></div>
              <span className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted">Current snapshot</span>
            </div>
            <QueueRow label="Requests to review" count={overview.casesByState.submitted ?? 0} href={user.role === "admin" ? "/review" : undefined} action={user.role === "admin" ? "Review →" : "Team review"} />
            <QueueRow label="Identity checks" count={overview.pendingIdentityChecks} href={user.role === "admin" ? "/review/identity" : undefined} action={user.role === "admin" ? "Open checks →" : "Team review"} />
            {user.role === "admin" ? <QueueRow label="Invitations" count={overview.pendingInvites} href="/admin/invites" action="View invitations →" /> : null}
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown title="People" counts={overview.usersByRole} labels={ROLE_LABELS} href={user.role === "admin" ? "/admin/people" : undefined} />
            <Breakdown title="Requests" counts={overview.casesByState} labels={STATE_LABELS} href={user.role === "admin" ? "/review" : undefined} />
          </div>

          <section aria-labelledby="setup-heading" className="rounded-2xl border border-line bg-surface px-5 py-5 sm:px-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="setup-heading" className="font-serif text-xl">Site setup</h2><span className="text-xs uppercase tracking-[0.12em] text-muted">Current configuration</span></div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="border-t border-line pt-3"><dt className="font-medium">Email</dt><dd className="mt-1 text-muted">{MAIL_LABELS[overview.mailProvider] ?? overview.mailProvider}</dd></div>
              <div className="border-t border-line pt-3"><dt className="font-medium">Documents</dt><dd className="mt-1 text-muted">{overview.storage === "s3" ? "Encrypted in your S3 bucket" : "Encrypted on this server"}</dd></div>
            </dl>
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
