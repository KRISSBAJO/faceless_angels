import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Byline, Kicker } from "@/components/journal/ArticleCards";
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
  formatDate,
  KIND_LABELS,
  mediaUrl,
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
      <section className="flex flex-col gap-5 border-t border-line pt-8">
        <div className="flex flex-col gap-2">
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
    <section className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-serif text-2xl">{invite.title}</h2>
      <p className="text-muted">{invite.body}</p>
      <Link href={invite.href} className="btn btn-primary">
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

  return (
    <PublicShell>
      <Link href="/journal" className="text-sm text-muted hover:text-ink">
        ← Journal
      </Link>

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
        <p className="max-w-3xl rounded-lg border border-gold-bright bg-gold-soft px-4 py-3 text-sm">
          You are previewing this as staff. Readers cannot see it.{" "}
          <strong>{STAGE_LABELS[article.status] ?? article.status}</strong>
        </p>
      )}

      <article className="flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <Kicker article={article} />
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
            {article.title}
          </h1>
          {article.summary ? (
            <p className="text-xl leading-8 text-muted">{article.summary}</p>
          ) : null}
          <Byline article={article} />
          {article.live ? (
            <ShareBar
              path={`/journal/${article.slug}`}
              title={article.title}
              summary={article.summary}
              articleId={article.id}
            />
          ) : null}
        </header>

        {article.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(article.cover.id)}
            alt={article.cover.alt}
            className="aspect-[16/9] w-full rounded-xl object-cover"
          />
        ) : null}

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
            className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6"
          >
            {article.scripture.map((passage) => (
              <figure key={passage.ref} className="flex flex-col gap-1">
                {passage.text ? (
                  <blockquote className="font-serif text-xl italic leading-relaxed">
                    {passage.text}
                  </blockquote>
                ) : null}
                <figcaption
                  className={
                    passage.text ? "text-sm text-muted" : "font-medium"
                  }
                >
                  {passage.ref}
                  {passage.text && passage.translation
                    ? ` (${passage.translation.toUpperCase()})`
                    : ""}
                </figcaption>
              </figure>
            ))}
          </aside>
        ) : null}

        <Markdown>{article.body}</Markdown>

        {article.reflection.length > 0 ? (
          <section className="flex flex-col gap-3 border-t border-line pt-8">
            <h2 className="font-serif text-2xl">To think about</h2>
            <ul className="flex flex-col gap-3">
              {article.reflection.map((question) => (
                <li
                  key={question}
                  className="border-l-2 border-line pl-4 leading-7"
                >
                  {question}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Invitation action={article.action} />

        {article.corrections.length > 0 ? (
          <section className="flex flex-col gap-2 border-t border-line pt-6 text-sm">
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

        <footer className="flex flex-col gap-3 border-t border-line pt-6 text-sm">
          <section
            aria-label="About the author"
            className="flex items-start gap-4"
          >
            {article.author.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(article.author.photo)}
                alt=""
                className="size-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-16 shrink-0 items-center justify-center rounded-full bg-line font-serif text-2xl"
              >
                {article.author.name.slice(0, 1)}
              </span>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                About the author
              </span>
              <Link
                href={`/journal/author/${article.author.id}`}
                className="text-base font-medium underline-offset-4 hover:underline"
              >
                {article.author.name}
              </Link>
              {article.author.title ? (
                <span className="text-muted">{article.author.title}</span>
              ) : null}
              {article.author.bio ? (
                <p className="max-w-xl leading-6 text-muted">
                  {article.author.bio}
                </p>
              ) : null}
            </div>
          </section>
          <p className="text-muted">
            {article.reviewedBy
              ? `Reviewed by ${article.reviewedBy} before it was published.`
              : "Published by an administrator."}
          </p>
          {article.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={`/journal/search?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full border border-line px-3 py-1 text-muted hover:border-muted hover:text-ink"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </footer>

        {article.live ? <Engagement article={article} /> : null}

        {article.seriesArticles.length > 1 && article.series ? (
          <nav
            aria-label="This series"
            className="flex flex-col gap-3 border-t border-line pt-8"
          >
            <h2 className="font-serif text-2xl">
              <Link
                href={`/journal/series/${article.series.slug}`}
                className="underline-offset-4 hover:underline"
              >
                {article.series.title}
              </Link>
            </h2>
            <ol className="flex flex-col text-sm">
              {article.seriesArticles.map((part, i) => (
                <li
                  key={part.slug}
                  className="flex gap-4 border-t border-line py-2.5 first:border-t-0"
                >
                  <span className="w-14 shrink-0 font-mono text-gold">
                    Part {part.position ?? i + 1}
                  </span>
                  {part.current ? (
                    <span aria-current="page" className="font-medium">
                      {part.title}
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
                className="btn btn-ghost self-start"
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
      </article>

      {article.related.length > 0 ? (
        <section className="flex max-w-3xl flex-col gap-4 border-t border-line pt-8">
          <h2 className="font-serif text-2xl">Read next</h2>
          <ul className="flex flex-col">
            {article.related.map((next) => (
              <li
                key={next.id}
                className="flex flex-col gap-1 border-t border-line py-4 first:border-t-0"
              >
                <Link
                  href={`/journal/${next.slug}`}
                  className="font-serif text-xl underline-offset-4 hover:underline"
                >
                  {next.title}
                </Link>
                <Byline article={next} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PublicShell>
  );
}
