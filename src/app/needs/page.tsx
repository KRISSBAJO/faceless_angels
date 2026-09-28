"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { FormError } from "@/components/Field";
import { Badges, NeedFacts, PledgeProgress } from "@/components/NeedCard";
import { api, errorMessage, type Need } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { useOptionalUser } from "@/lib/session";

export default function NeedsPage() {
  const { user, ready } = useOptionalUser();
  const [needs, setNeeds] = useState<Need[] | null>(null);
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    api<Need[]>("/needs")
      .then((rows) => active && setNeeds(rows))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [ready]);

  const categories = needs
    ? [...new Map(needs.map((n) => [n.category, n.categoryLabel]))]
    : [];
  const shown = needs?.filter((n) => !category || n.category === category);
  const seesPrivate = user?.identityStatus === "verified";

  return (
    <AppShell user={user} visitorNav>
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-serif text-4xl sm:text-5xl">Needs you can meet</h1>
        <p className="leading-7 text-muted">
          A reviewer approved every need here. Each badge names one check we
          completed. The person you help never learns your name.
        </p>
      </div>

      <p className="max-w-2xl rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-6">
        Giving is not open yet. For now you can pledge, which is a promise to
        give. No money is taken. We will write to you when giving opens.
      </p>

      {user && !seesPrivate ? (
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Some needs are shown only to Angels whose identity we have confirmed.{" "}
          <Link href="/account" className="underline underline-offset-4">
            Send your ID from your account page
          </Link>{" "}
          to see them.
        </p>
      ) : null}

      {categories.length > 1 ? (
        <label className="flex max-w-xs flex-col gap-1.5 text-sm font-medium">
          Kind of need
          <select
            id="need-category"
            className="input font-normal"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All kinds</option>
            {categories.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <FormError message={error} />

      {shown && shown.length === 0 ? (
        <p className="leading-7 text-muted">
          No needs are listed right now. Check back soon.
        </p>
      ) : null}

      {shown && shown.length > 0 ? (
        <ul className="grid gap-6 md:grid-cols-2">
          {shown.map((need) => (
            <li key={need.ref}>
              <article className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
                <NeedFacts need={need} />
                <h2 className="font-serif text-2xl leading-snug">
                  <Link
                    href={`/needs/${need.ref}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {need.summary}
                  </Link>
                </h2>
                <Badges badges={need.badges} />
                <div className="mt-auto flex flex-col gap-3 pt-2">
                  <p className="font-serif text-3xl tabular-nums">
                    {formatCents(need.amountCents)}
                  </p>
                  <PledgeProgress need={need} />
                  <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-mono text-muted">{need.ref}</span>
                    <Link
                      href={`/needs/${need.ref}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {need.isYours
                        ? "This is your need"
                        : need.remainingCents === 0
                          ? "See this need"
                          : "Help with this"}
                    </Link>
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}
