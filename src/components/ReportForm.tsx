"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { REPORT_CATEGORY_LABELS } from "@/lib/prayer";
import { Field, FormError } from "./Field";

/** Reports a request, a reply, a member, or a group. `path` is where it is sent. */
export default function ReportForm({
  path,
  question,
  goesTo,
  onSent,
  onCancel,
}: {
  path: string;
  question: string;
  /** Who will look at the report, so the person knows. */
  goesTo: string;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(path, {
        body: {
          category: form.get("category"),
          reason: String(form.get("reason")).trim(),
        },
      });
      onSent();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex max-w-2xl flex-col gap-4 rounded-xl border border-line bg-surface p-5"
    >
      <Field id="report-category" label={question}>
        <select
          id="report-category"
          name="category"
          className="input"
          defaultValue=""
          required
        >
          <option value="" disabled>
            Choose one
          </option>
          {Object.entries(REPORT_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field id="report-reason" label="What happened?" hint={goesTo}>
        <textarea
          id="report-reason"
          name="reason"
          className="input"
          rows={3}
          required
          minLength={5}
          maxLength={500}
        />
      </Field>
      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Send report
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
