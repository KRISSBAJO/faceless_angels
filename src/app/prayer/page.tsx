"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { FormError } from "@/components/Field";
import PrayerCard from "@/components/PrayerCard";
import SessionList from "@/components/SessionList";
import { api, errorMessage, type User } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import type {
  PrayerAbout,
  PrayerGroup,
  PrayerRequest,
  PrayerSession,
  Testimony,
} from "@/lib/prayer";
import { useOptionalUser } from "@/lib/session";

function Testimonies({ testimonies }: { testimonies: Testimony[] }) {
  if (testimonies.length === 0) return null;
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-3xl">Answered prayers</h2>
        <p className="text-sm text-muted">
          Shared by the people who prayed them, with no names.
        </p>
      </div>
      <ul className="grid gap-6 md:grid-cols-2">
        {testimonies.slice(0, 6).map((t) => (
          <li
            key={t.id}
            className="flex flex-col gap-3 border-l-2 border-gold-bright pl-5"
          >
            <p className="text-sm leading-6 text-muted">{t.request}</p>
            <p className="whitespace-pre-wrap font-serif text-xl leading-relaxed">
              {t.testimony}
            </p>
            <p className="text-sm text-muted">{formatMoment(t.at)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Member({ user }: { user: User }) {
  const [wall, setWall] = useState<PrayerRequest[] | null>(null);
  const [groups, setGroups] = useState<PrayerGroup[]>([]);
  const [sessions, setSessions] = useState<PrayerSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(
    () => api<PrayerSession[]>("/prayer/sessions/upcoming").then(setSessions),
    [],
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      api<PrayerRequest[]>("/prayer/network"),
      api<PrayerGroup[]>("/prayer/groups/mine"),
      api<PrayerSession[]>("/prayer/sessions/upcoming"),
    ])
      .then(([w, g, s]) => {
        if (!active) return;
        setWall(w);
        setGroups(g);
        setSessions(s);
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  const invited = groups.filter((g) => g.myStatus === "invited");
  const mine = groups.filter((g) => g.myStatus === "active");
  const staff = ["prayer_team", "pastor", "editor", "admin"].includes(user.role);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Link href="/prayer/new" className="btn btn-primary">
          Ask for prayer
        </Link>
        <Link href="/prayer/groups" className="btn btn-ghost">
          Find a prayer group
        </Link>
        <Link href="/prayer/mine" className="btn btn-ghost">
          My prayer requests
        </Link>
        {staff ? (
          <Link href="/prayer/team" className="btn btn-ghost">
            Prayer team
          </Link>
        ) : null}
      </div>

      <FormError message={error} />

      {invited.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-gold-bright bg-gold-soft p-5">
          <h2 className="font-medium">You are invited</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {invited.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/prayer/groups/${g.id}`}
                  className="underline underline-offset-4"
                >
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sessions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-3xl">Coming sessions</h2>
          <SessionList
            sessions={sessions.slice(0, 5)}
            showGroup
            onChanged={loadSessions}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-3xl">Your groups</h2>
        {mine.length === 0 ? (
          <p className="text-muted">
            You are not in a group yet.{" "}
            <Link href="/prayer/groups" className="underline underline-offset-4">
              Find one
            </Link>{" "}
            or{" "}
            <Link
              href="/prayer/groups/new"
              className="underline underline-offset-4"
            >
              start one
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col">
            {mine.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line py-4 first:border-t-0"
              >
                <Link
                  href={`/prayer/groups/${g.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {g.name}
                </Link>
                <span className="text-sm text-muted">
                  {g.status === "pending"
                    ? "Waiting for approval"
                    : (g.schedule ?? "No regular time set")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-3xl">Prayers from the network</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted">
            We do not show how many people prayed. Prayer is not a count.
          </p>
        </div>
        {wall && wall.length === 0 ? (
          <p className="text-muted">No requests are open right now.</p>
        ) : null}
        {wall && wall.length > 0 ? (
          <ul className="grid gap-6 md:grid-cols-2">
            {wall.map((request) => (
              <li key={request.id}>
                <PrayerCard request={request} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

export default function PrayerPage() {
  const { user, ready } = useOptionalUser();
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);
  const [about, setAbout] = useState<PrayerAbout | null>(null);

  useEffect(() => {
    let active = true;
    api<Testimony[]>("/prayer/testimonies")
      .then((t) => active && setTestimonies(t))
      .catch(() => undefined);
    api<PrayerAbout>("/prayer/about")
      .then((a) => active && setAbout(a))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell user={user} visitorNav>
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-serif text-4xl sm:text-5xl">Pray together</h1>
        <p className="text-lg leading-8 text-muted">
          Ask for prayer, pray for someone else, and meet with a group that
          prays each week. Prayer here is free and always your choice. It has
          no part in who receives help.
        </p>
      </div>

      {!ready ? null : user ? (
        <Member user={user} />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up?next=%2Fprayer" className="btn btn-primary">
              Join to pray with us
            </Link>
            <Link href="/sign-in?next=%2Fprayer" className="btn btn-ghost">
              I have an account
            </Link>
          </div>
          <section className="grid gap-x-10 gap-y-8 border-t border-line pt-8 sm:grid-cols-3">
            {(
              [
                [
                  "Ask for prayer",
                  "Keep it to yourself, send it to the prayer team, share it with a group, or share it with everyone.",
                ],
                [
                  "Join a prayer group",
                  "Find a group by language, place, theme, or church. Each one has named leaders and a code of conduct.",
                ],
                [
                  "Pray live",
                  "Groups meet on Patvero, Zoom, or Teams, or in person.",
                ],
              ] as const
            ).map(([title, body]) => (
              <div key={title} className="flex flex-col gap-2">
                <h2 className="font-serif text-2xl">{title}</h2>
                <p className="text-sm leading-6 text-muted">{body}</p>
              </div>
            ))}
          </section>
        </>
      )}

      <Testimonies testimonies={testimonies} />

      {about ? (
        <p className="max-w-2xl border-t border-line pt-6 text-sm leading-6 text-muted">
          {about.crisisResources}
        </p>
      ) : null}
    </AppShell>
  );
}
