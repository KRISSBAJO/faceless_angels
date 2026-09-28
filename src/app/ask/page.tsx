"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import {
  api,
  errorMessage,
  type CaseSummary,
  type Catalog,
} from "@/lib/api";
import { formatCents, parseCents } from "@/lib/format";
import { useRequiredUser } from "@/lib/session";

type Mode = "standard" | "quick";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-5 border-t border-line pt-6">
      <legend className="float-left mb-5 w-full font-serif text-2xl">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function DocumentFields({ required }: { required: boolean }) {
  return (
    <>
      <Field id="kind" label="What are you uploading?">
        <select id="kind" name="kind" className="input">
          <option value="bill">Bill</option>
          <option value="notice">Shut-off or late notice</option>
          <option value="invoice">Invoice or estimate</option>
          <option value="receipt">Receipt</option>
          <option value="other">Something else</option>
        </select>
      </Field>
      <Field
        id="file"
        label={required ? "Photo or PDF" : "Photo or PDF (optional)"}
        hint="PDF, JPG, or PNG. Up to 8 MB. It is stored encrypted and never shown to donors."
      >
        <input
          id="file"
          name="file"
          type="file"
          className="input"
          accept="application/pdf,image/jpeg,image/png"
          required={required}
        />
      </Field>
    </>
  );
}

export default function AskPage() {
  const user = useRequiredUser();
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [mode, setMode] = useState<Mode>("standard");
  const [categoryKey, setCategoryKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<Catalog>("/catalog")
      .then((c) => active && setCatalog(c))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  if (!user) return <AppShell>{null}</AppShell>;
  if (!catalog) {
    return (
      <AppShell user={user}>
        <FormError message={error} />
      </AppShell>
    );
  }

  const quick = mode === "quick";
  const choices = catalog.categories.filter(
    (c) => !quick || c.quickMaxCents !== null,
  );
  const category = choices.find((c) => c.key === categoryKey) ?? choices[0];
  const cap = quick ? (category.quickMaxCents ?? 0) : category.maxAmountCents;
  const documentRequired = !quick && category.requiresDocument;
  const largestSmall = Math.max(
    ...catalog.categories.map((c) => c.quickMaxCents ?? 0),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();

    const amount = parseCents(text("amount"));
    if (amount === null || amount < 100) {
      setError("Enter the amount you need, like 45 or 187.42.");
      return;
    }
    if (amount > cap) {
      setError(
        quick
          ? `A small request for this can be up to ${formatCents(cap)}. Use the full request for more.`
          : `A request for this can be up to ${formatCents(cap)}.`,
      );
      return;
    }
    const alreadyPaid = parseCents(text("alreadyPaid") || "0");
    const otherAssistance = parseCents(text("otherAssistance") || "0");
    if (alreadyPaid === null || otherAssistance === null) {
      setError("Enter amounts as numbers, like 50 or 50.00.");
      return;
    }
    const file = form.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (documentRequired && !hasFile) {
      setError("Add a photo or PDF of the bill or notice.");
      return;
    }

    setBusy(true);
    setError(null);

    let created: CaseSummary;
    try {
      created = await api<CaseSummary>("/cases", {
        body: {
          kind: mode,
          category: category.key,
          whatHappened: text("whatHappened"),
          amountRequestedCents: amount,
          city: text("city"),
          region: text("region"),
          providerName: text("providerName") || undefined,
          otherAssistanceCents: otherAssistance,
          listingPreference: text("listingPreference"),
          ...(quick
            ? {}
            : {
                dueDate: text("dueDate"),
                consequence: text("consequence"),
                recurrence: text("recurrence"),
                alreadyPaidCents: alreadyPaid,
                otherAssistanceNote: text("otherAssistanceNote") || undefined,
              }),
        },
      });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      return;
    }

    // The request is saved from here on. If a later step fails, the request
    // page shows what is still missing and lets the person finish.
    try {
      if (hasFile) {
        const upload = new FormData();
        upload.set("kind", text("kind"));
        upload.set("file", file);
        await api(`/cases/${created.id}/evidence`, { body: upload });
      }
      await api(`/cases/${created.id}/submit`, {
        body: { consent: true, attest: true },
      });
    } catch {
      // Fall through to the request page.
    }
    router.push(`/requests/${created.id}`);
  }

  return (
    <AppShell user={user}>
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-serif text-4xl sm:text-5xl">Ask for help</h1>
        <p className="leading-7 text-muted">
          Only our review team sees what you write here. Donors see a short
          summary with no name, address, or account number.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Size of request"
        className="grid max-w-2xl gap-3 sm:grid-cols-2"
      >
        {(
          [
            [
              "standard",
              "Full request",
              "For a bill, rent, or a larger need. Takes about 5 minutes.",
            ],
            [
              "quick",
              "Small need",
              `For everyday needs up to ${formatCents(largestSmall)}. Takes about 1 minute.`,
            ],
          ] as const
        ).map(([value, title, note]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${
              mode === value
                ? "border-ink bg-surface"
                : "border-line hover:border-muted"
            }`}
          >
            <span className="font-medium">{title}</span>
            <span className="text-sm leading-6 text-muted">{note}</span>
          </button>
        ))}
      </div>

      <form
        key={mode}
        onSubmit={onSubmit}
        className="flex max-w-2xl flex-col gap-10"
      >
        <Section title="The need">
          <Field
            id="category"
            label="What kind of help do you need?"
            hint={`${category.description} Up to ${formatCents(cap)}.`}
          >
            <select
              id="category"
              name="category"
              className="input"
              value={category.key}
              onChange={(event) => setCategoryKey(event.target.value)}
            >
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="whatHappened"
            label={quick ? "What do you need it for?" : "What happened?"}
            hint={quick ? "One or two sentences." : "A few sentences is enough."}
          >
            <textarea
              id="whatHappened"
              name="whatHappened"
              className="input"
              rows={quick ? 3 : 5}
              required
              minLength={quick ? 10 : 20}
              maxLength={2000}
            />
          </Field>
          {quick ? null : (
            <>
              <Field id="consequence" label="What happens if this is not paid?">
                <textarea
                  id="consequence"
                  name="consequence"
                  className="input"
                  rows={3}
                  required
                  minLength={5}
                  maxLength={1000}
                />
              </Field>
              <Field id="recurrence" label="Is this a one-time emergency?">
                <select
                  id="recurrence"
                  name="recurrence"
                  className="input"
                  required
                >
                  <option value="one_time">Yes, one time</option>
                  <option value="recurring">No, it keeps coming up</option>
                </select>
              </Field>
            </>
          )}
        </Section>

        <Section title="The amount">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="amount" label="Amount needed (USD)">
              <input
                id="amount"
                name="amount"
                className="input tabular-nums"
                inputMode="decimal"
                placeholder={quick ? "45.00" : "187.42"}
                required
              />
            </Field>
            {quick ? null : (
              <Field id="dueDate" label="Date it is due">
                <input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  className="input"
                  required
                />
              </Field>
            )}
          </div>
          <Field
            id="providerName"
            label={
              quick
                ? "Where would it be spent? (optional)"
                : "Who is it owed to?"
            }
            hint="We pay the provider or store directly when we can."
          >
            <input
              id="providerName"
              name="providerName"
              className="input"
              placeholder={quick ? "A grocery store near you" : "Your electric company"}
              required={!quick}
              minLength={2}
              maxLength={120}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            {quick ? null : (
              <Field id="alreadyPaid" label="What you have paid toward it">
                <input
                  id="alreadyPaid"
                  name="alreadyPaid"
                  className="input tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </Field>
            )}
            <Field id="otherAssistance" label="Help from anyone else">
              <input
                id="otherAssistance"
                name="otherAssistance"
                className="input tabular-nums"
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
          </div>
          {quick ? null : (
            <Field
              id="otherAssistanceNote"
              label="Who else have you asked? (optional)"
            >
              <input
                id="otherAssistanceNote"
                name="otherAssistanceNote"
                className="input"
                maxLength={500}
              />
            </Field>
          )}
        </Section>

        <Section title="Where you are">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="city" label="City">
              <input
                id="city"
                name="city"
                className="input"
                autoComplete="address-level2"
                required
                minLength={2}
                maxLength={80}
              />
            </Field>
            <Field id="region" label="State">
              <input
                id="region"
                name="region"
                className="input"
                autoComplete="address-level1"
                required
                minLength={2}
                maxLength={40}
              />
            </Field>
          </div>
        </Section>

        <Section title={documentRequired ? "The document" : "A document, if you have one"}>
          {documentRequired ? null : (
            <p className="text-sm leading-6 text-muted">
              You can send this request without one. A receipt, a price
              quote, or a photo helps us decide faster.
            </p>
          )}
          <DocumentFields required={documentRequired} />
        </Section>

        <Section title="Who may see your need">
          <p className="text-sm leading-6 text-muted">
            If we approve your request, a reviewer writes a short summary for
            Angels. It never has your name, address, or account number. You
            can read it on your request page.
          </p>
          {(
            [
              [
                "public",
                "Anyone",
                "Shown on the public list. More people can help.",
              ],
              [
                "angels_only",
                "Confirmed Angels only",
                "Shown only to Angels whose identity we have confirmed.",
              ],
            ] as const
          ).map(([value, title, note], i) => (
            <label key={value} className="flex items-start gap-3 leading-6">
              <input
                id={`listing-${value}`}
                type="radio"
                name="listingPreference"
                value={value}
                defaultChecked={i === 0}
                className="mt-1.5 size-4"
              />
              <span>
                <span className="font-medium">{title}</span>
                <span className="block text-sm text-muted">{note}</span>
              </span>
            </label>
          ))}
        </Section>

        <Section title="Your agreement">
          <label className="flex items-start gap-3 leading-6">
            <input
              id="consent"
              name="consent"
              type="checkbox"
              className="mt-1 size-4"
              required
            />
            <span>{catalog.consent.body}</span>
          </label>
          <label className="flex items-start gap-3 leading-6">
            <input
              id="attest"
              name="attest"
              type="checkbox"
              className="mt-1 size-4"
              required
            />
            <span>{catalog.attestation.body}</span>
          </label>
        </Section>

        {user.emailVerified ? null : (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-6">
            Your email is not confirmed yet. You can save this request now and
            submit it after you open the link we sent you.
          </p>
        )}
        {user.identityStatus === "verified" ? null : (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-6">
            We will also need to confirm who you are before a request can be
            approved. You can send your ID from your account page at any time.
          </p>
        )}

        <FormError message={error} />
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy
              ? "Sending…"
              : user.emailVerified
                ? "Submit request"
                : "Save request"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
