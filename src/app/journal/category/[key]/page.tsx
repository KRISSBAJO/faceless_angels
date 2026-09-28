import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleList, Pager } from "@/components/journal/ArticleCards";
import FollowCategory from "@/components/journal/FollowCategory";
import PublicShell from "@/components/PublicShell";
import { journal } from "@/lib/journal-server";
import type { ArticleList as List, JournalCategory } from "@/lib/journal";

async function load(key: string) {
  const categories = await journal<JournalCategory[]>("/categories");
  return categories?.find((c) => c.key === key) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps<"/journal/category/[key]">): Promise<Metadata> {
  const category = await load((await params).key);
  return category
    ? { title: `${category.label} · Journal`, description: category.description }
    : { title: "Journal" };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/journal/category/[key]">) {
  const { key } = await params;
  const page = Number((await searchParams).page) || 1;
  const category = await load(key);
  if (!category) notFound();

  const result = await journal<List>(
    `/articles?category=${encodeURIComponent(key)}&page=${page}`,
  );

  return (
    <PublicShell>
      <Link href="/journal" className="text-sm text-muted hover:text-ink">
        ← Journal
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="font-serif text-4xl sm:text-5xl">{category.label}</h1>
          <p className="leading-7 text-muted">{category.description}</p>
        </div>
        <FollowCategory category={category} />
      </div>
      <div className="max-w-3xl">
        <ArticleList
          articles={result?.articles ?? []}
          empty="Nothing is published here yet."
        />
      </div>
      {result ? (
        <Pager
          page={result.page}
          pages={result.pages}
          href={(n) => `/journal/category/${key}?page=${n}`}
        />
      ) : null}
    </PublicShell>
  );
}
