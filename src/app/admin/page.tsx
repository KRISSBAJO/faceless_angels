"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { FormError } from "@/components/Field";
import { api, errorMessage, type AdminOverview } from "@/lib/api";
import { STATE_LABELS } from "@/lib/format";
import { ROLE_LABELS, useRequiredUser } from "@/lib/session";

const MAIL_LABELS: Record<string, string> = {
  relykit: "Sent through RelyKit",
  smtp: "Sent through your SMTP server",
  log: "Not sent. Emails are printed to the server log.",
};

function Counts({
  title,
  counts,
  labels,
}: {
  title: string;
  counts: Record<string, number>;
  labels: Record<string, string>;
}) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">None yet.</p>
      ) : (
        <dl className="flex flex-col text-sm tabular-nums">
          {rows.map(([key, n]) => (
            <div
              key={key}
              className="flex justify-between gap-6 border-t border-line py-2.5 first:border-t-0"
            >
              <dt className="text-muted">{labels[key] ?? key}</dt>
              <dd className="font-medium">{n}</dd>
            </div>
          ))}
        </dl>
      )}
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
      .then((o) => active && setOverview(o))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;

  return (
    <AdminShell user={user} title="Admin">
      <FormError message={error} />
      {overview ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl">Needs attention</h2>
            <ul className="flex flex-col text-sm">
              <li className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line py-3 first:border-t-0">
                <span>
                  <strong className="tabular-nums">
                    {overview.casesByState.submitted ?? 0}
                  </strong>{" "}
                  requests waiting for a reviewer
                </span>
                <span className="text-muted">Reviewers see these in their queue</span>
              </li>
              <li className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line py-3">
                <span>
                  <strong className="tabular-nums">
                    {overview.pendingIdentityChecks}
                  </strong>{" "}
                  IDs waiting for a check
                </span>
                {user.role === "admin" ? (
                  <Link
                    href="/review/identity"
                    className="underline underline-offset-4"
                  >
                    Open ID checks
                  </Link>
                ) : null}
              </li>
              {user.role === "admin" ? (
                <li className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line py-3">
                  <span>
                    <strong className="tabular-nums">
                      {overview.pendingInvites}
                    </strong>{" "}
                    invitations not yet accepted
                  </span>
                  <Link
                    href="/admin/invites"
                    className="underline underline-offset-4"
                  >
                    Open invitations
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>

          <div className="grid gap-10 md:grid-cols-2">
            <Counts
              title="People"
              counts={overview.usersByRole}
              labels={ROLE_LABELS}
            />
            <Counts
              title="Requests"
              counts={overview.casesByState}
              labels={STATE_LABELS}
            />
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-2xl">How the site is set up</h2>
            <dl className="flex flex-col text-sm">
              <div className="grid gap-1 border-t border-line py-3 first:border-t-0 sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted">Email</dt>
                <dd>
                  {MAIL_LABELS[overview.mailProvider] ?? overview.mailProvider}
                </dd>
              </div>
              <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted">Documents</dt>
                <dd>
                  {overview.storage === "s3"
                    ? "Encrypted, then stored in your S3 bucket"
                    : "Encrypted, then stored on this server's disk"}
                </dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
