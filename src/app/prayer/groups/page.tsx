"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { FormError } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";
import { ACCESS_LABELS, type PrayerGroup } from "@/lib/prayer";
import { useRequiredUser } from "@/lib/session";

interface Directory {
  groups: PrayerGroup[];
  languages: string[];
  regions: string[];
}

const MY_STATUS: Record<string, string> = {
  active: "You are a member",
  applied: "You asked to join",
  invited: "You are invited",
};

export default function GroupsPage() {
  const user = useRequiredUser();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [filters, setFilters] = useState({
    q: "",
    language: "",
    region: "",
    online: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Wait for typing to pause before searching.
    const timer = setTimeout(() => {
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value),
      );
      api<Directory>(`/prayer/groups?${query}`)
        .then(setDirectory)
        .catch((err) => setError(errorMessage(err)));
    }, 250);
    return () => clearTimeout(timer);
  }, [user, filters]);

  if (!user) return <AppShell>{null}</AppShell>;

  const set = (name: keyof typeof filters) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setFilters({ ...filters, [name]: event.target.value });

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="font-serif text-4xl sm:text-5xl">Prayer groups</h1>
          <p className="leading-7 text-muted">
            Every group has named leaders and a code of conduct.
          </p>
        </div>
        <Link href="/prayer/groups/new" className="btn btn-primary">
          Start a group
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Search
          <input
            id="group-search"
            type="search"
            className="input font-normal"
            placeholder="Name, city, theme, church"
            value={filters.q}
            onChange={set("q")}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Language
          <select
            id="group-language"
            className="input font-normal"
            value={filters.language}
            onChange={set("language")}
          >
            <option value="">Any language</option>
            {directory?.languages.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          State
          <select
            id="group-region"
            className="input font-normal"
            value={filters.region}
            onChange={set("region")}
          >
            <option value="">Anywhere</option>
            {directory?.regions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Meets
          <select
            id="group-online"
            className="input font-normal"
            value={filters.online}
            onChange={set("online")}
          >
            <option value="">Online or in person</option>
            <option value="yes">Online</option>
            <option value="no">In person only</option>
          </select>
        </label>
      </div>

      <FormError message={error} />

      {directory && directory.groups.length === 0 ? (
        <p className="text-muted">
          No groups match. Try fewer filters, or start a group of your own.
        </p>
      ) : null}

      {directory && directory.groups.length > 0 ? (
        <ul className="grid gap-6 md:grid-cols-2">
          {directory.groups.map((group) => (
            <li key={group.id}>
              <article className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
                <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
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
                <h2 className="font-serif text-2xl leading-snug">
                  <Link
                    href={`/prayer/groups/${group.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {group.name}
                  </Link>
                </h2>
                <p className="text-sm leading-6 text-muted">
                  {group.description}
                </p>
                <dl className="mt-auto flex flex-col gap-1 pt-2 text-sm">
                  {(
                    [
                      ["Led by", group.leaders.join(", ")],
                      ["Meets", group.schedule],
                      ["Theme", group.theme],
                      ["Church", group.church],
                      ["Joining", ACCESS_LABELS[group.access]],
                    ] as [string, string | null][]
                  )
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label} className="flex gap-2">
                        <dt className="w-16 shrink-0 text-muted">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>
                {group.myStatus && MY_STATUS[group.myStatus] ? (
                  <p className="text-sm font-medium text-verified">
                    {MY_STATUS[group.myStatus]}
                  </p>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}
