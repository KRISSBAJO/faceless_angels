import Link from "next/link";
import type { Need } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { Badges, NeedFacts, PledgeProgress } from "./NeedCard";

const API_URL = process.env.API_URL ?? "http://localhost:4010";

async function loadNeeds(): Promise<Need[]> {
  try {
    // Read fresh each time so pledges show up at once.
    const res = await fetch(`${API_URL}/api/needs`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Need[];
  } catch {
    return [];
  }
}

/** Real needs from the public list. Renders nothing when there are none. */
export default async function OpenNeeds() {
  const needs = (await loadNeeds()).filter((n) => n.remainingCents > 0);
  if (needs.length === 0) return null;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
            Open right now
          </p>
          <h2 className="font-serif text-4xl leading-tight sm:text-5xl">
            Needs waiting for an Angel
          </h2>
        </div>
        <Link
          href="/needs"
          className="font-medium underline underline-offset-4"
        >
          {needs.length > 3 ? `See all ${needs.length} needs` : "See the list"}
        </Link>
      </div>
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {needs.slice(0, 3).map((need) => (
          <li key={need.ref}>
            <article className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
              <NeedFacts need={need} />
              <h3 className="font-serif text-2xl leading-snug">
                <Link
                  href={`/needs/${need.ref}`}
                  className="underline-offset-4 hover:underline"
                >
                  {need.summary}
                </Link>
              </h3>
              <Badges badges={need.badges} />
              <div className="mt-auto flex flex-col gap-3 pt-2">
                <p className="font-serif text-3xl tabular-nums">
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
