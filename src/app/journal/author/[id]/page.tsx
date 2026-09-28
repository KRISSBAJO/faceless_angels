import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleList, Pager } from "@/components/journal/ArticleCards";
import PublicShell from "@/components/PublicShell";
import { journal } from "@/lib/journal-server";
import {
  mediaUrl,
  type ArticleList as List,
  type AuthorProfile,
} from "@/lib/journal";

export async function generateMetadata({
  params,
}: PageProps<"/journal/author/[id]">): Promise<Metadata> {
  const author = await journal<AuthorProfile>(`/authors/${(await params).id}`);
  return author
    ? {
        title: `${author.name} · Journal`,
        description: author.bio ?? undefined,
      }
    : { title: "Journal" };
}

export default async function AuthorPage({
  params,
  searchParams,
}: PageProps<"/journal/author/[id]">) {
  const { id } = await params;
  const page = Number((await searchParams).page) || 1;
  const author = await journal<AuthorProfile>(`/authors/${id}`);
  if (!author) notFound();

  const result = await journal<List>(`/articles?author=${id}&page=${page}`);

  return (
    <PublicShell>
      <Link href="/journal" className="text-sm text-muted hover:text-ink">
        ← Journal
      </Link>
      <header className="flex max-w-3xl flex-wrap items-start gap-6">
        {author.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(author.photo)}
            alt=""
            className="size-28 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-28 shrink-0 items-center justify-center rounded-full bg-line font-serif text-5xl"
          >
            {author.name.slice(0, 1)}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="font-serif text-4xl">{author.name}</h1>
          {author.title ? <p className="text-muted">{author.title}</p> : null}
          {author.bio ? (
            <p className="whitespace-pre-wrap leading-7">{author.bio}</p>
          ) : null}
          <p className="text-sm text-muted tabular-nums">
            {author.articles === 1
              ? "1 article"
              : `${author.articles} articles`}
          </p>
        </div>
      </header>
      <div className="max-w-3xl">
        <ArticleList articles={result?.articles ?? []} empty="" />
      </div>
      {result ? (
        <Pager
          page={result.page}
          pages={result.pages}
          href={(n) => `/journal/author/${id}?page=${n}`}
        />
      ) : null}
    </PublicShell>
  );
}
