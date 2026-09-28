"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PublicShell from "@/components/PublicShell";
import { api, errorMessage } from "@/lib/api";
import { useLinkToken } from "@/lib/session";

export default function UnsubscribePage() {
  const token = useLinkToken();
  const [result, setResult] = useState<"working" | "done" | string>("working");

  useEffect(() => {
    if (token === undefined) return;
    if (token === null) {
      queueMicrotask(() =>
        setResult("This link is missing its code. Open it from the email again."),
      );
      return;
    }
    let active = true;
    api("/journal/unsubscribe", { body: { token } })
      .then(() => active && setResult("done"))
      .catch((err) => active && setResult(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-md flex-col items-start gap-5">
        <h1 className="font-serif text-4xl">
          {result === "done" ? "You will get no more of these" : "Stopping the emails"}
        </h1>
        {result === "working" ? (
          <p className="text-muted">One moment.</p>
        ) : result === "done" ? (
          <p className="leading-7">
            We have stopped these emails. You can ask for them again from any
            category page in the Journal.
          </p>
        ) : (
          <p role="alert" className="leading-7">
            {result} You can also stop emails from your library after you
            sign in.
          </p>
        )}
        <Link href="/journal" className="btn btn-ghost">
          Go to the Journal
        </Link>
      </div>
    </PublicShell>
  );
}
