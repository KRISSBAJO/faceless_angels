"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";
import {
  AUDIENCE_LABELS,
  AUDIENCE_NOTES,
  type PrayerAbout,
  type PrayerGroup,
  type PrayerRequest,
} from "@/lib/prayer";
import { useRequiredUser } from "@/lib/session";

const AUDIENCES = ["team", "personal", "group", "network"] as const;

export default function NewPrayerPage() {
  const user = useRequiredUser();
  const router = useRouter();
  const [groups, setGroups] = useState<PrayerGroup[]>([]);
  const [about, setAbout] = useState<PrayerAbout | null>(null);
  // The prayer team is the private choice, so it comes first.
  const [audience, setAudience] =
    useState<(typeof AUDIENCES)[number]>("team");
  const [saved, setSaved] = useState<PrayerRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<PrayerGroup[]>("/prayer/groups/mine")
      .then(
        (rows) =>
          active &&
          setGroups(
            rows.filter(
              (g) => g.myStatus === "active" && g.status === "active",
            ),
          ),
      )
      .catch(() => undefined);
    api<PrayerAbout>("/prayer/about")
      .then((a) => active && setAbout(a))
      .catch(() => undefined);
    // Arriving from a group page picks that group.
    if (new URLSearchParams(window.location.search).get("group")) {
      queueMicrotask(() => setAudience("group"));
    }
    return () => {
      active = false;
    };
  }, [user]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const created = await api<PrayerRequest>("/prayer/requests", {
        body: {
          body: String(form.get("body")).trim(),
          audience,
          groupId: audience === "group" ? form.get("groupId") : undefined,
          showName: form.get("showName") === "on",
          allowResponses: form.get("allowResponses") === "on",
          allowFollow: form.get("allowFollow") === "on",
          allowForward: form.get("allowForward") === "on",
          days: Number(form.get("days")),
        },
      });
      // Someone who may be in danger sees where to get help before anything else.
      if (created.help) setSaved(created);
      else router.push("/prayer/mine");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!user) return <AppShell>{null}</AppShell>;

  if (saved) {
    return (
      <AppShell user={user}>
        <div className="flex max-w-2xl flex-col gap-5">
          <h1 className="font-serif text-4xl">We have your request</h1>
          <p className="rounded-xl border border-gold-bright bg-gold-soft p-5 text-lg leading-8">
            {saved.help}
          </p>
          <p className="leading-7 text-muted">
            We will pray. We cannot promise a quick reply, so please use the
            numbers above if you need someone now.
          </p>
          <div>
            <Link href="/prayer/mine" className="btn btn-primary">
              See my prayer requests
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const shared = audience === "group" || audience === "network";
  const groupFromLink =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("group") ?? "");

  return (
    <AppShell user={user}>
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-serif text-4xl sm:text-5xl">Ask for prayer</h1>
        <p className="leading-7 text-muted">
          You choose who reads it. You can change or withdraw it at any time.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-8">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-serif text-2xl">Who may read it</legend>
          {AUDIENCES.map((value) => {
            const unavailable = value === "group" && groups.length === 0;
            return (
              <label
                key={value}
                className={`flex items-start gap-3 leading-6 ${unavailable ? "text-muted" : ""}`}
              >
                <input
                  id={`audience-${value}`}
                  type="radio"
                  name="audience"
                  className="mt-1.5 size-4"
                  checked={audience === value}
                  disabled={unavailable}
                  onChange={() => setAudience(value)}
                />
                <span>
                  <span className="font-medium">{AUDIENCE_LABELS[value]}</span>
                  <span className="block text-sm text-muted">
                    {unavailable
                      ? "Join a group first."
                      : AUDIENCE_NOTES[value]}
                  </span>
                </span>
              </label>
            );
          })}
          {audience === "group" ? (
            <Field id="groupId" label="Which group">
              <select
                id="groupId"
                name="groupId"
                className="input"
                defaultValue={groupFromLink}
                required
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {shared && !user.emailVerified ? (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-6">
              Confirm your email before you share with others. Use the link we
              sent you, or the button at the top of the page.
            </p>
          ) : null}
        </fieldset>

        <Field
          id="body"
          label="Your request"
          hint="Leave out full names, addresses, and anything you would not want repeated."
        >
          <textarea
            id="body"
            name="body"
            className="input"
            rows={6}
            required
            minLength={10}
            maxLength={1500}
          />
        </Field>

        {audience === "personal" ? null : (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 font-serif text-2xl">Your choices</legend>
            {(
              [
                [
                  "showName",
                  "Show my first name and last initial",
                  audience === "team"
                    ? "The prayer team sees your first name either way."
                    : "Off means you are shown as a member of the network.",
                  false,
                  audience !== "team",
                ],
                [
                  "allowResponses",
                  "Let people write a word of encouragement",
                  "Off means people can pray, but not reply.",
                  true,
                  true,
                ],
                [
                  "allowFollow",
                  "Let people follow this request",
                  "They get one email if you mark it answered.",
                  true,
                  shared,
                ],
                [
                  "allowForward",
                  "Let a group admin pass this to the prayer team",
                  "Off means it never leaves the group.",
                  false,
                  audience === "group",
                ],
              ] as const
            )
              .filter((choice) => choice[4])
              .map(([name, title, note, on]) => (
                <label key={name} className="flex items-start gap-3 leading-6">
                  <input
                    id={name}
                    name={name}
                    type="checkbox"
                    className="mt-1.5 size-4"
                    defaultChecked={on}
                  />
                  <span>
                    <span className="font-medium">{title}</span>
                    <span className="block text-sm text-muted">{note}</span>
                  </span>
                </label>
              ))}
          </fieldset>
        )}

        <Field id="days" label="Keep it open for">
          <select id="days" name="days" className="input" defaultValue="30">
            <option value="7">1 week</option>
            <option value="30">1 month</option>
            <option value="90">3 months</option>
          </select>
        </Field>

        {about ? (
          <p className="text-sm leading-6 text-muted">{about.crisisResources}</p>
        ) : null}

        <FormError message={error} />
        <div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || (shared && !user.emailVerified)}
          >
            {audience === "personal" ? "Save my prayer" : "Send my request"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
