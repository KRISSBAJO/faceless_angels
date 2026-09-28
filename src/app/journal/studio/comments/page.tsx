"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormError } from "@/components/Field";
import StudioShell, { JOURNAL_STAFF } from "@/components/journal/StudioShell";
import { api, errorMessage } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import type { QueuedComment } from "@/lib/journal";
import { useRequiredUser } from "@/lib/session";

export default function CommentQueuePage() {
  const user = useRequiredUser();
  const [comments, setComments] = useState<QueuedComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const staff = !!user && JOURNAL_STAFF.includes(user.role);

  const load = useCallback(
    () => api<QueuedComment[]>("/journal/studio/comments").then(setComments),
    [],
  );

  useEffect(() => {
    if (!staff) return;
    load().catch((err) => setError(errorMessage(err)));
  }, [staff, load]);

  async function decide(id: string, action: "approve" | "hide") {
    setBusy(true);
    setError(null);
    try {
      await api(`/journal/studio/comments/${id}`, { body: { action } });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <StudioShell
      user={user}
      title="Comments"
      intro="A reader's first comment waits here. Once you show one of theirs, their later comments appear at once. Reported comments come here too."
    >
      <FormError message={error} />
      {comments && comments.length === 0 ? (
        <p className="text-muted">Nothing to check.</p>
      ) : null}
      {comments && comments.length > 0 ? (
        <ul className="flex max-w-3xl flex-col">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-3 border-t border-line py-5 first:border-t-0"
            >
              <p className="text-sm text-muted">
                {comment.by} on{" "}
                <Link
                  href={`/journal/${comment.article.slug}#comments`}
                  className="underline underline-offset-4"
                >
                  {comment.article.title}
                </Link>{" "}
                · {formatMoment(comment.at)}
                {comment.waiting ? " · first comment" : ""}
                {comment.hidden ? " · hidden after reports" : ""}
              </p>
              <p className="whitespace-pre-wrap break-words leading-7">
                {comment.body}
              </p>
              {comment.reports.length > 0 ? (
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  {comment.reports.map((reason, i) => (
                    <li key={i}>Reported: {reason}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-primary px-4 py-2 text-sm"
                  disabled={busy}
                  onClick={() => void decide(comment.id, "approve")}
                >
                  {comment.waiting ? "Show it" : "It is fine, show it"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-4 py-2 text-sm"
                  disabled={busy}
                  onClick={() => void decide(comment.id, "hide")}
                >
                  {comment.hidden ? "Keep it hidden" : "Hide it"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </StudioShell>
  );
}
