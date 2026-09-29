"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@/lib/api";
import AppShell from "./AppShell";

const SECTIONS = [
  {
    label: "Workspace",
    links: [
      { href: "/admin", label: "Overview", adminOnly: false },
      { href: "/admin/people", label: "People", adminOnly: true },
      { href: "/admin/invites", label: "Invitations", adminOnly: true },
    ],
  },
  {
    label: "Manage",
    links: [
      { href: "/admin/settings", label: "Need types and wording", adminOnly: true },
      { href: "/admin/money", label: "Money", adminOnly: false, roles: ["admin", "payment_approver", "auditor"] },
      { href: "/admin/connections", label: "Connections", adminOnly: true },
      { href: "/admin/audit", label: "Audit log", adminOnly: false },
    ],
  },
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
  const sections = SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter((link) =>
      "roles" in link && link.roles
        ? link.roles.includes(user.role)
        : user.role === "admin" || (user.role === "auditor" && !link.adminOnly),
    ),
  })).filter((section) => section.links.length > 0);

  const navigation = (
    <nav aria-label="Admin" className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {section.label}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {section.links.map((link) => {
              const current = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-lg border-l-[3px] px-3 py-2 text-sm transition-colors ${
                    current
                      ? "border-gold-bright bg-gold-soft font-semibold text-ink"
                      : "border-transparent text-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <AppShell user={user} wide>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <aside className="sticky top-6 hidden self-start border-r border-line py-3 pr-5 lg:block">
          <p className="mb-6 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Admin workspace</p>
          {navigation}
        </aside>
        <div className="min-w-0">
          <details className="mb-6 rounded-xl border border-line bg-surface p-4 lg:hidden">
            <summary className="cursor-pointer font-medium">Admin sections · {title}</summary>
            <div className="mt-5 border-t border-line pt-5">{navigation}</div>
          </details>
          <div className="mb-6 border-b border-line pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Faceless Angels / Admin</p>
            <h1 className="mt-2 font-serif text-3xl sm:text-4xl">{title}</h1>
            {intro ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">{intro}</p> : null}
          </div>
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
