"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Field, FormError } from "@/components/Field";
import { api, errorMessage, type IdentityQueueItem } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import { useRequiredUser } from "@/lib/session";

const ID_LABELS: Record<string, string> = {
  drivers_license: "Driver's license",
  state_id: "State ID",
  passport: "Passport",
  other: "Another government ID",
};

function IdCard({
  item,
  onDone,
}: {
  item: IdentityQueueItem;
  onDone: () => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(outcome: "verified" | "rejected", note?: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/identity/review/${item.id}/decision`, {
        body: { outcome, note },
      });
      await onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-4 border-t border-line py-6 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{item.person.name}</span>
          <span className="break-all text-sm text-muted">
            {item.person.email}
          </span>
          <span className="text-sm text-muted">
            {item.openRequests === 0
              ? "No open requests"
              : item.openRequests === 1
                ? "1 open request is waiting on this"
                : `${item.openRequests} open requests are waiting on this`}
          </span>
        </div>
        <div className="flex flex-col gap-1 text-sm sm:items-end">
          <a
            href={`/api/identity/review/${item.id}/file`}
            target="_blank"
            rel="noreferrer"
            className="break-all font-medium underline underline-offset-4"
          >
            Open {ID_LABELS[item.docType] ?? "ID"}
          </a>
          <span className="text-muted">
            Sent {formatMoment(item.uploadedAt)}
          </span>
        </div>
      </div>

      <FormError message={error} />

      {rejecting ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const note = String(new FormData(event.currentTarget).get("note"));
            void decide("rejected", note.trim());
          }}
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
        >
          <Field
            id={`note-${item.id}`}
            label="What should they send instead?"
            hint="The person reads this in an email and on their account page."
          >
            <textarea
              id={`note-${item.id}`}
              name="note"
              className="input"
              rows={3}
              placeholder="The photo is too blurry to read. Please send a clearer one."
              required
              minLength={10}
              maxLength={500}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Do not accept this ID
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRejecting(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void decide("verified")}
          >
            The ID matches. Confirm identity
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            Do not accept
          </button>
        </div>
      )}
    </li>
  );
}

export default function IdentityChecksPage() {
  const user = useRequiredUser();
  const [items, setItems] = useState<IdentityQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api<IdentityQueueItem[]>("/identity/review").then(setItems),
    [],
  );

  useEffect(() => {
    if (!user) return;
    load().catch((err) => setError(errorMessage(err)));
  }, [user, load]);

  if (!user) return <AppShell>{null}</AppShell>;

  return (
    <AppShell user={user}>
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-serif text-4xl sm:text-5xl">ID checks</h1>
        <p className="leading-7 text-muted">
          Check that the name on the ID matches the name on the account and
          that the ID is current. Opening an ID is recorded in the audit log.
        </p>
      </div>
      <FormError message={error} />
      {items && items.length === 0 ? (
        <p className="text-muted">No IDs are waiting.</p>
      ) : null}
      {items && items.length > 0 ? (
        <ul className="flex max-w-3xl flex-col">
          {items.map((item) => (
            <IdCard key={item.id} item={item} onDone={load} />
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}
