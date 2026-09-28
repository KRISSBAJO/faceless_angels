import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ContentsFolded,
  ContentsRail,
  ReadingProgress,
} from "@/components/journal/ArticleContents";
import { ArticleTile } from "@/components/journal/ArticleCards";
import Comments from "@/components/journal/Comments";
import Engagement from "@/components/journal/Engagement";
import Markdown from "@/components/journal/Markdown";
import { Badges, NeedFacts, PledgeProgress } from "@/components/NeedCard";
import PublicShell from "@/components/PublicShell";
import ShareBar from "@/components/ShareBar";
import type { Need } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { journal } from "@/lib/journal-server";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import {
  articleHeadings,
  formatDate,
  KIND_LABELS,
  mediaUrl,
  minutes,
  STAGE_LABELS,
  type Article,
} from "@/lib/journal";
import { apiOrigin } from "@/lib/api-origin";

const API_URL = apiOrigin();

export async function generateMetadata({
  params,
}: PageProps<"/journal/[slug]">): Promise<Metadata> {
  const article = await journal<Article>(`/articles/${(await params).slug}`);
  if (!article) return { title: "Journal · Faceless Angels" };
  const path = `/journal/${article.slug}`;
  const card = { url: `${path}/card`, width: 1200, height: 630, alt: article.title };
  return {
    title: `${article.title} · Faceless Angels`,
    description: article.summary || undefined,
    alternates: { canonical: path },
    // A draft a staff member is previewing must not be indexed.
    robots: article.live ? undefined : { index: false, follow: false },
    openGraph: {
      title: article.title,
      description: article.summary || undefined,
      url: path,
      type: "article",
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt,
      section: article.category.label,
      tags: article.tags,
      authors: [article.author.name],
      images: [card],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.summary || undefined,
      images: [card.url],
    },
  };
}

async function openNeeds(): Promise<Need[]> {
  try {
    const res = await fetch(`${API_URL}/api/needs`, { cache: "no-store" });
    if (!res.ok) return [];
    const needs = (await res.json()) as Need[];
    return needs.filter((n) => n.remainingCents > 0).slice(0, 2);
  } catch {
    return [];
  }
}

const INVITATIONS: Record<
  string,
  { title: string; body: string; href: string; action: string }
> = {
  pray: {
    title: "Bring this to God",
    body: "Write a prayer. Keep it to yourself, or ask others to pray with you.",
    href: "/prayer/new",
    action: "Ask for prayer",
  },
  group: {
    title: "Do not walk this alone",
    body: "Find a group that prays together each week.",
    href: "/prayer/groups",
    action: "Find a prayer group",
  },
  ask: {
    title: "If you need help yourself",
    body: "Tell us in private. Donors never see your name.",
    href: "/ask",
    action: "Ask for help",
  },
};

async function Invitation({ action }: { action: string }) {
  if (action === "give") {
    const needs = await openNeeds();
    if (needs.length === 0) return null;
    return (
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
            Put it into practice
          </p>
          <h2 className="font-serif text-2xl">
            Do not only read about it
          </h2>
          <p className="text-muted">
            These needs are open now. The person you help never learns your
            name.
          </p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2">
          {needs.map((need) => (
            <li key={need.ref}>
              <article className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                <NeedFacts need={need} />
                <Link
                  href={`/needs/${need.ref}`}
                  className="font-serif text-xl leading-snug underline-offset-4 hover:underline"
                >
                  {need.summary}
                </Link>
                <Badges badges={need.badges} />
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <p className="font-serif text-2xl tabular-nums">
                    {formatCents(need.amountCents)}
                  </p>
                  <PledgeProgress need={need} />
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  const invite = INVITATIONS[action];
  if (!invite) return null;
  return (
    <section className="flex flex-col items-start gap-5 rounded-2xl border border-line border-l-4 border-l-gold-bright bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
          Put it into practice
        </p>
        <h2 className="font-serif text-2xl">{invite.title}</h2>
        <p className="max-w-md text-sm leading-6 text-muted">{invite.body}</p>
      </div>
      <Link href={invite.href} className="btn btn-primary shrink-0">
        {invite.action}
      </Link>
    </section>
  );
}

export default async function ArticlePage({
  params,
}: PageProps<"/journal/[slug]">) {
  const article = await journal<Article>(`/articles/${(await params).slug}`);
  if (!article) notFound();

  const realPeople = article.kind === "story" || article.kind === "testimony";

  // Tells search engines what the page is, so results can show the author,
  // the date, and the picture.
  const structured = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary || undefined,
    image: [`${SITE_URL}/journal/${article.slug}/card`],
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt,
    articleSection: article.category.label,
    keywords: article.tags.join(", ") || undefined,
    author: {
      "@type": "Person",
      name: article.author.name,
      url: `${SITE_URL}/journal/author/${article.author.id}`,
    },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/journal/${article.slug}`,
  };

  const headings = articleHeadings(article.body);
  const author = article.author;

  return (
    <PublicShell wide>
      {article.live ? <ReadingProgress target="article-body" /> : null}

      {article.live ? (
        <script
          type="application/ld+json"
          // Written by us from our own data. "<" is escaped so the text
          // cannot close the script tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}

      {article.live ? null : (
        <p className="rounded-lg border border-gold-bright bg-gold-soft px-4 py-3 text-sm">
          You are previewing this as staff. Readers cannot see it.{" "}
          <strong>{STAGE_LABELS[article.status] ?? article.status}</strong>
        </p>
      )}

      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/journal" className="hover:text-ink">
              Journal
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link
              href={`/journal/category/${article.category.key}`}
              className="hover:text-ink"
            >
              {article.category.label}
            </Link>
          </li>
        </ol>
      </nav>

      <header className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center">
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold">
          <span>{KIND_LABELS[article.kind] ?? article.category.label}</span>
          {article.series ? (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/journal/series/${article.series.slug}`}
                className="hover:underline hover:underline-offset-4"
              >
                {article.series.title}
                {article.series.position
                  ? `, part ${article.series.position}`
                  : ""}
              </Link>
            </>
          ) : null}
        </p>
        <h1 className="font-serif text-4xl leading-[1.1] text-balance sm:text-5xl lg:text-6xl">
          {article.title}
        </h1>
        {article.summary ? (
          <p className="max-w-2xl text-lg leading-8 text-balance text-muted sm:text-xl">
            {article.summary}
          </p>
        ) : null}
        <div className="flex items-center gap-3 pt-1 text-left">
          <Avatar name={author.name} photo={author.photo} size="size-11" />
          <div className="flex flex-col text-sm">
            <Link
              href={`/journal/author/${author.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {author.name}
            </Link>
            <span className="text-muted">
              {article.publishedAt
                ? formatDate(article.publishedAt)
                : "Not published yet"}{" "}
              · {minutes(article.readingMinutes)}
            </span>
          </div>
        </div>
      </header>

      {article.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(article.cover.id)}
          alt={article.cover.alt}
          className="aspect-[2/1] w-full rounded-2xl object-cover"
        />
      ) : (
        <div aria-hidden className="mx-auto h-px w-24 bg-gold-bright" />
      )}

      <div className="grid gap-10 lg:grid-cols-[11rem_minmax(0,1fr)_11rem] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <ContentsRail headings={headings} />
          </div>
        </aside>

        <div
          id="article-body"
          className="mx-auto flex w-full min-w-0 max-w-[42rem] flex-col gap-10"
        >
          <ContentsFolded headings={headings} />

          {realPeople ? (
            <p className="border-l-2 border-gold-bright pl-4 text-sm leading-6 text-muted">
              {article.kind === "story"
                ? "This is a true account, shared with consent. Names and details are changed so no one can be identified."
                : "This is a testimony, told by the person it happened to and shared with their consent."}{" "}
              It is {KIND_LABELS[article.kind].toLowerCase()}, not teaching.
            </p>
          ) : null}

          {article.scripture.length > 0 ? (
            <aside
              aria-label="Scripture"
              className="flex flex-col gap-6 rounded-2xl bg-gold-soft px-6 py-7 sm:px-8"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                Scripture
              </p>
              {article.scripture.map((passage) => (
                <figure key={passage.ref} className="flex flex-col gap-2">
                  {passage.text ? (
                    <blockquote className="font-serif text-xl italic leading-relaxed sm:text-2xl sm:leading-relaxed">
                      “{passage.text}”
                    </blockquote>
                  ) : null}
                  <figcaption className="text-sm font-medium text-gold">
                    {passage.text ? "— " : ""}
                    {passage.ref}
                    {passage.text && passage.translation
                      ? ` · ${passage.translation.toUpperCase()}`
                      : ""}
                  </figcaption>
                </figure>
              ))}
            </aside>
          ) : null}

          <Markdown>{article.body}</Markdown>

          {article.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-1 text-muted">Topics</span>
              {article.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/journal/search?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-line bg-surface px-3 py-1 hover:border-ink"
                >
                  {tag}
                </Link>
              ))}
            </div>
          ) : null}

          {article.reflection.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="font-serif text-2xl">To think about</h2>
              <ol className="flex flex-col border-y border-line">
                {article.reflection.map((question, i) => (
                  <li
                    key={question}
                    className="flex gap-5 border-t border-line py-4 first:border-t-0"
                  >
                    <span className="pt-0.5 font-mono text-sm text-gold tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="leading-7">{question}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <Invitation action={article.action} />

          {article.corrections.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-xl border border-line px-5 py-4 text-sm">
              <h2 className="font-medium">Corrections</h2>
              <ul className="flex flex-col gap-2 text-muted">
                {article.corrections.map((correction) => (
                  <li key={correction.at}>
                    {formatDate(correction.at)}: {correction.body}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-8 flex flex-col gap-8">
            {article.live ? (
              <ShareBar
                path={`/journal/${article.slug}`}
                title={article.title}
                summary={article.summary}
                articleId={article.id}
                stacked
              />
            ) : null}
            {article.live && (article.allowComments || article.comments > 0) ? (
              <a
                href="#comments"
                className="text-sm font-medium underline underline-offset-4"
              >
                {article.comments === 0
                  ? "Start the conversation"
                  : article.comments === 1
                    ? "1 comment"
                    : `${article.comments} comments`}
              </a>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="mx-auto flex w-full max-w-[42rem] flex-col gap-10">
        {article.live ? <Engagement article={article} /> : null}

        <section
          aria-label="About the author"
          className="flex flex-col gap-5 rounded-2xl border border-line p-6 sm:flex-row sm:p-8"
        >
          <Avatar name={author.name} photo={author.photo} size="size-16" />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
              Written by
            </p>
            <Link
              href={`/journal/author/${author.id}`}
              className="font-serif text-2xl underline-offset-4 hover:underline"
            >
              {author.name}
            </Link>
            {author.title ? (
              <p className="text-sm text-muted">{author.title}</p>
            ) : null}
            {author.bio ? (
              <p className="leading-7 text-muted">{author.bio}</p>
            ) : null}
            <Link
              href={`/journal/author/${author.id}`}
              className="pt-1 text-sm font-medium underline underline-offset-4"
            >
              More from {author.name}
            </Link>
            <p className="pt-2 text-xs text-muted">
              {article.reviewedBy
                ? `Reviewed by ${article.reviewedBy} before it was published.`
                : "Published by an administrator."}
            </p>
          </div>
        </section>

        {article.seriesArticles.length > 1 && article.series ? (
          <nav
            aria-label="This series"
            className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 sm:p-8"
          >
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                Series
              </p>
              <h2 className="font-serif text-2xl">
                <Link
                  href={`/journal/series/${article.series.slug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {article.series.title}
                </Link>
              </h2>
            </div>
            <ol className="flex flex-col text-sm">
              {article.seriesArticles.map((part, i) => (
                <li
                  key={part.slug}
                  className="flex gap-4 border-t border-line py-3 first:border-t-0"
                >
                  <span className="w-14 shrink-0 font-mono text-gold">
                    Part {part.position ?? i + 1}
                  </span>
                  {part.current ? (
                    <span aria-current="page" className="font-medium">
                      {part.title}{" "}
                      <span className="font-normal text-muted">
                        · you are here
                      </span>
                    </span>
                  ) : (
                    <Link
                      href={`/journal/${part.slug}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {part.title}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
            {article.next ? (
              <Link
                href={`/journal/${article.next.slug}`}
                className="btn btn-primary self-start"
              >
                Next: {article.next.title}
              </Link>
            ) : null}
          </nav>
        ) : null}

        {article.live ? (
          <Comments
            articleId={article.id}
            slug={article.slug}
            open={article.allowComments}
          />
        ) : null}
      </div>

      {article.related.length > 0 ? (
        <section className="flex flex-col gap-8 border-t border-line pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-serif text-3xl">Keep reading</h2>
            <Link
              href="/journal/articles"
              className="text-sm font-medium underline underline-offset-4"
            >
              All articles
            </Link>
          </div>
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {article.related.slice(0, 3).map((next) => (
              <li key={next.id}>
                <ArticleTile article={next} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PublicShell>
  );
}

/** The author's photo, or their first letter when there is none. */
function Avatar({
  name,
  photo,
  size,
}: {
  name: string;
  photo: string | null;
  size: string;
}) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaUrl(photo)}
      alt=""
      className={`${size} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-gold-soft font-serif text-xl text-gold`}
    >
      {name.slice(0, 1)}
    </span>
  );
}
