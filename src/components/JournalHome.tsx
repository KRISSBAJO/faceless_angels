import Link from "next/link";
import { minutes, type JournalHome as Home } from "@/lib/journal";
import { apiOrigin } from "@/lib/api-origin";

const API_URL = apiOrigin();

async function load(): Promise<Home | null> {
  try {
    const res = await fetch(`${API_URL}/api/journal`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Home;
  } catch {
    return null;
  }
}

/** The Journal on the home page. Renders nothing until something is published. */
export default async function JournalHome() {
  const home = await load();
  if (!home?.featured) return null;

  const daily =
    home.dailyBread && home.dailyBread.id !== home.featured.id
      ? home.dailyBread
      : null;
  const more = home.latest
    .filter((article) => article.id !== daily?.id)
    .slice(0, 3);

  return (
    <section
      id="journal"
      className="scroll-mt-8 border-y border-line bg-surface"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-x-16 gap-y-10 px-5 py-14 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
            From the Journal
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
            {home.featured.category.label}
          </p>
          <h2 className="font-serif text-3xl leading-tight sm:text-4xl">
            <Link
              href={`/journal/${home.featured.slug}`}
              className="underline-offset-4 hover:underline"
            >
              {home.featured.title}
            </Link>
          </h2>
          {home.featured.summary ? (
            <p className="max-w-[32rem] leading-7 text-muted">
              {home.featured.summary}
            </p>
          ) : null}
          <p className="text-sm text-muted">
            {home.featured.author.name} ·{" "}
            {minutes(home.featured.readingMinutes)}
          </p>
          <div className="pt-1">
            <Link href="/journal" className="btn btn-primary">
              Read the Journal
            </Link>
          </div>
        </div>

        <ul className="flex flex-col">
          {daily ? (
            <li className="border-t border-line first:border-t-0">
              <Link
                href={`/journal/${daily.slug}`}
                className="group flex flex-col gap-1 py-4"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
                  Today&apos;s Daily Bread
                </span>
                <span className="font-medium group-hover:underline group-hover:underline-offset-4">
                  {daily.title}
                </span>
                <span className="text-sm text-muted">
                  {minutes(daily.readingMinutes)}
                </span>
              </Link>
            </li>
          ) : null}
          {more.map((article) => (
            <li
              key={article.id}
              className="border-t border-line first:border-t-0"
            >
              <Link
                href={`/journal/${article.slug}`}
                className="group flex flex-col gap-1 py-4"
              >
                <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
                  {article.category.label}
                </span>
                <span className="font-medium group-hover:underline group-hover:underline-offset-4">
                  {article.title}
                </span>
                <span className="text-sm text-muted">
                  {article.author.name} · {minutes(article.readingMinutes)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
