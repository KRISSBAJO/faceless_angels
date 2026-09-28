import Link from "next/link";
import type { Need } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { Badges, NeedFacts, PledgeProgress } from "./NeedCard";
import { apiOrigin } from "@/lib/api-origin";

const API_URL = apiOrigin();

/** How many places the home page keeps for needs. */
const PLACES = 3;

/**
 * What an empty place says, in the order places empty out. A new need takes
 * the first empty place; a fully pledged need gives its place back.
 */
const OPEN_PLACES = [
  {
    label: "Open place",
    title: "The next need will appear here",
    text: "A reviewer checks every request before it is shown. The person's name and address never are.",
    href: "/#how",
    link: "How we check needs",
  },
  {
    label: "Know someone?",
    title: "This place could be for someone you know",
    text: "They can ask for help quietly. Only the reviewers ever see who they are.",
    href: "/ask",
    link: "Ask for help",
  },
  {
    label: "While you wait",
    title: "Pray for the people behind these needs",
    text: "Every need here began with a hard week. Others are praying for them now.",
    href: "/prayer",
    link: "Go to Prayer",
  },
];

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

function NeedPlace({ need }: { need: Need }) {
  return (
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
  );
}

function OpenPlace({ place }: { place: (typeof OPEN_PLACES)[number] }) {
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-dashed border-line p-6">
      <p className="font-mono text-xs uppercase tracking-[0.1em] text-gold">
        {place.label}
      </p>
      <h3 className="font-serif text-2xl leading-snug text-ink/80">
        {place.title}
      </h3>
      <p className="text-sm leading-6 text-muted">{place.text}</p>
      <div className="mt-auto flex flex-col gap-4 pt-2">
        {/* The outline of a need's progress bar, waiting to be filled. */}
        <div
          aria-hidden
          className="h-2 rounded-full border border-dashed border-line"
        />
        <Link
          href={place.href}
          className="self-start text-sm font-medium underline underline-offset-4"
        >
          {place.link}
        </Link>
      </div>
    </article>
  );
}

/**
 * Real needs from the public list, with open places for the ones not yet
 * filled. The section never looks empty, and places come and go with needs.
 */
export default async function OpenNeeds() {
  const needs = (await loadNeeds()).filter((n) => n.remainingCents > 0);
  const shown = needs.slice(0, PLACES);
  const open = OPEN_PLACES.slice(0, PLACES - shown.length);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
            Open right now
          </p>
          <h2 className="font-serif text-3xl leading-tight sm:text-4xl">
            Needs waiting for an Angel
          </h2>
          <p className="leading-7 text-muted">
            {needs.length === 0
              ? "Nothing is waiting right now."
              : needs.length === 1
                ? "One need is open."
                : `${needs.length} needs are open.`}{" "}
            A place fills when a reviewer approves a new need, and opens again
            when a need is fully pledged.
          </p>
        </div>
        {needs.length > 0 ? (
          <Link
            href="/needs"
            className="font-medium underline underline-offset-4"
          >
            {needs.length > PLACES ? `See all ${needs.length} needs` : "See the list"}
          </Link>
        ) : null}
      </div>
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((need) => (
          <li key={need.ref} className="md:nth-3:col-span-2 lg:nth-3:col-span-1">
            <NeedPlace need={need} />
          </li>
        ))}
        {open.map((place) => (
          <li key={place.label} className="md:nth-3:col-span-2 lg:nth-3:col-span-1">
            <OpenPlace place={place} />
          </li>
        ))}
      </ul>
    </section>
  );
}
