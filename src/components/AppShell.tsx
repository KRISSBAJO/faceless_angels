"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage, type User } from "@/lib/api";
import SiteHeader from "./SiteHeader";

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
    <div className="border-b border-gold-bright bg-gold-soft print:hidden">
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
  wide = false,
  children,
}: {
  user?: User | null;
  /** Show the public links when nobody is signed in. */
  visitorNav?: boolean;
  /** Room for side columns, as on an article. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader
        user={user}
        showNav={Boolean(user) || visitorNav}
        wide={wide}
      />
      {user && !user.emailVerified && !user.mustChangePassword ? (
        <VerifyEmailBanner user={user} />
      ) : null}
      <main
        className={`mx-auto flex w-full flex-1 flex-col gap-8 px-5 py-12 ${
          wide ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        {children}
      </main>
      <footer className="border-t border-line print:hidden">
        <div className={`mx-auto w-full px-5 py-7 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
          <p className="font-serif text-lg">Faceless Angels</p>
          <nav aria-label="Policies" className="mt-4 grid grid-cols-2 gap-x-5 gap-y-1 text-sm text-muted sm:flex sm:flex-wrap sm:gap-x-5">
            <Link href="/contact" className="flex min-h-10 items-center hover:text-ink">Contact</Link>
            <Link href="/privacy" className="flex min-h-10 items-center hover:text-ink">Privacy</Link>
            <Link href="/terms" className="flex min-h-10 items-center hover:text-ink">Terms</Link>
            <Link href="/giving-policy" className="flex min-h-10 items-center hover:text-ink">Giving and refunds</Link>
            <Link href="/transparency" className="flex min-h-10 items-center hover:text-ink">Where the money goes</Link>
          </nav>
          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted sm:text-sm">
            Faceless Angels is not an emergency service. If you are in immediate danger, call 911.
          </p>
        </div>
      </footer>
    </>
  );
}
