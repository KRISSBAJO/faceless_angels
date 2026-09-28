"use client";

import { useState } from "react";
import {
  ACCESS_LABELS,
  ACCESS_NOTES,
  TIMEZONES,
  type PrayerGroupDetail,
} from "@/lib/prayer";
import { Field, FormError } from "./Field";

export interface GroupValues {
  name: string;
  description: string;
  theme?: string;
  language: string;
  church?: string;
  city?: string;
  region?: string;
  meetsOnline: boolean;
  timezone: string;
  schedule?: string;
  access: string;
  groupRules?: string;
  membershipRules?: string;
}

export default function GroupForm({
  group,
  codeOfConduct,
  submitLabel,
  error,
  busy,
  onSubmit,
}: {
  group?: PrayerGroupDetail;
  /** The platform's own code. Shown when someone starts a group. */
  codeOfConduct?: string;
  submitLabel: string;
  error: string | null;
  busy: boolean;
  onSubmit: (values: GroupValues) => void;
}) {
  const [access, setAccess] = useState(group?.access ?? "open");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    onSubmit({
      name: text("name"),
      description: text("description"),
      theme: text("theme") || undefined,
      language: text("language"),
      church: text("church") || undefined,
      city: text("city") || undefined,
      region: text("region") || undefined,
      meetsOnline: form.get("meetsOnline") === "on",
      timezone: text("timezone"),
      schedule: text("schedule") || undefined,
      access,
      groupRules: text("groupRules") || undefined,
      membershipRules: text("membershipRules") || undefined,
    });
  }

  const myZone =
    typeof Intl === "undefined"
      ? "America/Chicago"
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zone =
    group?.timezone ??
    (TIMEZONES.some(([value]) => value === myZone) ? myZone : "America/Chicago");

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-8">
      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 font-serif text-2xl">About the group</legend>
        <Field id="name" label="Name">
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={group?.name}
            required
            minLength={3}
            maxLength={80}
          />
        </Field>
        <Field
          id="description"
          label="What the group is for"
          hint="Who it is for and what you pray about."
        >
          <textarea
            id="description"
            name="description"
            className="input"
            rows={4}
            defaultValue={group?.description}
            required
            minLength={20}
            maxLength={1000}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="theme" label="Theme (optional)">
            <input
              id="theme"
              name="theme"
              className="input"
              placeholder="Families, healing, the city"
              defaultValue={group?.theme ?? ""}
              maxLength={80}
            />
          </Field>
          <Field id="language" label="Language">
            <input
              id="language"
              name="language"
              className="input"
              defaultValue={group?.language ?? "English"}
              required
              minLength={2}
              maxLength={40}
            />
          </Field>
          <Field id="church" label="Church (optional)">
            <input
              id="church"
              name="church"
              className="input"
              defaultValue={group?.church ?? ""}
              maxLength={120}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 font-serif text-2xl">Where and when</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="city" label="City (optional)">
            <input
              id="city"
              name="city"
              className="input"
              defaultValue={group?.city ?? ""}
              maxLength={80}
            />
          </Field>
          <Field id="region" label="State (optional)">
            <input
              id="region"
              name="region"
              className="input"
              defaultValue={group?.region ?? ""}
              maxLength={40}
            />
          </Field>
          <Field id="schedule" label="Usual time (optional)">
            <input
              id="schedule"
              name="schedule"
              className="input"
              placeholder="Wednesdays at 7 pm"
              defaultValue={group?.schedule ?? ""}
              maxLength={120}
            />
          </Field>
          <Field id="timezone" label="Time zone">
            <select
              id="timezone"
              name="timezone"
              className="input"
              defaultValue={zone}
            >
              {TIMEZONES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-3">
          <input
            id="meetsOnline"
            name="meetsOnline"
            type="checkbox"
            className="size-4"
            defaultChecked={group?.meetsOnline ?? true}
          />
          The group meets online
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-serif text-2xl">Who may join</legend>
        {Object.keys(ACCESS_LABELS).map((value) => (
          <label key={value} className="flex items-start gap-3 leading-6">
            <input
              id={`access-${value}`}
              type="radio"
              name="access"
              className="mt-1.5 size-4"
              checked={access === value}
              onChange={() => setAccess(value)}
            />
            <span>
              <span className="font-medium">{ACCESS_LABELS[value]}</span>
              <span className="block text-sm text-muted">
                {ACCESS_NOTES[value]}
              </span>
            </span>
          </label>
        ))}
        <Field
          id="membershipRules"
          label="Who the group is for (optional)"
          hint="For example: women of our church, or parents of teenagers."
        >
          <input
            id="membershipRules"
            name="membershipRules"
            className="input"
            defaultValue={group?.membershipRules ?? ""}
            maxLength={1000}
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 font-serif text-2xl">Code of conduct</legend>
        <p className="text-sm leading-6 text-muted">
          Every group keeps these rules. Members agree to them when they join.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
          {(codeOfConduct ?? group?.codeOfConduct ?? "")
            .split("\n\n")[0]
            .split("\n")
            .map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
        </ul>
        <Field id="groupRules" label="Your group's own rules (optional)">
          <textarea
            id="groupRules"
            name="groupRules"
            className="input"
            rows={3}
            defaultValue={group?.groupRules ?? ""}
            maxLength={2000}
          />
        </Field>
        {group ? null : (
          <label className="flex items-start gap-3 leading-6">
            <input
              id="acceptLeaderDuties"
              name="acceptLeaderDuties"
              type="checkbox"
              className="mt-1.5 size-4"
              required
            />
            <span>
              I will lead this group by the code of conduct. My full name is
              shown as its leader, and I will look at reports from members.
            </span>
          </label>
        )}
      </fieldset>

      <FormError message={error} />
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
