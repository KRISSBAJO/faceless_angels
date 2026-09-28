import { SITE_URL } from "@/lib/site";

const API_URL = process.env.API_URL ?? "http://localhost:4010";

interface FeedArticle {
  slug: string;
  title: string;
  summary: string;
  opening: string;
  publishedAt: string | null;
  category: { label: string };
  author: { name: string };
}

function xml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The Journal as a news feed, for feed readers and other sites. */
export async function GET() {
  let articles: FeedArticle[] = [];
  try {
    const res = await fetch(`${API_URL}/api/journal/everything`, {
      cache: "no-store",
    });
    if (res.ok) {
      articles = ((await res.json()) as { articles: FeedArticle[] }).articles;
    }
  } catch {
    // The API is down. An empty feed is still a valid feed.
  }

  const items = articles
    .slice(0, 50)
    .map((a) => {
      const link = `${SITE_URL}/journal/${a.slug}`;
      return `    <item>
      <title>${xml(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      ${a.publishedAt ? `<pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>` : ""}
      <category>${xml(a.category.label)}</category>
      <dc:creator>${xml(a.author.name)}</dc:creator>
      <description>${xml(a.summary || a.opening)}</description>
    </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Faceless Angels Journal</title>
    <link>${SITE_URL}/journal</link>
    <atom:link href="${SITE_URL}/journal/feed.xml" rel="self" type="application/rss+xml" />
    <description>Devotionals, Bible study, and true stories of prayer answered and help quietly given.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
