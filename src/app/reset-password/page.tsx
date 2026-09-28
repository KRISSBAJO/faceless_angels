"use client";

import Link from "next/link";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { PASSWORD_HINT } from "@/components/AuthForm";
import { Field, FormError } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";
import { useLinkToken } from "@/lib/session";

export default function ResetPasswordPage() {
  const token = useLinkToken();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password"));
    setBusy(true);
    setError(null);
    try {
      await api("/auth/reset-password", { body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <h1 className="font-serif text-4xl">Choose a new password</h1>
        {done ? (
          <>
            <p className="leading-7">
              Your password is changed. You were signed out everywhere.
            </p>
            <Link href="/sign-in" className="btn btn-primary">
              Sign in
            </Link>
          </>
        ) : token === null ? (
          <p className="leading-7">
            This link is missing its code. Open the link from your email
            again, or{" "}
            <Link
              href="/forgot-password"
              className="font-medium underline underline-offset-4"
            >
              ask for a new one
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <Field id="password" label="New password" hint={PASSWORD_HINT}>
              <input
                id="password"
                name="password"
                type="password"
                className="input"
                autoComplete="new-password"
                required
                minLength={10}
              />
            </Field>
            <FormError message={error} />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !token}
            >
              Change password
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
