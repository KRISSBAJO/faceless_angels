"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@/lib/api";
import AppShell from "./AppShell";

const TABS: { href: string; label: string; adminOnly: boolean }[] = [
  { href: "/admin", label: "Overview", adminOnly: false },
  { href: "/admin/people", label: "People", adminOnly: true },
  { href: "/admin/invites", label: "Invitations", adminOnly: true },
  { href: "/admin/settings", label: "Need types and wording", adminOnly: true },
  { href: "/admin/audit", label: "Audit log", adminOnly: false },
];

export default function AdminShell({
  user,
  title,
  intro,
  children,
}: {
  user: User;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => user.role === "admin" || !tab.adminOnly);

  return (
    <AppShell user={user}>
      <nav
        aria-label="Admin"
        className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-3 text-sm"
      >
        {tabs.map((tab) => {
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
      </nav>
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-serif text-4xl sm:text-5xl">{title}</h1>
        {intro ? <p className="leading-7 text-muted">{intro}</p> : null}
      </div>
      {children}
    </AppShell>
  );
}
