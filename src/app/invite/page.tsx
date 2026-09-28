"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { PASSWORD_HINT } from "@/components/AuthForm";
import { Field, FormError } from "@/components/Field";
import { api, errorMessage, type User } from "@/lib/api";
import { homeFor, ROLE_LABELS, useLinkToken } from "@/lib/session";

export default function InvitePage() {
  const token = useLinkToken();
  const router = useRouter();
  const [invite, setInvite] = useState<{ email: string; role: string } | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token === undefined) return;
    if (token === null) {
      queueMicrotask(() =>
        setProblem("This link is missing its code. Open it from your email again."),
      );
      return;
    }
    let active = true;
    api<{ email: string; role: string }>("/auth/invite-info", {
      body: { token },
    })
      .then((info) => active && setInvite(info))
      .catch((err) => active && setProblem(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [token]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const user = await api<User>("/auth/accept-invite", {
        body: {
          token,
          fullName: String(form.get("fullName")).trim(),
          password: String(form.get("password")),
        },
      });
      router.push(homeFor(user));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <h1 className="font-serif text-4xl">Accept your invitation</h1>
        {problem ? (
          <p role="alert" className="leading-7">
            {problem} Ask the person who invited you for a new link.
          </p>
        ) : invite ? (
          <>
            <p className="leading-7 text-muted">
              You are joining as{" "}
              <strong className="text-ink">
                {ROLE_LABELS[invite.role] ?? invite.role}
              </strong>{" "}
              with the email{" "}
              <strong className="break-all text-ink">{invite.email}</strong>.
            </p>
            <form onSubmit={onSubmit} className="flex flex-col gap-5">
              <Field id="fullName" label="Full name">
                <input
                  id="fullName"
                  name="fullName"
                  className="input"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </Field>
              <Field id="password" label="Password" hint={PASSWORD_HINT}>
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
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Create my account
              </button>
            </form>
          </>
        ) : (
          <p className="text-muted">One moment.</p>
        )}
      </div>
    </AppShell>
  );
}
