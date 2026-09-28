import Link from "next/link";
import { apiOrigin } from "@/lib/api-origin";

const API_URL = apiOrigin();

interface Overview {
  total: number;
  groups: {
    name: string;
    theme: string | null;
    language: string;
    city: string | null;
    region: string | null;
    meetsOnline: boolean;
    schedule: string | null;
  }[];
  testimonies: { id: string; request: string; testimony: string }[];
}

async function loadOverview(): Promise<Overview | null> {
  try {
    const res = await fetch(`${API_URL}/api/prayer/overview`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Overview;
  } catch {
    return null;
  }
}

const ways = [
  {
    title: "Ask for prayer",
    body: "Keep it private, share it with your group, or share it with everyone.",
    href: "/prayer/new",
  },
  {
    title: "Join a prayer group",
    body: "Find one by language, place, theme, or church.",
    href: "/prayer/groups",
  },
  {
    title: "Pray together, live",
    body: "On Patvero, Zoom, or Teams, or in person. Join a campaign or take a turn in a prayer chain.",
    href: "/prayer",
  },
];

/** The prayer network on the home page, with real groups when there are some. */
export default async function PrayerHome() {
  const overview = await loadOverview();
  const groups = overview?.groups.slice(0, 4) ?? [];
  const testimony = overview?.testimonies[0];

  return (
    <section
      id="prayer"
      className="scroll-mt-8 border-y border-line bg-surface"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-x-16 gap-y-10 px-5 py-14 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
            The prayer network
          </p>
          <h2 className="font-serif text-3xl leading-tight sm:text-4xl">
            No one should have to pray alone
          </h2>
          <p className="max-w-[30rem] leading-7 text-muted">
            A network of prayer groups, open to anyone. Prayer is free and
            always your choice. It has no part in who receives help.
          </p>
          <p className="max-w-[30rem] font-serif italic leading-7">
            “For where two or three are gathered together in my name, there am
            I in the midst of them.”{" "}
            <span className="font-sans text-sm not-italic text-muted">
              Matthew 18:20
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
            <Link href="/prayer" className="btn btn-primary">
              Pray with us
            </Link>
            <Link
              href="/prayer/groups/new"
              className="font-medium underline underline-offset-4"
            >
              Start a prayer group
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <ul className="flex flex-col">
            {ways.map((way) => (
              <li key={way.title} className="border-t border-line first:border-t-0">
                <Link
                  href={way.href}
                  className="group flex items-baseline justify-between gap-6 py-4"
                >
                  <span className="flex flex-col gap-1">
                    <span className="font-medium group-hover:underline group-hover:underline-offset-4">
                      {way.title}
                    </span>
                    <span className="text-sm leading-6 text-muted">
                      {way.body}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {groups.length > 0 ? (
          <div className="flex flex-col gap-3 lg:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h3 className="font-medium">Groups praying now</h3>
              <Link
                href="/prayer/groups"
                className="text-sm underline underline-offset-4"
              >
                {overview && overview.total > groups.length
                  ? `See all ${overview.total} groups`
                  : "See the groups"}
              </Link>
            </div>
            <ul className="flex flex-col text-sm">
              {groups.map((group) => (
                <li
                  key={group.name}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-3"
                >
                  <span className="font-medium">{group.name}</span>
                  <span className="text-muted">
                    {[
                      group.schedule,
                      group.language,
                      group.city && group.region
                        ? `${group.city}, ${group.region}`
                        : (group.city ?? group.region),
                      group.meetsOnline ? "Online" : "In person",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {testimony ? (
          <p className="max-w-3xl text-sm leading-6 text-muted lg:col-span-2">
            <span className="font-medium text-ink">An answered prayer.</span>{" "}
            “{testimony.request}” {testimony.testimony}
          </p>
        ) : null}
      </div>
    </section>
  );
}
