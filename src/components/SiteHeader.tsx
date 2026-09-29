"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage, type User } from "@/lib/api";
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
  ["/donate", "Support Faceless Angels"],
  ["/transparency", "Where the money goes"],
];

/** A small drop-down in the header. Closes on Escape, a click away, or a choice. */
function Menu({
  label,
  heading,
  links,
  onSignOut,
  signingOut = false,
}: {
  label: string;
  /** A line at the top of the open menu, such as who is signed in. */
  heading?: string;
  links: Links;
  onSignOut?: () => void;
  signingOut?: boolean;
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
                disabled={signingOut}
                className="block w-full px-4 py-2 text-left hover:bg-paper"
              >
                {signingOut ? "Signing out…" : "Sign out"}
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const header = useRef<HTMLElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeAway = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMobileOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeAway);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeAway);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [mobileOpen]);

  async function signOut() {
    if (signingOut) return;
    setMobileOpen(false);
    setSigningOut(true);
    setSignOutError(null);
    try {
      await api("/auth/sign-out", { method: "POST" });
      // Reload the document so pages using a loaded user cannot keep showing
      // the previous signed-in state after the session cookie is cleared.
      window.location.replace("/");
    } catch (error) {
      setSignOutError(`${errorMessage(error)} You are still signed in.`);
      setSigningOut(false);
    }
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
    if (["admin", "payment_approver", "auditor"].includes(user.role)) {
      work.push(["/admin/money", "Money"]);
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
    <header ref={header} className="relative z-40 border-b border-line bg-paper print:hidden">
      <div
        className={`mx-auto flex w-full items-center justify-between gap-4 px-5 py-3 lg:py-4 ${
          wide ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <Link href="/" onClick={() => setMobileOpen(false)} className="flex min-w-0 items-center gap-2.5 whitespace-nowrap">
          <Mark />
          <span className="font-serif text-lg sm:text-xl">Faceless Angels</span>
        </Link>
        {showNav ? (
          <>
          <button
            ref={mobileButton}
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-controls="mobile-site-menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line text-ink lg:hidden"
          >
            {mobileOpen ? (
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <nav aria-label="Main" className="hidden items-center gap-6 text-sm lg:flex">
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
                signingOut={signingOut}
              />
            ) : (
              <>
                <Link href="/sign-in" className="text-muted hover:text-ink">
                  Sign in
                </Link>
                <Link
                  href="/ask"
                  className="rounded-full bg-action px-4 py-2 font-medium text-on-action transition-colors hover:bg-action-hover"
                >
                  Ask for help
                </Link>
              </>
            )}
          </nav>
          </>
        ) : null}
      </div>
      {signOutError ? (
        <p role="alert" className="mx-auto w-full max-w-5xl px-5 pb-3 text-sm text-gold">
          {signOutError}
        </p>
      ) : null}
      {showNav && mobileOpen ? (
        <nav
          id="mobile-site-menu"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.25rem)] overflow-y-auto border-b border-line bg-paper px-5 pb-6 pt-2 shadow-[0_22px_32px_-24px_rgba(0,0,0,0.65)] lg:hidden"
        >
          <div className="mx-auto flex max-w-5xl flex-col">
            {(!user || ready) && MAIN.map(([href, label]) => (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="flex min-h-12 items-center border-b border-line text-base font-medium">
                {label}
              </Link>
            ))}
            {(!user || ready) ? (
              <details className="group border-b border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden">
                  About <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div className="flex flex-col pb-2">
                  {ABOUT.map(([href, label]) => (
                    <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center pl-4 text-sm text-muted">
                      {label}
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}
            {work.length > 0 ? (
              <details className="group border-b border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden">
                  Work <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div className="flex flex-col pb-2">
                  {work.map(([href, label]) => (
                    <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center pl-4 text-sm text-muted">
                      {label}
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}
            {user ? (
              <details className="group border-b border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden">
                  Account <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div className="flex flex-col pb-2">
                  {own.map(([href, label]) => (
                    <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center pl-4 text-sm text-muted">
                      {label}
                    </Link>
                  ))}
                  <button type="button" onClick={signOut} disabled={signingOut} className="flex min-h-11 items-center pl-4 text-left text-sm text-muted">{signingOut ? "Signing out…" : "Sign out"}</button>
                </div>
              </details>
            ) : (
              <>
                <Link href="/sign-in" onClick={() => setMobileOpen(false)} className="flex min-h-12 items-center border-b border-line text-base font-medium">Sign in</Link>
                <Link href="/ask" onClick={() => setMobileOpen(false)} className="mt-5 flex min-h-12 items-center justify-center rounded-full bg-action px-5 font-semibold text-on-action">Ask for help</Link>
              </>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
