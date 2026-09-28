import Link from "next/link";

const API_URL = process.env.API_URL ?? "http://localhost:4010";

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
    body: "Keep it to yourself, send it to the prayer team, share it with your group, or share it with everyone. You choose whether your name is shown.",
    href: "/prayer/new",
    action: "Ask for prayer",
  },
  {
    title: "Join a prayer group",
    body: "Find a group by language, place, theme, or church. Every group has named leaders and a code of conduct.",
    href: "/prayer/groups",
    action: "Find a group",
  },
  {
    title: "Pray together, live",
    body: "Groups meet on Patvero, Zoom, or Teams, or in person. You get a reminder before each session.",
    href: "/prayer",
    action: "See how it works",
  },
];

/** The prayer network on the home page, with real groups when there are some. */
export default async function PrayerHome() {
  const overview = await loadOverview();
  const groups = overview?.groups ?? [];
  const testimony = overview?.testimonies[0];

  return (
    <section id="prayer" className="scroll-mt-8 bg-night text-night-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 py-20">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div className="flex flex-col gap-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright">
              The prayer network
            </p>
            <h2 className="font-serif text-4xl leading-tight sm:text-6xl">
              No one should have to pray alone
            </h2>
            <p className="max-w-[34rem] text-lg leading-8 text-night-muted">
              A network of prayer groups, open to anyone. Prayer is free and
              always your choice. It has no part in who receives help.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/prayer"
                className="rounded-full bg-gold-bright px-6 py-3 font-medium text-night transition-opacity hover:opacity-90"
              >
                Pray with us
              </Link>
              <Link
                href="/prayer/groups/new"
                className="rounded-full border border-night-ink px-6 py-3 font-medium transition-colors hover:bg-night-ink hover:text-night"
              >
                Start a prayer group
              </Link>
            </div>
          </div>
          <figure className="flex flex-col gap-3 border-l-2 border-gold-bright pl-6">
            <blockquote className="font-serif text-2xl italic leading-relaxed sm:text-3xl">
              For where two or three are gathered together in my name, there
              am I in the midst of them.
            </blockquote>
            <figcaption className="text-sm text-night-muted">
              Matthew 18:20 (KJV)
            </figcaption>
          </figure>
        </div>

        <ul className="grid gap-x-10 gap-y-10 md:grid-cols-3">
          {ways.map((way) => (
            <li
              key={way.title}
              className="flex flex-col items-start gap-3 border-t border-night-line pt-5"
            >
              <h3 className="font-serif text-2xl">{way.title}</h3>
              <p className="text-sm leading-6 text-night-muted">{way.body}</p>
              <Link
                href={way.href}
                className="mt-auto text-sm font-medium underline decoration-gold-bright decoration-2 underline-offset-8"
              >
                {way.action}
              </Link>
            </li>
          ))}
        </ul>

        {groups.length > 0 ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h3 className="font-serif text-3xl">Groups praying now</h3>
              <Link
                href="/prayer/groups"
                className="text-sm font-medium underline underline-offset-4"
              >
                {overview && overview.total > groups.length
                  ? `See all ${overview.total} groups`
                  : "See the groups"}
              </Link>
            </div>
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <li
                  key={group.name}
                  className="flex flex-col gap-2 rounded-2xl border border-night-line p-6"
                >
                  <p className="font-mono text-xs uppercase tracking-[0.1em] text-night-muted">
                    {[
                      group.language,
                      group.city && group.region
                        ? `${group.city}, ${group.region}`
                        : (group.city ?? group.region),
                      group.meetsOnline ? "Online" : "In person",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="font-serif text-2xl leading-snug">
                    {group.name}
                  </p>
                  <p className="text-sm text-night-muted">
                    {[group.schedule, group.theme].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {testimony ? (
          <figure className="flex max-w-3xl flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright">
              An answered prayer
            </p>
            <p className="text-night-muted">“{testimony.request}”</p>
            <blockquote className="font-serif text-2xl leading-relaxed sm:text-3xl">
              {testimony.testimony}
            </blockquote>
            <figcaption className="text-sm text-night-muted">
              Shared by the person who prayed it, with no name.
            </figcaption>
          </figure>
        ) : null}
      </div>
    </section>
  );
}
