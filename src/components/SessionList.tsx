"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import {
  formatLocalTime,
  formatSessionTime,
  type PrayerSession,
} from "@/lib/prayer";

function SessionRow({
  session,
  showGroup,
  canLead,
  onChanged,
}: {
  session: PrayerSession;
  showGroup: boolean;
  canLead: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [consent, setConsent] = useState(false);
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [link, setLink] = useState<{ url: string; providerName: string } | null>(
    null,
  );
  const [people, setPeople] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const local = formatLocalTime(session);
  const base = `/prayer/sessions/${session.id}`;

  return (
    <li className="flex flex-col gap-3 border-t border-line py-5 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <span
            className={`font-medium ${session.cancelled ? "text-muted line-through" : ""}`}
          >
            {session.title}
          </span>
          <span className="text-sm">
            {formatSessionTime(session)} · {session.durationMinutes} minutes
          </span>
          {local ? (
            <span className="text-sm text-muted">Your time: {local}</span>
          ) : null}
          <span className="text-sm text-muted">
            {showGroup ? (
              <>
                <Link
                  href={`/prayer/groups/${session.groupId}`}
                  className="underline underline-offset-4"
                >
                  {session.groupName}
                </Link>
                {" · "}
              </>
            ) : null}
            Host: {session.host} ·{" "}
            {session.online
              ? `On ${session.providerName}`
              : `In person: ${session.place}`}
            {session.online && session.place ? ` and at ${session.place}` : ""}
          </span>
          {session.notes ? (
            <span className="whitespace-pre-wrap text-sm text-muted">
              {session.notes}
            </span>
          ) : null}
        </div>
        <span className="text-sm tabular-nums text-muted">
          {session.cancelled
            ? "Cancelled"
            : session.capacity
              ? `${session.attending} of ${session.capacity} places taken`
              : `${session.attending} coming`}
        </span>
      </div>

      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}

      {link ? (
        <p className="rounded-lg border border-gold-bright bg-gold-soft px-4 py-3 text-sm">
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            Join on {link.providerName}
          </a>
          <span className="block break-all text-muted">{link.url}</span>
        </p>
      ) : null}

      {people ? (
        <p className="text-sm text-muted">
          {people.length === 0
            ? "No one has said they are coming yet."
            : `Coming: ${people.join(", ")}`}
        </p>
      ) : null}

      {session.cancelled ? null : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {session.iAttend ? (
            <>
              <span className="font-medium text-verified">✓ You are coming</span>
              <button
                type="button"
                className="underline underline-offset-4"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(`${base}/attend`, { method: "DELETE" });
                    setLink(null);
                    await onChanged();
                  })
                }
              >
                I cannot come
              </button>
            </>
          ) : asking ? (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex items-center gap-2">
                <input
                  id={`consent-${session.id}`}
                  type="checkbox"
                  className="size-4"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                The host may see that I plan to come
              </label>
              <button
                type="button"
                className="btn btn-primary px-4 py-2"
                disabled={busy || !consent}
                onClick={() =>
                  void run(async () => {
                    await api(`${base}/attend`, {
                      method: "PUT",
                      body: { consent: true },
                    });
                    setAsking(false);
                    await onChanged();
                  })
                }
              >
                Confirm
              </button>
            </span>
          ) : session.full ? (
            <span className="text-muted">This session is full.</span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost px-4 py-2"
              onClick={() => setAsking(true)}
            >
              I am coming
            </button>
          )}

          {session.online && (session.iAttend || session.isHost) && !link ? (
            <button
              type="button"
              className="underline underline-offset-4"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setLink(await api(`${base}/join`));
                })
              }
            >
              Get the join link
            </button>
          ) : null}

          {session.isHost || canLead ? (
            <>
              <button
                type="button"
                className="underline underline-offset-4"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setPeople(await api<string[]>(`${base}/attendees`));
                  })
                }
              >
                Who is coming
              </button>
              {cancelling ? (
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <button
                    type="button"
                    className="font-medium underline underline-offset-4"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`${base}/cancel`, { method: "POST" });
                        setCancelling(false);
                        await onChanged();
                      })
                    }
                  >
                    Cancel this one
                  </button>
                  {session.inSeries ? (
                    <button
                      type="button"
                      className="font-medium underline underline-offset-4"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`${base}/cancel?series=yes`, {
                            method: "POST",
                          });
                          setCancelling(false);
                          await onChanged();
                        })
                      }
                    >
                      Cancel this and all later ones
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-muted underline underline-offset-4"
                    onClick={() => setCancelling(false)}
                  >
                    Keep it
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => setCancelling(true)}
                >
                  Cancel session
                </button>
              )}
            </>
          ) : null}
        </div>
      )}
    </li>
  );
}

export default function SessionList({
  sessions,
  showGroup = false,
  canLead = false,
  onChanged,
}: {
  sessions: PrayerSession[];
  showGroup?: boolean;
  canLead?: boolean;
  onChanged: () => Promise<unknown>;
}) {
  return (
    <ul className="flex flex-col">
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          showGroup={showGroup}
          canLead={canLead}
          onChanged={onChanged}
        />
      ))}
    </ul>
  );
}
