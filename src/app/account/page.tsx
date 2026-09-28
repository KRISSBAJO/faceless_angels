"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { PASSWORD_HINT } from "@/components/AuthForm";
import { Field, FormError } from "@/components/Field";
import { api, errorMessage, type Identity, type User } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import { homeFor, ROLE_LABELS, useRequiredUser } from "@/lib/session";

const ID_TYPES: [string, string][] = [
  ["drivers_license", "Driver's license"],
  ["state_id", "State ID"],
  ["passport", "Passport"],
  ["other", "Another government ID"],
];

const IDENTITY_TEXT: Record<string, string> = {
  unverified:
    "We have not confirmed your identity yet. A request cannot be approved until we do.",
  pending: "We are checking the ID you sent. We will email you when it is done.",
  verified: "Your identity is confirmed. You do not need to send anything else.",
  rejected: "We could not confirm your identity from the ID you sent.",
};

const DOC_STATUS: Record<string, string> = {
  pending: "Being checked",
  verified: "Accepted",
  rejected: "Not accepted",
  superseded: "Not needed",
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex max-w-2xl flex-col gap-4 border-t border-line pt-6"
    >
      <h2 id={id} className="font-serif text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PasswordForm({ user }: { user: User }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", {
        body: {
          currentPassword: String(form.get("currentPassword")),
          newPassword: String(form.get("newPassword")),
        },
      });
      if (user.mustChangePassword) {
        // A full load, so every page sees the account without the flag.
        window.location.assign(homeFor({ ...user, mustChangePassword: false }));
        return;
      }
      formEl.reset();
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field id="currentPassword" label="Current password">
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          className="input"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field id="newPassword" label="New password" hint={PASSWORD_HINT}>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </Field>
      <FormError message={error} />
      {done ? (
        <p role="status" className="text-sm text-verified">
          Your password is changed. Other devices were signed out.
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Change password
        </button>
      </div>
    </form>
  );
}

function IdentitySection() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api<Identity>("/identity").then(setIdentity),
    [],
  );

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)));
  }, [load]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      await api("/identity/documents", { body: new FormData(formEl) });
      formEl.reset();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!identity) return <FormError message={error} />;

  return (
    <>
      <p className="leading-7">
        {IDENTITY_TEXT[identity.status] ?? identity.status}
      </p>
      {identity.note ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 leading-7">
          {identity.note}
        </p>
      ) : null}

      {identity.documents.length > 0 ? (
        <ul className="flex flex-col text-sm">
          {identity.documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line py-3 first:border-t-0"
            >
              <span className="break-all font-medium">{doc.name}</span>
              <span className="text-muted">
                {DOC_STATUS[doc.status] ?? doc.status} · sent{" "}
                {formatMoment(doc.uploadedAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {identity.status === "verified" ? null : (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
        >
          <Field id="docType" label="What kind of ID is it?">
            <select id="docType" name="docType" className="input" required>
              {ID_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="id-file"
            label="Photo or scan of your ID"
            hint="PDF, JPG, or PNG. Up to 8 MB. Only our review team can open it. It is stored encrypted and never shown to donors."
          >
            <input
              id="id-file"
              name="file"
              type="file"
              className="input"
              accept="application/pdf,image/jpeg,image/png"
              required
            />
          </Field>
          <FormError message={error} />
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Send my ID
            </button>
          </div>
        </form>
      )}
    </>
  );
}

export default function AccountPage() {
  const user = useRequiredUser();
  if (!user) return <AppShell>{null}</AppShell>;

  if (user.mustChangePassword) {
    return (
      <AppShell user={user}>
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="font-serif text-4xl sm:text-5xl">
            Choose your own password
          </h1>
          <p className="leading-7 text-muted">
            Your account was set up with a starting password. Change it before
            you continue.
          </p>
        </div>
        <div className="max-w-md">
          <PasswordForm user={user} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <h1 className="font-serif text-4xl sm:text-5xl">Account</h1>

      <dl className="flex max-w-2xl flex-col text-sm">
        {(
          [
            ["Name", user.fullName],
            [
              "Email",
              `${user.email} · ${user.emailVerified ? "confirmed" : "not confirmed"}`,
            ],
            ["Role", ROLE_LABELS[user.role] ?? user.role],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 border-t border-line py-3 first:border-t-0 sm:grid-cols-[10rem_1fr]"
          >
            <dt className="text-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <Section id="identity" title="Identity">
        <IdentitySection />
      </Section>

      <Section id="password" title="Password">
        <div className="max-w-md">
          <PasswordForm user={user} />
        </div>
      </Section>
    </AppShell>
  );
}
