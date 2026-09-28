import Link from "next/link";
import {
  formatDate,
  KIND_LABELS,
  mediaUrl,
  minutes,
  type ArticleCard,
} from "@/lib/journal";

export function Byline({ article }: { article: ArticleCard }) {
  return (
    <p className="text-sm text-muted">
      {article.author.name}
      {article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ""} ·{" "}
      {minutes(article.readingMinutes)}
    </p>
  );
}

export function Kicker({ article }: { article: ArticleCard }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
      <Link
        href={`/journal/category/${article.category.key}`}
        className="hover:text-ink"
      >
        {article.category.label}
      </Link>
      {article.kind === "story" || article.kind === "testimony"
        ? ` · ${KIND_LABELS[article.kind]}`
        : ""}
      {article.series
        ? ` · ${article.series.title}${
            article.series.position ? `, part ${article.series.position}` : ""
          }`
        : ""}
    </p>
  );
}

/** Shows search matches, marked by the server with << and >>. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/<<|>>/);
  return (
    <p className="text-sm leading-6 text-muted">
      …
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-gold-soft px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
      …
    </p>
  );
}

export function ArticleRow({ article }: { article: ArticleCard }) {
  return (
    <article className="flex gap-5 border-t border-line py-6 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Kicker article={article} />
        <h3 className="font-serif text-2xl leading-snug">
          <Link
            href={`/journal/${article.slug}`}
            className="underline-offset-4 hover:underline"
          >
            {article.title}
          </Link>
        </h3>
        {article.snippet ? (
          <Snippet text={article.snippet} />
        ) : article.summary ? (
          <p className="text-sm leading-6 text-muted">{article.summary}</p>
        ) : null}
        <Byline article={article} />
      </div>
      {article.cover ? (
        // Covers are served by our own API, so the plain element is right.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(article.cover.id)}
          alt={article.cover.alt}
          loading="lazy"
          className="hidden h-28 w-40 shrink-0 rounded-lg object-cover sm:block"
        />
      ) : null}
    </article>
  );
}

/** An article as a card in a grid, with its cover on top. */
export function ArticleTile({ article }: { article: ArticleCard }) {
  return (
    <article className="group flex h-full flex-col gap-3">
      <Link href={`/journal/${article.slug}`} tabIndex={-1} aria-hidden>
        {article.cover ? (
          // Covers are served by our own API, so the plain element is right.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(article.cover.id)}
            alt=""
            loading="lazy"
            className="aspect-[16/10] w-full rounded-xl object-cover"
          />
        ) : (
          // Without a cover, the subject stands in for a picture.
          <div className="flex aspect-[16/10] w-full flex-col justify-between rounded-xl border border-line bg-surface p-5 transition-colors group-hover:border-gold-bright">
            <span
              aria-hidden
              className="font-serif text-5xl leading-none text-gold-bright/60"
            >
              “
            </span>
            <span className="flex flex-col gap-2">
              <span className="h-px w-10 bg-gold-bright" />
              <span className="font-serif text-xl italic leading-tight text-gold">
                {article.category.label}
              </span>
            </span>
          </div>
        )}
      </Link>
      <Kicker article={article} />
      <h3 className="font-serif text-2xl leading-snug">
        <Link
          href={`/journal/${article.slug}`}
          className="underline-offset-4 group-hover:underline"
        >
          {article.title}
        </Link>
      </h3>
      {article.summary ? (
        <p className="line-clamp-3 text-sm leading-6 text-muted">
          {article.summary}
        </p>
      ) : null}
      <div className="mt-auto">
        <Byline article={article} />
      </div>
    </article>
  );
}

export function ArticleList({
  articles,
  empty,
}: {
  articles: ArticleCard[];
  empty: string;
}) {
  if (articles.length === 0) {
    return <p className="text-muted">{empty}</p>;
  }
  return (
    <div className="flex flex-col">
      {articles.map((article) => (
        <ArticleRow key={article.id} article={article} />
      ))}
    </div>
  );
}

export function Pager({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  /** Builds the address of a page. */
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm"
    >
      {page > 1 ? (
        <Link href={href(page - 1)} className="underline underline-offset-4">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted tabular-nums">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="underline underline-offset-4">
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function SearchBox({ value = "" }: { value?: string }) {
  return (
    <form
      action="/journal/search"
      role="search"
      className="flex max-w-md items-end gap-3"
    >
      <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
        Search the Journal
        <input
          id="journal-search"
          name="q"
          type="search"
          className="input font-normal"
          defaultValue={value}
          placeholder="Prayer, forgiveness, Psalm 23"
          required
          minLength={2}
          maxLength={120}
        />
      </label>
      <button type="submit" className="btn btn-ghost">
        Search
      </button>
    </form>
  );
}
