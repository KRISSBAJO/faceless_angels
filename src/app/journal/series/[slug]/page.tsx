import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicShell from "@/components/PublicShell";
import { journal } from "@/lib/journal-server";
import { minutes, type ArticleCard } from "@/lib/journal";

interface Series {
  slug: string;
  title: string;
  description: string;
  articles: ArticleCard[];
}

export async function generateMetadata({
  params,
}: PageProps<"/journal/series/[slug]">): Promise<Metadata> {
  const series = await journal<Series>(`/series/${(await params).slug}`);
  return series
    ? { title: `${series.title} · Journal`, description: series.description }
    : { title: "Journal" };
}

export default async function SeriesPage({
  params,
}: PageProps<"/journal/series/[slug]">) {
  const series = await journal<Series>(`/series/${(await params).slug}`);
  if (!series) notFound();

  return (
    <PublicShell>
      <Link href="/journal" className="text-sm text-muted hover:text-ink">
        ← Journal
      </Link>
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
          A series in {series.articles.length}{" "}
          {series.articles.length === 1 ? "part" : "parts"}
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl">{series.title}</h1>
        <p className="leading-7 text-muted">{series.description}</p>
      </div>
      <ol className="flex max-w-3xl flex-col">
        {series.articles.map((article, i) => (
          <li
            key={article.id}
            className="grid gap-x-6 gap-y-1 border-t border-line py-5 last:border-b sm:grid-cols-[5rem_1fr]"
          >
            <span className="font-mono text-sm text-gold">
              Part {article.series?.position ?? i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <Link
                href={`/journal/${article.slug}`}
                className="font-serif text-2xl leading-snug underline-offset-4 hover:underline"
              >
                {article.title}
              </Link>
              {article.summary ? (
                <p className="text-sm leading-6 text-muted">
                  {article.summary}
                </p>
              ) : null}
              <p className="text-sm text-muted">
                {article.author.name} · {minutes(article.readingMinutes)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </PublicShell>
  );
}
