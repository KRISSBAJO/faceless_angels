"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api, errorMessage } from "@/lib/api";
import { useLinkToken } from "@/lib/session";

export default function VerifyEmailPage() {
  const token = useLinkToken();
  const [result, setResult] = useState<"working" | "done" | string>("working");

  useEffect(() => {
    if (token === undefined) return;
    if (token === null) {
      queueMicrotask(() =>
        setResult("This link is missing its code. Open it from your email again."),
      );
      return;
    }
    let active = true;
    api("/auth/verify-email", { body: { token } })
      .then(() => active && setResult("done"))
      .catch((err) => active && setResult(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-md flex-col items-start gap-6">
        <h1 className="font-serif text-4xl">
          {result === "done" ? "Your email is confirmed" : "Confirming your email"}
        </h1>
        {result === "working" ? (
          <p className="text-muted">One moment.</p>
        ) : result === "done" ? (
          <>
            <p className="leading-7">You can now submit a request.</p>
            <Link href="/requests" className="btn btn-primary">
              Go to my requests
            </Link>
          </>
        ) : (
          <>
            <p role="alert" className="leading-7">
              {result}
            </p>
            <p className="text-sm text-muted">
              Sign in and use “Send the link again” at the top of the page.
            </p>
            <Link href="/sign-in" className="btn btn-ghost">
              Sign in
            </Link>
          </>
        )}
      </div>
    </AppShell>
  );
}
