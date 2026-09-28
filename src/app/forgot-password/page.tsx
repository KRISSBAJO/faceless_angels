"use client";

import Link from "next/link";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/forgot-password", { body: { email } });
      setSentTo(email);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <h1 className="font-serif text-4xl">Reset your password</h1>
        {sentTo ? (
          <p className="leading-7">
            If {sentTo} has an account, we sent it a link. The link works for
            2 hours.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <Field
              id="email"
              label="Email"
              hint="We will send you a link to choose a new password."
            >
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                autoComplete="email"
                required
              />
            </Field>
            <FormError message={error} />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Send the link
            </button>
          </form>
        )}
        <p className="text-sm text-muted">
          <Link
            href="/sign-in"
            className="font-medium text-ink underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
