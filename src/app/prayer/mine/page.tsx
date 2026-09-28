"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { FormError } from "@/components/Field";
import { api, errorMessage } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import {
  AUDIENCE_LABELS,
  REQUEST_STATUS_LABELS,
  type PrayerRequest,
} from "@/lib/prayer";
import { useRequiredUser } from "@/lib/session";

export default function MyPrayersPage() {
  const user = useRequiredUser();
  const [requests, setRequests] = useState<PrayerRequest[] | null>(null);
  const [blocked, setBlocked] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api<PrayerRequest[]>("/prayer/requests/mine")
      .then((rows) => active && setRequests(rows))
      .catch((err) => active && setError(errorMessage(err)));
    api<{ blocked: number }>("/prayer/blocks")
      .then((b) => active && setBlocked(b.blocked))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user]);

  async function unblock() {
    try {
      await api("/prayer/blocks", { method: "DELETE" });
      setBlocked(0);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!user) return <AppShell>{null}</AppShell>;

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl sm:text-5xl">My prayer requests</h1>
        <Link href="/prayer/new" className="btn btn-primary">
          Ask for prayer
        </Link>
      </div>

      <FormError message={error} />

      {requests && requests.length === 0 ? (
        <p className="text-muted">You have not written a request yet.</p>
      ) : null}

      {requests && requests.length > 0 ? (
        <ul className="flex flex-col">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-col gap-2 border-t border-line py-5 last:border-b"
            >
              <p className="text-sm text-muted">
                {request.audience === "group"
                  ? request.groupName
                  : AUDIENCE_LABELS[request.audience]}{" "}
                · {formatMoment(request.at)} ·{" "}
                {request.ended && request.status === "active"
                  ? "Ended"
                  : (REQUEST_STATUS_LABELS[request.status] ?? request.status)}
              </p>
              <Link
                href={`/prayer/requests/${request.id}`}
                className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed underline-offset-4 hover:underline"
              >
                {request.body}
              </Link>
              {request.status === "hidden" && request.moderationNote ? (
                <p className="text-sm">{request.moderationNote}</p>
              ) : null}
              {request.audience !== "personal" &&
              (request.prayedCount ?? 0) > 0 ? (
                <p className="text-sm text-muted">
                  {request.prayedCount === 1
                    ? "Someone prayed for this."
                    : `${request.prayedCount} people prayed for this.`}{" "}
                  Only you can see this.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {blocked > 0 ? (
        <p className="text-sm text-muted">
          You have hidden {blocked === 1 ? "1 person" : `${blocked} people`}.{" "}
          <button
            type="button"
            onClick={unblock}
            className="underline underline-offset-4"
          >
            Show everyone again
          </button>
        </p>
      ) : null}
    </AppShell>
  );
}
