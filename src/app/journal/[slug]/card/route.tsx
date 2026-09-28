import { ImageResponse } from "next/og";
import type { Article } from "@/lib/journal";

const API_URL = process.env.API_URL ?? "http://localhost:4010";

const INK = "#14213d";
const MUTED = "#55627d";
const GOLD = "#8f6210";
const PAPER = "#f3f5fa";

/**
 * The picture shown when an article's link is shared. Built from the
 * published article only: a draft gives no card.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/journal/[slug]/card">,
) {
  const { slug } = await ctx.params;
  const res = await fetch(
    `${API_URL}/api/journal/articles/${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return new Response("Not found", { status: 404 });
  const article = (await res.json()) as Article;
  if (!article.live) return new Response("Not found", { status: 404 });

  // Satori loads pictures by address, so the cover comes straight from the API.
  const cover = article.cover
    ? `${API_URL}/api/journal/media/${article.cover.id}`
    : null;
  const size = article.title.length > 70 ? 52 : article.title.length > 40 ? 62 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: PAPER,
          color: INK,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 64px 56px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 10,
                  borderRadius: 999,
                  border: "3px solid #c8962e",
                }}
              />
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border: `3px solid ${INK}`,
                }}
              />
            </div>
            <div style={{ fontSize: 28, letterSpacing: 1 }}>
              Faceless Angels · Journal
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div
              style={{
                fontSize: 22,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              {article.category.label}
            </div>
            <div
              style={{
                fontSize: size,
                lineHeight: 1.1,
                fontWeight: 600,
                display: "flex",
              }}
            >
              {article.title}
            </div>
          </div>

          <div style={{ fontSize: 26, color: MUTED, display: "flex" }}>
            {article.author.name} · {article.readingMinutes} min read
          </div>
        </div>

        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            width={420}
            height={630}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div
            style={{ width: 16, height: "100%", backgroundColor: "#c8962e" }}
          />
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
