import type { Metadata } from "next";
import Link from "next/link";
import {
  ArticleTile,
  Pager,
  SearchBox,
} from "@/components/journal/ArticleCards";
import PublicShell from "@/components/PublicShell";
import { journal } from "@/lib/journal-server";
import {
  KIND_LABELS,
  type ArticleList as List,
  type JournalCategory,
} from "@/lib/journal";

export const metadata: Metadata = {
  title: "All articles · Journal",
  description:
    "Every article in the Faceless Angels Journal: teaching, devotionals, testimonies, and stories.",
  alternates: { canonical: "/journal/articles" },
};

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-ink bg-ink text-surface"
          : "border-line bg-surface text-ink hover:border-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function AllArticlesPage({
  searchParams,
}: PageProps<"/journal/articles">) {
  const params = await searchParams;
  const subject = one(params.subject);
  const kind = one(params.kind) in KIND_LABELS ? one(params.kind) : "";
  const page = Number(one(params.page)) || 1;

  const [categories, result] = await Promise.all([
    journal<JournalCategory[]>("/categories"),
    journal<List>(
      `/articles?${new URLSearchParams({
        ...(subject ? { category: subject } : {}),
        ...(kind ? { kind } : {}),
        page: String(page),
      })}`,
    ),
  ]);
  const subjects = (categories ?? []).filter((c) => c.articles > 0);
  const subjectLabel = subjects.find((c) => c.key === subject)?.label;

  /** The address of this page with one filter changed. Resets to page one. */
  function withFilter(change: { subject?: string; kind?: string }) {
    const next = new URLSearchParams();
    const s = change.subject ?? subject;
    const k = change.kind ?? kind;
    if (s) next.set("subject", s);
    if (k) next.set("kind", k);
    const query = next.toString();
    return query ? `/journal/articles?${query}` : "/journal/articles";
  }

  const pageQuery = new URLSearchParams();
  if (subject) pageQuery.set("subject", subject);
  if (kind) pageQuery.set("kind", kind);

  const total = result?.total ?? 0;

  return (
    <PublicShell>
      <Link href="/journal" className="text-sm text-muted hover:text-ink">
        ← Journal
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="font-serif text-4xl sm:text-5xl">All articles</h1>
          <p className="text-muted tabular-nums">
            {result === null
              ? "We could not load the articles. Try again in a moment."
              : total === 0
                ? "Nothing here yet."
                : `${total === 1 ? "1 article" : `${total} articles`}${
                    subjectLabel ? ` in ${subjectLabel}` : ""
                  }${kind ? ` · ${KIND_LABELS[kind]}` : ""}, newest first.`}
          </p>
        </div>
        <SearchBox />
      </div>

      <div className="flex flex-col gap-4 border-t border-line pt-6">
        {subjects.length > 0 ? (
          <nav aria-label="Subjects" className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Subject
            </span>
            <Chip href={withFilter({ subject: "" })} active={!subject}>
              All
            </Chip>
            {subjects.map((c) => (
              <Chip
                key={c.key}
                href={withFilter({ subject: c.key })}
                active={subject === c.key}
              >
                {c.label}{" "}
                <span className="tabular-nums opacity-70">{c.articles}</span>
              </Chip>
            ))}
          </nav>
        ) : null}
        <nav aria-label="Kinds" className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Kind
          </span>
          <Chip href={withFilter({ kind: "" })} active={!kind}>
            All
          </Chip>
          {Object.entries(KIND_LABELS).map(([key, label]) => (
            <Chip key={key} href={withFilter({ kind: key })} active={kind === key}>
              {label}
            </Chip>
          ))}
        </nav>
      </div>

      {result && result.articles.length > 0 ? (
        <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {result.articles.map((article) => (
            <li key={article.id}>
              <ArticleTile article={article} />
            </li>
          ))}
        </ul>
      ) : result && (subject || kind) ? (
        <p className="text-muted">
          No articles match.{" "}
          <Link href="/journal/articles" className="underline underline-offset-4">
            Show every article
          </Link>
        </p>
      ) : null}

      {result ? (
        <Pager
          page={result.page}
          pages={result.pages}
          href={(n) => {
            const q = new URLSearchParams(pageQuery);
            q.set("page", String(n));
            return `/journal/articles?${q}`;
          }}
        />
      ) : null}
    </PublicShell>
  );
}
