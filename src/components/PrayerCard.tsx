"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import type { PrayerRequest } from "@/lib/prayer";

/** Marks that the viewer prayed. It never shows how many others did. */
export function PrayedButton({ request }: { request: PrayerRequest }) {
  const [prayed, setPrayed] = useState(request.iPrayed);
  const [busy, setBusy] = useState(false);

  if (request.mine) return null;

  async function toggle() {
    setBusy(true);
    try {
      await api(`/prayer/requests/${request.id}/prayed`, {
        method: prayed ? "DELETE" : "PUT",
      });
      setPrayed(!prayed);
    } catch {
      // Left as it was. The next load shows the true state.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-pressed={prayed}
      disabled={busy}
      onClick={toggle}
      className={`btn px-4 py-2 text-sm ${
        prayed
          ? "border-transparent bg-verified-soft text-verified"
          : "btn-ghost"
      }`}
    >
      {prayed ? "✓ You prayed" : "I prayed"}
    </button>
  );
}

export default function PrayerCard({ request }: { request: PrayerRequest }) {
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
      <p className="text-sm text-muted">
        {request.mine
          ? "You"
          : (request.by ?? "A member of the network")}{" "}
        · {formatMoment(request.at)}
        {request.needsCare ? (
          <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 font-medium text-gold">
            May need care
          </span>
        ) : null}
      </p>
      <p className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">
        {request.body}
      </p>
      {request.answeredAt ? (
        <p className="text-sm font-medium text-verified">Answered</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
        <PrayedButton request={request} />
        <Link
          href={`/prayer/requests/${request.id}`}
          className="text-sm underline underline-offset-4"
        >
          {request.allowResponses ? "Open and encourage" : "Open"}
        </Link>
      </div>
    </article>
  );
}
