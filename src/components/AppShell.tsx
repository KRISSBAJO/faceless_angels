"use client";

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
  return (
    <>
      <SiteHeader user={user} showNav={Boolean(user) || visitorNav} />
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
