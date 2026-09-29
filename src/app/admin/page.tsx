"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { FormError } from "@/components/Field";
import { api, errorMessage, type AdminOverview } from "@/lib/api";
import { STATE_LABELS } from "@/lib/format";
import { ROLE_LABELS, useRequiredUser } from "@/lib/session";

const MAIL_LABELS: Record<string, string> = {
  relykit: "Sending through RelyKit",
  smtp: "Sending through your SMTP server",
  log: "Emails are only printed to the server log",
};

function Counts({
  title,
  counts,
  labels,
  href,
}: {
  title: string;
  counts: Record<string, number>;
  labels: Record<string, string>;
  href?: string;
}) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-serif text-2xl">{title}</h2>
        {href ? <Link href={href} className="text-sm font-medium text-gold underline underline-offset-4">View all</Link> : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">None yet.</p>
      ) : (
        <dl className="text-sm tabular-nums">
          {rows.map(([key, count]) => (
            <div key={key} className="flex justify-between gap-6 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
              <dt className="text-muted">{labels[key] ?? key}</dt>
              <dd className="font-semibold">{count}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function ActionCard({
  label,
  count,
  href,
  action,
}: {
  label: string;
  count: number;
  href?: string;
  action?: string;
}) {
  const content = (
    <>
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className="text-4xl font-semibold tabular-nums">{count}</span>
      <span className="text-sm font-medium text-gold group-hover:underline">
        {action ?? "Waiting for the team"}
      </span>
    </>
  );
  const className = "group flex min-h-32 flex-col justify-between rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-gold-bright sm:min-h-44 sm:p-5";
  return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
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
    <AdminShell user={user} title="Overview" intro="A quick view of the work waiting for your team and the people using Faceless Angels.">
      <FormError message={error} />
      {!overview && !error ? <p className="text-sm text-muted">Loading overview…</p> : null}
      {overview ? (
        <>
          <section aria-labelledby="attention-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">Your priorities</p>
                <h2 id="attention-heading" className="mt-1 font-serif text-2xl sm:text-3xl">Needs attention</h2>
              </div>
              <p className="text-sm text-muted">Open a section to take action</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <ActionCard label="Requests to review" count={overview.casesByState.submitted ?? 0} href={user.role === "admin" ? "/review" : undefined} action={user.role === "admin" ? "Open review queue →" : undefined} />
              <ActionCard label="ID checks waiting" count={overview.pendingIdentityChecks} href={user.role === "admin" ? "/review/identity" : undefined} action={user.role === "admin" ? "Open ID checks →" : undefined} />
              {user.role === "admin" ? (
                <div className="sm:col-span-2 xl:col-span-1">
                  <ActionCard label="Invitations pending" count={overview.pendingInvites} href="/admin/invites" action="View invitations →" />
                </div>
              ) : null}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Counts title="People" counts={overview.usersByRole} labels={ROLE_LABELS} href={user.role === "admin" ? "/admin/people" : undefined} />
            <Counts title="Requests" counts={overview.casesByState} labels={STATE_LABELS} href={user.role === "admin" ? "/review" : undefined} />
          </div>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-2xl">Site setup</h2>
              <span className="text-xs uppercase tracking-[0.12em] text-muted">Current configuration</span>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-paper p-4">
                <dt className="font-semibold">Email</dt>
                <dd className="mt-2 leading-6 text-muted">{MAIL_LABELS[overview.mailProvider] ?? overview.mailProvider}</dd>
              </div>
              <div className="rounded-xl bg-paper p-4">
                <dt className="font-semibold">Documents</dt>
                <dd className="mt-2 leading-6 text-muted">
                  {overview.storage === "s3" ? "Encrypted and stored in your S3 bucket" : "Encrypted and stored on this server's disk"}
                </dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
