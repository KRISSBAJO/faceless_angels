import type { Metadata } from "next";
import Link from "next/link";
import {
  ArticleList,
  Byline,
  Kicker,
  SearchBox,
} from "@/components/journal/ArticleCards";
import PublicShell from "@/components/PublicShell";
import { journal } from "@/lib/journal-server";
import { mediaUrl, type JournalHome } from "@/lib/journal";

export const metadata: Metadata = {
  title: "Journal · Faceless Angels",
  description:
    "Devotionals, Bible study, and Christian living, with true stories of prayer answered and help quietly given.",
};

export default async function JournalPage() {
  const home = await journal<JournalHome>("");

  if (!home) {
    return (
      <PublicShell>
        <h1 className="font-serif text-4xl">Journal</h1>
        <p className="text-muted">
          We could not load the Journal. Try again in a moment.
        </p>
      </PublicShell>
    );
  }

  const { featured, dailyBread, latest } = home;
  const categories = home.categories.filter((c) => c.articles > 0);
  const showDaily = dailyBread && dailyBread.id !== featured?.id;

  return (
    <PublicShell>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="font-serif text-4xl sm:text-5xl">Journal</h1>
          <p className="leading-7 text-muted">
            Teaching, devotionals, and true stories. Read, reflect, and then
            do something about it.
          </p>
        </div>
        <SearchBox />
      </div>

      {!featured ? (
        <p className="text-muted">
          Nothing is published yet. Come back soon.
        </p>
      ) : (
        <>
          <section
            aria-label="Featured"
            className="grid gap-8 border-t border-line pt-8 lg:grid-cols-[1.3fr_1fr]"
          >
            <article className="flex flex-col gap-4">
              {featured.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrl(featured.cover.id)}
                  alt={featured.cover.alt}
                  className="aspect-[16/9] w-full rounded-xl object-cover"
                />
              ) : null}
              <Kicker article={featured} />
              <h2 className="font-serif text-3xl leading-tight sm:text-4xl">
                <Link
                  href={`/journal/${featured.slug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {featured.title}
                </Link>
              </h2>
              {featured.summary ? (
                <p className="max-w-[38rem] text-lg leading-8 text-muted">
                  {featured.summary}
                </p>
              ) : null}
              <Byline article={featured} />
            </article>

            <div className="flex flex-col gap-8">
              {showDaily ? (
                <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                    Today&apos;s Daily Bread
                  </p>
                  <h2 className="font-serif text-2xl leading-snug">
                    <Link
                      href={`/journal/${dailyBread.slug}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {dailyBread.title}
                    </Link>
                  </h2>
                  {dailyBread.summary ? (
                    <p className="text-sm leading-6 text-muted">
                      {dailyBread.summary}
                    </p>
                  ) : null}
                  <Byline article={dailyBread} />
                </article>
              ) : null}

              {categories.length > 0 ? (
                <nav aria-label="Categories" className="flex flex-col gap-3">
                  <h2 className="font-medium">Read by subject</h2>
                  <ul className="flex flex-col text-sm">
                    {categories.map((category) => (
                      <li
                        key={category.key}
                        className="border-t border-line first:border-t-0"
                      >
                        <Link
                          href={`/journal/category/${category.key}`}
                          className="flex items-baseline justify-between gap-4 py-2.5 hover:underline hover:underline-offset-4"
                        >
                          <span>{category.label}</span>
                          <span className="text-muted tabular-nums">
                            {category.articles}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}
            </div>
          </section>

          {home.series.length > 0 ? (
            <section className="flex flex-col gap-4 border-t border-line pt-8">
              <h2 className="font-serif text-2xl">Series</h2>
              <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {home.series.map((series) => (
                  <li key={series.slug} className="flex flex-col gap-1">
                    <Link
                      href={`/journal/series/${series.slug}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {series.title}
                    </Link>
                    <span className="text-sm leading-6 text-muted">
                      {series.description}
                    </span>
                    <span className="text-sm text-muted tabular-nums">
                      {series.articles === 1
                        ? "1 part"
                        : `${series.articles} parts`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {latest.length > 0 ? (
            <section className="flex max-w-3xl flex-col gap-2 border-t border-line pt-8">
              <h2 className="font-serif text-2xl">Latest</h2>
              <ArticleList articles={latest} empty="" />
              <p className="pt-2 text-sm">
                <Link
                  href="/journal/search"
                  className="underline underline-offset-4"
                >
                  See every article
                </Link>
              </p>
            </section>
          ) : null}
        </>
      )}
    </PublicShell>
  );
}
