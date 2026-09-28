"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import { Badges, NeedFacts, PledgeProgress } from "@/components/NeedCard";
import { api, errorMessage, type Need } from "@/lib/api";
import { formatCents, formatDay, parseCents } from "@/lib/format";
import { useOptionalUser } from "@/lib/session";

export default function NeedPage() {
  const { ref } = useParams<{ ref: string }>();
  const { user, ready } = useOptionalUser();
  const [need, setNeed] = useState<Need | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    api<Need>(`/needs/${ref}`)
      .then((n) => active && setNeed(n))
      .catch((err) => active && setMissing(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [ready, ref]);

  async function onPledge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!need) return;
    const formEl = event.currentTarget;
    const cents = parseCents(String(new FormData(formEl).get("amount")));
    if (cents === null || cents < 100) {
      setError("Enter an amount of at least $1.00, like 25 or 67.42.");
      return;
    }
    if (cents > need.remainingCents) {
      setError(
        `Only ${formatCents(need.remainingCents)} is still needed. Pledge that much or less.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setNeed(
        await api<Need>(`/needs/${ref}/pledges`, {
          body: { amountCents: cents },
        }),
      );
      setThanks(cents);
      formEl.reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <AppShell user={user} visitorNav>
        <h1 className="font-serif text-4xl">This need is not listed</h1>
        <p className="max-w-xl leading-7 text-muted">
          It may be fully met, taken off the list, or shown only to confirmed
          Angels.
        </p>
        <div>
          <Link href="/needs" className="btn btn-primary">
            See open needs
          </Link>
        </div>
      </AppShell>
    );
  }
  if (!need) return <AppShell user={user} visitorNav>{null}</AppShell>;

  const open = need.remainingCents > 0;
  const next = encodeURIComponent(`/needs/${need.ref}`);

  return (
    <AppShell user={user} visitorNav>
      <Link href="/needs" className="text-sm text-muted hover:text-ink">
        ← All needs
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          <NeedFacts need={need} />
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
            {need.summary}
          </h1>
          <Badges badges={need.badges} />

          <section className="flex flex-col gap-3 border-t border-line pt-6">
            <h2 className="font-serif text-2xl">What you are not shown</h2>
            <p className="max-w-xl leading-7 text-muted">
              The person&apos;s name, address, provider account, and documents
              stay with our review team. The person is never shown your name
              either.
            </p>
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-6">
            <h2 className="font-serif text-2xl">How the gift will be used</h2>
            <p className="max-w-xl leading-7 text-muted">
              When giving opens, we pay the provider or store directly
              whenever we can. We check the balance again first. This
              approval holds until {formatDay(need.expiresOn)}.
            </p>
          </section>
        </div>

        <aside className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-baseline justify-between gap-4 tabular-nums">
            <span className="font-serif text-4xl">
              {formatCents(need.amountCents)}
            </span>
            <span className="text-sm text-muted">approved</span>
          </div>
          <PledgeProgress need={need} />
          <p className="text-sm text-muted">
            {need.angels === 0
              ? "No Angel has pledged yet."
              : need.angels === 1
                ? "1 Faceless Angel has pledged."
                : `${need.angels} Faceless Angels have pledged.`}
          </p>

          {thanks !== null ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-xl border border-gold-bright bg-gold-soft p-4"
            >
              <p className="font-medium">
                You pledged {formatCents(thanks)}. Thank you.
              </p>
              <p className="font-serif italic">
                That thine alms may be in secret.
              </p>
              <p className="text-sm">
                <Link href="/giving" className="underline underline-offset-4">
                  See my giving
                </Link>
              </p>
            </div>
          ) : null}

          {need.isYours ? (
            <p className="text-sm leading-6 text-muted">
              This is your own need, as Angels see it.
            </p>
          ) : !open ? (
            <p className="text-sm leading-6 text-muted">
              This need is fully pledged.{" "}
              <Link href="/needs" className="underline underline-offset-4">
                See other needs
              </Link>
              .
            </p>
          ) : !user ? (
            <div className="flex flex-col gap-3">
              <Link
                href={`/sign-up?intent=give&next=${next}`}
                className="btn btn-primary"
              >
                Become an Angel to pledge
              </Link>
              <Link href={`/sign-in?next=${next}`} className="btn btn-ghost">
                I have an account
              </Link>
            </div>
          ) : !user.emailVerified ? (
            <p className="text-sm leading-6">
              Confirm your email to pledge. Use the link we sent you, or the
              button at the top of this page.
            </p>
          ) : (
            <form onSubmit={onPledge} className="flex flex-col gap-4">
              <Field
                id="amount"
                label="Your pledge (USD)"
                hint={`Up to ${formatCents(need.remainingCents)}. No money is taken today.`}
              >
                <input
                  id="amount"
                  name="amount"
                  className="input tabular-nums"
                  inputMode="decimal"
                  defaultValue={(need.remainingCents / 100).toFixed(2)}
                  required
                />
              </Field>
              <FormError message={error} />
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Pledge
              </button>
            </form>
          )}

          <p className="border-t border-line pt-4 font-mono text-xs text-muted">
            {need.ref}
            {need.visibility === "angels_only"
              ? " · Shown to confirmed Angels only"
              : ""}
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
