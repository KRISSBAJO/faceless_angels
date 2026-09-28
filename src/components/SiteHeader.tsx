"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type User } from "@/lib/api";
import { REVIEW_ROLES } from "@/lib/session";
import Mark from "./Mark";

type Links = [string, string][];

const MAIN: Links = [
  ["/prayer", "Prayer"],
  ["/journal", "Journal"],
  ["/needs", "Needs"],
];

const ABOUT: Links = [
  ["/#how", "How giving works"],
  ["/#safeguards", "Safeguards"],
  ["/#privacy", "Privacy"],
  ["/#community", "Get involved"],
];

/** A small drop-down in the header. Closes on Escape, a click away, or a choice. */
function Menu({
  label,
  heading,
  links,
  onSignOut,
}: {
  label: string;
  /** A line at the top of the open menu, such as who is signed in. */
  heading?: string;
  links: Links;
  onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-muted hover:text-ink"
      >
        {label}
        <span aria-hidden="true" className="text-xs">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <ul className="absolute right-0 top-full z-20 mt-2 flex min-w-52 flex-col rounded-xl border border-line bg-surface py-2 shadow-[0_18px_40px_-20px_rgba(20,33,61,0.45)]">
          {heading ? (
            <li className="mb-1 border-b border-line px-4 pb-2 pt-1 text-xs text-muted">
              {heading}
            </li>
          ) : null}
          {links.map(([href, text]) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 hover:bg-paper"
              >
                {text}
              </Link>
            </li>
          ))}
          {onSignOut ? (
            <li className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={onSignOut}
                className="block w-full px-4 py-2 text-left hover:bg-paper"
              >
                Sign out
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/** The one header every page shares. */
export default function SiteHeader({
  user,
  showNav = true,
  wide = false,
}: {
  user?: User | null;
  /** False on pages that should show the name alone, like sign-in. */
  showNav?: boolean;
  /** Matches the wider home page. */
  wide?: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    await api("/auth/sign-out", { method: "POST" }).catch(() => undefined);
    router.push("/");
    router.refresh();
  }

  const ready = user && !user.mustChangePassword;

  const work: Links = [];
  if (ready) {
    if (user.role === "admin" || user.role === "auditor") {
      work.push(["/admin", "Admin"]);
    }
    if (REVIEW_ROLES.includes(user.role)) {
      work.push(["/review", "Review queue"], ["/review/identity", "ID checks"]);
    }
    if (["prayer_team", "pastor", "editor", "admin"].includes(user.role)) {
      work.push(["/prayer/team", "Prayer team"]);
    }
    if (["editor", "pastor", "admin"].includes(user.role)) {
      work.push(["/journal/studio", "Journal studio"]);
    }
  }

  const own: Links = ready
    ? [
        ["/ask", "Ask for help"],
        ["/prayer/mine", "My prayer requests"],
        ["/journal/library", "My library"],
        ["/giving", "My giving"],
        ["/requests", "My requests for help"],
        ["/account", "Settings and ID"],
      ]
    : [];

  return (
    <header className="border-b border-line">
      <div
        className={`mx-auto flex w-full flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4 ${
          wide ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="font-serif text-xl">Faceless Angels</span>
        </Link>
        {showNav ? (
          <nav
            aria-label="Main"
            className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
          >
            {!user || ready
              ? MAIN.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-muted hover:text-ink"
                  >
                    {label}
                  </Link>
                ))
              : null}
            {!user || ready ? <Menu label="About" links={ABOUT} /> : null}
            {work.length > 0 ? <Menu label="Work" links={work} /> : null}
            {user ? (
              <Menu
                label="Account"
                heading={`Signed in as ${user.fullName}`}
                links={own}
                onSignOut={signOut}
              />
            ) : (
              <>
                <Link href="/sign-in" className="text-muted hover:text-ink">
                  Sign in
                </Link>
                <Link
                  href="/ask"
                  className="rounded-full bg-ink px-4 py-2 font-medium text-paper transition-opacity hover:opacity-90"
                >
                  Ask for help
                </Link>
              </>
            )}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
