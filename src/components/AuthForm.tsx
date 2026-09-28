"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage, type User } from "@/lib/api";
import { homeFor, safeNext } from "@/lib/session";
import AppShell from "./AppShell";
import { Field, FormError } from "./Field";

export const PASSWORD_HINT =
  "At least 10 characters. Avoid common passwords and your email name.";

export default function AuthForm({ mode }: { mode: "sign-up" | "sign-in" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<"ask" | "give">("ask");
  const isSignUp = mode === "sign-up";

  useEffect(() => {
    // Someone who came from a need is here to give.
    const query = new URLSearchParams(window.location.search);
    const giving =
      query.get("intent") === "give" ||
      (query.get("next") ?? "").startsWith("/needs");
    if (giving) queueMicrotask(() => setIntent("give"));
  }, []);

  // Carries "where to go next" across the link between the two forms.
  const [query, setQuery] = useState("");
  useEffect(() => {
    const search = window.location.search;
    if (search) queueMicrotask(() => setQuery(search));
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams(window.location.search).get("next");
    setBusy(true);
    setError(null);
    try {
      const user = await api<User>(`/auth/${mode}`, {
        body: {
          email: String(form.get("email")).trim(),
          password: String(form.get("password")),
          ...(isSignUp
            ? { fullName: String(form.get("fullName")).trim(), intent }
            : {}),
        },
      });
      router.push(
        user.mustChangePassword ? "/account" : safeNext(next, homeFor(user)),
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AppShell visitorNav>
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="font-serif text-4xl">
            {isSignUp ? "Create your account" : "Sign in"}
          </h1>
          <p className="leading-7 text-muted">
            {isSignUp
              ? intent === "give"
                ? "We need to know who gives. The people you help never learn your name."
                : "Your name is used to review your request. Donors and the public never see it."
              : "Sign in to see your requests."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {isSignUp ? (
            <div
              role="radiogroup"
              aria-label="What brings you here"
              className="grid grid-cols-2 gap-3"
            >
              {(
                [
                  ["ask", "I need help"],
                  ["give", "I want to give"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={intent === value}
                  onClick={() => setIntent(value)}
                  className={`rounded-xl border px-4 py-3 text-left font-medium transition-colors ${
                    intent === value
                      ? "border-ink bg-surface"
                      : "border-line text-muted hover:border-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {isSignUp ? (
            <Field id="fullName" label="Full legal name">
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
          ) : null}
          <Field id="email" label="Email">
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              required
            />
          </Field>
          <Field
            id="password"
            label="Password"
            hint={isSignUp ? PASSWORD_HINT : undefined}
          >
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              minLength={isSignUp ? 10 : 1}
            />
          </Field>
          <FormError message={error} />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="flex flex-col gap-2 text-sm text-muted">
          <p>
            {isSignUp ? "Already have an account? " : "New here? "}
            <Link
              href={`${isSignUp ? "/sign-in" : "/sign-up"}${query}`}
              className="font-medium text-ink underline underline-offset-4"
            >
              {isSignUp ? "Sign in" : "Create an account"}
            </Link>
          </p>
          {isSignUp ? null : (
            <p>
              <Link
                href="/forgot-password"
                className="font-medium text-ink underline underline-offset-4"
              >
                Forgot your password?
              </Link>
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
