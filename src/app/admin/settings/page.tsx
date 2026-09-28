"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Field, FormError } from "@/components/Field";
import {
  api,
  errorMessage,
  type Category,
  type PolicyText,
} from "@/lib/api";
import { formatCents, formatMoment, parseCents } from "@/lib/format";
import { useRequiredUser } from "@/lib/session";

const POLICY_TITLES: Record<string, string> = {
  consent: "Consent to review",
  attestation: "Statement of truth",
};

function dollars(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function CategoryRow({
  category,
  onSaved,
}: {
  category: Category;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const max = parseCents(String(form.get("max")));
    const quickText = String(form.get("quick")).trim();
    const quick = quickText === "" ? null : parseCents(quickText);
    if (max === null || (quickText !== "" && quick === null)) {
      setError("Enter limits as amounts, like 300 or 75.00.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/categories/${category.key}`, {
        method: "PATCH",
        body: {
          label: String(form.get("label")).trim(),
          description: String(form.get("description")).trim(),
          enabled: form.get("enabled") === "on",
          requiresDocument: form.get("requiresDocument") === "on",
          maxAmountCents: max,
          quickMaxCents: quick,
        },
      });
      await onSaved();
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const id = `cat-${category.key}`;

  return (
    <li className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className={`font-medium ${category.enabled ? "" : "text-muted"}`}>
            {category.label}
            {category.enabled ? "" : " (off)"}
          </span>
          <span className="text-sm text-muted tabular-nums">
            Up to {formatCents(category.maxAmountCents)}
            {category.quickMaxCents === null
              ? " · full request only"
              : ` · small request up to ${formatCents(category.quickMaxCents)}`}
            {category.requiresDocument
              ? " · document required"
              : " · document optional"}
          </span>
        </div>
        <button
          type="button"
          className="text-sm underline underline-offset-4"
          aria-expanded={open}
          aria-controls={`${id}-form`}
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "Change"}
        </button>
      </div>

      {open ? (
        <form
          id={`${id}-form`}
          onSubmit={onSubmit}
          className="mt-4 grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <Field id={`${id}-label`} label="Name">
            <input
              id={`${id}-label`}
              name="label"
              className="input"
              defaultValue={category.label}
              required
              minLength={2}
              maxLength={60}
            />
          </Field>
          <Field id={`${id}-description`} label="Short description">
            <input
              id={`${id}-description`}
              name="description"
              className="input"
              defaultValue={category.description}
              required
              minLength={2}
              maxLength={200}
            />
          </Field>
          <Field id={`${id}-max`} label="Most a full request can ask (USD)">
            <input
              id={`${id}-max`}
              name="max"
              className="input tabular-nums"
              inputMode="decimal"
              defaultValue={dollars(category.maxAmountCents)}
              required
            />
          </Field>
          <Field
            id={`${id}-quick`}
            label="Most a small request can ask (USD)"
            hint="Leave empty to allow full requests only."
          >
            <input
              id={`${id}-quick`}
              name="quick"
              className="input tabular-nums"
              inputMode="decimal"
              defaultValue={dollars(category.quickMaxCents)}
            />
          </Field>
          <label className="flex items-start gap-3 leading-6">
            <input
              id={`${id}-enabled`}
              name="enabled"
              type="checkbox"
              className="mt-1 size-4"
              defaultChecked={category.enabled}
            />
            <span>Offer this need type</span>
          </label>
          <label className="flex items-start gap-3 leading-6">
            <input
              id={`${id}-doc`}
              name="requiresDocument"
              type="checkbox"
              className="mt-1 size-4"
              defaultChecked={category.requiresDocument}
            />
            <span>A full request must include a document</span>
          </label>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <FormError message={error} />
            <div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function PolicyEditor({
  kind,
  versions,
  onSaved,
}: {
  kind: string;
  versions: PolicyText[];
  onSaved: () => Promise<void>;
}) {
  const current = versions[0];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get("body")).trim();
    if (body === current.body) {
      setError("This is the same as the current wording.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/admin/policy-texts", { body: { kind, body } });
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      key={current.id}
      onSubmit={onSubmit}
      className="flex flex-col gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0"
    >
      <Field
        id={`policy-${kind}`}
        label={`${POLICY_TITLES[kind] ?? kind} · version ${current.version}`}
        hint={`Last changed ${formatMoment(current.createdAt)}${
          current.author ? ` by ${current.author}` : ""
        }.`}
      >
        <textarea
          id={`policy-${kind}`}
          name="body"
          className="input"
          rows={3}
          defaultValue={current.body}
          required
          minLength={20}
          maxLength={2000}
        />
      </Field>
      <FormError message={error} />
      <div>
        <button type="submit" className="btn btn-ghost" disabled={busy}>
          Publish as version {current.version + 1}
        </button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const user = useRequiredUser();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [texts, setTexts] = useState<PolicyText[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        api<Category[]>("/admin/categories"),
        api<PolicyText[]>("/admin/policy-texts"),
      ]).then(([c, t]) => {
        setCategories(c);
        setTexts(t);
      }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    load().catch((err) => setError(errorMessage(err)));
  }, [user, load]);

  if (!user) return null;

  const kinds = texts ? [...new Set(texts.map((t) => t.kind))] : [];

  return (
    <AdminShell
      user={user}
      title="Need types and wording"
      intro="Set what people can ask for and how much. Every change is recorded in the audit log."
    >
      <FormError message={error} />

      {categories ? (
        <section className="flex max-w-3xl flex-col gap-3">
          <h2 className="font-serif text-2xl">Need types</h2>
          <ul className="flex flex-col">
            {categories.map((category) => (
              <CategoryRow
                key={category.key}
                category={category}
                onSaved={load}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {texts ? (
        <section className="flex max-w-3xl flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-2xl">Agreement wording</h2>
            <p className="text-sm leading-6 text-muted">
              People agree to these two sentences when they submit. Each
              request keeps the version its owner agreed to. Have counsel
              review the wording before launch.
            </p>
          </div>
          {kinds.map((kind) => (
            <PolicyEditor
              key={kind}
              kind={kind}
              versions={texts.filter((t) => t.kind === kind)}
              onSaved={load}
            />
          ))}
        </section>
      ) : null}
    </AdminShell>
  );
}
