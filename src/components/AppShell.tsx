"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage, type User } from "@/lib/api";
import { REVIEW_ROLES } from "@/lib/session";
import Mark from "./Mark";

function VerifyEmailBanner({ user }: { user: User }) {
  const [state, setState] = useState<"idle" | "sent" | string>("idle");

  async function resend() {
    try {
      await api("/auth/resend-verification", { method: "POST" });
      setState("sent");
    } catch (err) {
      setState(errorMessage(err));
    }
  }

  return (
    <div className="border-b border-gold-bright bg-gold-soft">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 text-sm">
        <p>
          {state === "sent"
            ? `We sent a new link to ${user.email}.`
            : state !== "idle"
              ? state
              : `Confirm your email to submit a request or make a pledge. We sent a link to ${user.email}.`}
        </p>
        {state === "idle" ? (
          <button
            type="button"
            onClick={resend}
            className="font-medium underline underline-offset-4"
          >
            Send the link again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function AppShell({
  user,
  visitorNav = false,
  children,
}: {
  user?: User | null;
  /** Show the public links when nobody is signed in. */
  visitorNav?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function signOut() {
    await api("/auth/sign-out", { method: "POST" }).catch(() => undefined);
    router.push("/");
  }

  const showNav = Boolean(user) || visitorNav;
  const links: [string, string][] = [];
  if (!user) {
    links.push(["/needs", "Needs"], ["/ask", "Ask for help"]);
  } else if (!user.mustChangePassword) {
    links.push(["/needs", "Needs"]);
    if (user.role === "admin" || user.role === "auditor") {
      links.push(["/admin", "Admin"]);
    }
    if (REVIEW_ROLES.includes(user.role)) {
      links.push(["/review", "Review queue"], ["/review/identity", "ID checks"]);
    }
    links.push(
      ["/giving", "My giving"],
      ["/requests", "My requests"],
      ["/account", "Account"],
    );
  }

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="font-serif text-xl">Faceless Angels</span>
          </Link>
          {showNav ? (
            <nav
              aria-label={user ? "Account" : "Main"}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
            >
              {links.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="text-muted hover:text-ink"
                >
                  {label}
                </Link>
              ))}
              {user ? (
                <button
                  type="button"
                  onClick={signOut}
                  className="text-muted hover:text-ink"
                >
                  Sign out
                </button>
              ) : (
                <Link href="/sign-in" className="text-muted hover:text-ink">
                  Sign in
                </Link>
              )}
            </nav>
          ) : null}
        </div>
      </header>
      {user && !user.emailVerified && !user.mustChangePassword ? (
        <VerifyEmailBanner user={user} />
      ) : null}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-12">
        {children}
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-5xl px-5 py-6 text-sm text-muted">
          Faceless Angels is not an emergency service. If you are in immediate
          danger, call 911.
        </p>
      </footer>
    </>
  );
}
