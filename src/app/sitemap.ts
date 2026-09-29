import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { apiOrigin } from "@/lib/api-origin";

const API_URL = apiOrigin();

interface Everything {
  articles: { slug: string; updatedAt: string }[];
  categories: { key: string; latest: string | null }[];
  series: { slug: string; latest: string | null }[];
  authors: { id: string; latest: string | null }[];
}

// Built at request time, so a new article is listed at once.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/prayer`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/journal`, changeFrequency: "daily", priority: 0.9 },
    {
      url: `${SITE_URL}/journal/articles`,
      changeFrequency: "daily",
      priority: 0.8,
    },
    { url: `${SITE_URL}/needs`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/donate`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/transparency`, changeFrequency: "weekly", priority: 0.6 },
    ...["/contact", "/privacy", "/terms", "/giving-policy"].map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  let everything: Everything | null = null;
  try {
    const res = await fetch(`${API_URL}/api/journal/everything`, {
      cache: "no-store",
    });
    if (res.ok) everything = (await res.json()) as Everything;
  } catch {
    // The API is down. The fixed pages are still listed.
  }
  if (!everything) return fixed;

  const when = (value: string | null) => (value ? new Date(value) : undefined);
  return [
    ...fixed,
    ...everything.articles.map((a) => ({
      url: `${SITE_URL}/journal/${a.slug}`,
      lastModified: new Date(a.updatedAt),
      priority: 0.7,
    })),
    ...everything.categories.map((c) => ({
      url: `${SITE_URL}/journal/category/${c.key}`,
      lastModified: when(c.latest),
      priority: 0.6,
    })),
    ...everything.series.map((s) => ({
      url: `${SITE_URL}/journal/series/${s.slug}`,
      lastModified: when(s.latest),
      priority: 0.6,
    })),
    ...everything.authors.map((a) => ({
      url: `${SITE_URL}/journal/author/${a.id}`,
      lastModified: when(a.latest),
      priority: 0.4,
    })),
  ];
}
