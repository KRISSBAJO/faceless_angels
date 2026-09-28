"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { FormError } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import { minutes, type ArticleCard, type Library } from "@/lib/journal";
import { useRequiredUser } from "@/lib/session";

function Rows({ articles }: { articles: ArticleCard[] }) {
  return (
    <ul className="flex flex-col">
      {articles.map((article) => (
        <li
          key={article.id}
          className="flex flex-col gap-1 border-t border-line py-4 first:border-t-0"
        >
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
            {article.category.label}
          </span>
          <Link
            href={`/journal/${article.slug}`}
            className="font-serif text-xl leading-snug underline-offset-4 hover:underline"
          >
            {article.title}
          </Link>
          <span className="text-sm text-muted">
            {article.author.name} · {minutes(article.readingMinutes)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function LibraryPage() {
  const user = useRequiredUser();
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api<Library>("/journal/library").then(setLibrary),
    [],
  );

  useEffect(() => {
    if (!user) return;
    load().catch((err) => setError(errorMessage(err)));
  }, [user, load]);

  async function unfollow(key: string) {
    try {
      await api(`/journal/categories/${key}/follow`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!user) return <AppShell>{null}</AppShell>;

  const empty =
    library &&
    library.saved.length + library.reading.length + library.notes.length === 0;

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl sm:text-5xl">My library</h1>
        <Link href="/journal" className="btn btn-ghost">
          Go to the Journal
        </Link>
      </div>

      <FormError message={error} />

      {empty ? (
        <p className="max-w-xl leading-7 text-muted">
          Nothing here yet. When you save an article or write a note on one,
          you will find it here.
        </p>
      ) : null}

      {library && library.reading.length > 0 ? (
        <section className="flex max-w-3xl flex-col gap-2">
          <h2 className="font-serif text-2xl">Pick up where you stopped</h2>
          <Rows articles={library.reading} />
        </section>
      ) : null}

      {library && library.saved.length > 0 ? (
        <section className="flex max-w-3xl flex-col gap-2">
          <h2 className="font-serif text-2xl">Saved</h2>
          <Rows articles={library.saved} />
        </section>
      ) : null}

      {library && library.notes.length > 0 ? (
        <section className="flex max-w-3xl flex-col gap-2">
          <h2 className="font-serif text-2xl">Your notes</h2>
          <p className="text-sm text-muted">Only you can read these.</p>
          <ul className="flex flex-col">
            {library.notes.map((entry) => (
              <li
                key={entry.article.id}
                className="flex flex-col gap-2 border-t border-line py-5 first:border-t-0"
              >
                <Link
                  href={`/journal/${entry.article.slug}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {entry.article.title}
                </Link>
                <p className="whitespace-pre-wrap break-words border-l-2 border-line pl-4 leading-7">
                  {entry.note}
                </p>
                <span className="text-sm text-muted">
                  {formatMoment(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {library && library.follows.length > 0 ? (
        <section className="flex max-w-3xl flex-col gap-2">
          <h2 className="font-serif text-2xl">Emails you asked for</h2>
          <ul className="flex flex-col text-sm">
            {library.follows.map((follow) => (
              <li
                key={follow.key}
                className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-3 first:border-t-0"
              >
                <Link
                  href={`/journal/category/${follow.key}`}
                  className="font-medium"
                >
                  New {follow.label}
                </Link>
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => void unfollow(follow.key)}
                >
                  Stop these emails
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
