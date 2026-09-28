import type { Metadata } from "next";
import Link from "next/link";
import {
  ArticleList,
  Pager,
  SearchBox,
} from "@/components/journal/ArticleCards";
import PublicShell from "@/components/PublicShell";
import { journal } from "@/lib/journal-server";
import type { ArticleList as List } from "@/lib/journal";

export const metadata: Metadata = { title: "Search · Journal" };

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/journal/search">) {
  const params = await searchParams;
  const q = one(params.q);
  const tag = one(params.tag);
  const author = one(params.author);
  const page = Number(one(params.page)) || 1;

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (tag) query.set("tag", tag);
  if (author) query.set("author", author);
  const result = await journal<List>(`/articles?${query}&page=${page}`);

  return (
    <PublicShell>
      <Link href="/journal" className="text-sm text-muted hover:text-ink">
        ← Journal
      </Link>
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-4xl">
          {tag
            ? `Tagged “${tag}”`
            : q
              ? "Search results"
              : author && result?.articles[0]
                ? `By ${result.articles[0].author.name}`
                : "Every article"}
        </h1>
        <SearchBox value={q} />
        {result && (q || tag) ? (
          <p className="text-sm text-muted tabular-nums">
            {result.total === 0
              ? ""
              : result.total === 1
                ? "1 article"
                : `${result.total} articles`}
          </p>
        ) : null}
      </div>
      <div className="max-w-3xl">
        <ArticleList
          articles={result?.articles ?? []}
          empty={
            q
              ? `Nothing matches “${q}”. Try fewer or different words.`
              : "Nothing is published yet."
          }
        />
      </div>
      {result ? (
        <Pager
          page={result.page}
          pages={result.pages}
          href={(n) => `/journal/search?${query}&page=${n}`}
        />
      ) : null}
    </PublicShell>
  );
}
