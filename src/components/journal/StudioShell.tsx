"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@/lib/api";
import AppShell from "../AppShell";

const TABS = [
  { href: "/journal/studio", label: "Articles" },
  { href: "/journal/studio/comments", label: "Comments" },
  { href: "/journal/studio/settings", label: "Series, categories, byline" },
];

export const JOURNAL_STAFF = ["editor", "pastor", "admin"];

export default function StudioShell({
  user,
  title,
  intro,
  action,
  children,
}: {
  user: User;
  title: string;
  intro?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (!JOURNAL_STAFF.includes(user.role)) {
    return (
      <AppShell user={user}>
        <h1 className="font-serif text-4xl">The Studio is for Journal staff</h1>
        <p className="max-w-xl leading-7 text-muted">
          Editors and pastors write here. An administrator can invite you.
        </p>
        <div>
          <Link href="/journal" className="btn btn-primary">
            Go to the Journal
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <nav
        aria-label="Studio"
        className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-3 text-sm"
      >
        {TABS.map((tab) => {
          const current = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "font-medium underline decoration-gold-bright decoration-2 underline-offset-8"
                  : "text-muted hover:text-ink"
              }
            >
              {tab.label}
            </Link>
          );
        })}
        <Link href="/journal" className="ml-auto text-muted hover:text-ink">
          See the Journal
        </Link>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="font-serif text-4xl">{title}</h1>
          {intro ? <p className="leading-7 text-muted">{intro}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </AppShell>
  );
}
