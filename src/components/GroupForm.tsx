"use client";

import { useRef, useState } from "react";
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
  disabledReason,
  onSubmit,
}: {
  group?: PrayerGroupDetail;
  /** The platform's own code. Shown when someone starts a group. */
  codeOfConduct?: string;
  submitLabel: string;
  error: string | null;
  busy: boolean;
  disabledReason?: string;
  onSubmit: (values: GroupValues) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [access, setAccess] = useState(group?.access ?? "open");
  const [review, setReview] = useState({ name: group?.name ?? "", schedule: group?.schedule ?? "", city: group?.city ?? "", region: group?.region ?? "", meetsOnline: group?.meetsOnline ?? true });
  const steps = ["About", "Meeting details", "Who can join", "Group rules"];

  function checkStep() {
    const panel = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    for (const field of panel?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select") ?? []) {
      if (!field.reportValidity()) return false;
    }
    return true;
  }

  function next() {
    if (!checkStep()) return;
    if (step === 2 && formRef.current) {
      const form = new FormData(formRef.current);
      setReview({ name: String(form.get("name") ?? "").trim(), schedule: String(form.get("schedule") ?? "").trim(), city: String(form.get("city") ?? "").trim(), region: String(form.get("region") ?? "").trim(), meetsOnline: form.get("meetsOnline") === "on" });
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== steps.length - 1 || !checkStep() || busy) return;
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
    <form ref={formRef} onSubmit={submit} noValidate className="flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="Group setup steps" className="grid grid-cols-4 overflow-hidden rounded-2xl border border-line bg-surface">
        {steps.map((label, index) => (
          <button key={label} type="button" onClick={() => index < step && setStep(index)} disabled={index > step} aria-current={index === step ? "step" : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 border-r border-line px-1 py-2 text-center text-xs last:border-r-0 sm:flex-row sm:gap-2 sm:text-sm ${index === step ? "bg-gold-soft font-semibold text-ink" : index < step ? "text-ink" : "text-muted"}`}>
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${index <= step ? "bg-gold-bright text-night" : "bg-paper text-muted"}`}>{index + 1}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <p className="text-sm text-muted">Step {step + 1} of {steps.length}</p>
      <fieldset data-step="0" hidden={step !== 0} className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <legend className="sr-only">About the group</legend>
        <div className="mb-6"><h2 className="font-serif text-2xl sm:text-3xl">About the group</h2><p className="mt-2 text-sm leading-6 text-muted">Give people a clear picture of the prayer community you want to start.</p></div>
        <div className="flex flex-col gap-5">
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
        </div>
      </fieldset>

      <fieldset data-step="1" hidden={step !== 1} className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <legend className="sr-only">Meeting details</legend>
        <div className="mb-6"><h2 className="font-serif text-2xl sm:text-3xl">Meeting details</h2><p className="mt-2 text-sm leading-6 text-muted">A regular rhythm helps members know what to expect. You can update these details later.</p></div>
        <div className="flex flex-col gap-5">
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
        </div>
      </fieldset>

      <fieldset data-step="2" hidden={step !== 2} className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <legend className="sr-only">Who can join</legend>
        <div className="mb-6"><h2 className="font-serif text-2xl sm:text-3xl">Who can join</h2><p className="mt-2 text-sm leading-6 text-muted">Choose how people discover your group and become members.</p></div>
        <div className="flex flex-col gap-3">
        {Object.keys(ACCESS_LABELS).map((value) => (
          <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 leading-6 transition-colors ${access === value ? "border-gold-bright bg-gold-soft" : "border-line hover:border-gold-bright"}`}>
            <input
              id={`access-${value}`}
              type="radio"
              name="access"
            className="mt-1.5 size-4 accent-gold-bright"
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
          hint="For example: women of our church, or parents of teenagers. A group may not shut people out by race, color, or where they come from."
        >
          <input
            id="membershipRules"
            name="membershipRules"
            className="input"
            defaultValue={group?.membershipRules ?? ""}
            maxLength={1000}
          />
        </Field>
        </div>
      </fieldset>

      <fieldset data-step="3" hidden={step !== 3} className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <legend className="sr-only">Group rules</legend>
        <div className="mb-6"><h2 className="font-serif text-2xl sm:text-3xl">Group rules</h2><p className="mt-2 text-sm leading-6 text-muted">Set a caring foundation for everyone who joins.</p></div>
        <div className="flex flex-col gap-4">
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
              I will run this group by the code of conduct. My full name is
              shown as its admin, and I will look at reports from members.
            </span>
          </label>
        )}
        </div>
      </fieldset>

      {step === 3 ? (
        <section aria-label="Review your group" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h3 className="font-serif text-xl">Before you send it</h3>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Group</dt><dd className="mt-1 font-medium">{review.name || "Your group"}</dd></div>
            <div><dt className="text-muted">Joining</dt><dd className="mt-1 font-medium">{ACCESS_LABELS[access]}</dd></div>
            <div><dt className="text-muted">Meeting</dt><dd className="mt-1 font-medium">{review.schedule || "Time to be decided"}</dd></div>
            <div><dt className="text-muted">Location</dt><dd className="mt-1 font-medium">{[review.city, review.region].filter(Boolean).join(", ") || (review.meetsOnline ? "Online" : "To be decided")}</dd></div>
          </dl>
          {group ? null : <p className="mt-5 border-t border-line pt-4 text-sm leading-6 text-muted">A moderator reviews new groups before they open. We&apos;ll email you when yours is approved.</p>}
        </section>
      ) : null}

      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        {step > 0 ? <button type="button" className="btn btn-ghost" onClick={() => setStep((current) => current - 1)}>Back</button> : <span />}
        {step < 3 ? <button type="button" className="btn btn-primary" onClick={next}>Continue <span aria-hidden="true" className="ml-2">→</span></button> : <button type="submit" className="btn btn-primary" disabled={busy}>{submitLabel}</button>}
      </div>
      {step === 3 && disabledReason ? <p className="-mt-3 text-right text-sm text-muted">{disabledReason}</p> : null}
    </form>
  );
}
