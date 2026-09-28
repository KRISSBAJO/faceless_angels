"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type User } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import type { Comment } from "@/lib/journal";
import { Field, FormError } from "../Field";

function CommentForm({
  articleId,
  parentId,
  label,
  onSent,
  onCancel,
}: {
  articleId: string;
  parentId?: string;
  label: string;
  onSent: (waiting: boolean) => Promise<void>;
  onCancel?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = parentId ? `reply-${parentId}` : "comment";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const body = String(new FormData(formEl).get("body")).trim();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ waiting: boolean }>(
        `/journal/articles/${articleId}/comments`,
        { body: { body, parentId } },
      );
      formEl.reset();
      await onSent(result.waiting);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field
        id={id}
        label={label}
        hint={
          parentId
            ? undefined
            : "Be kind. Your first comment is read by a moderator before it shows."
        }
      >
        <textarea
          id={id}
          name="body"
          className="input"
          rows={parentId ? 2 : 3}
          required
          minLength={2}
          maxLength={1500}
        />
      </Field>
      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="btn btn-ghost px-4 py-2 text-sm"
          disabled={busy}
        >
          {parentId ? "Reply" : "Post comment"}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="text-sm text-muted underline underline-offset-4"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function CommentBody({
  comment,
  canAct,
  onReply,
  onChanged,
}: {
  comment: Comment;
  canAct: boolean;
  onReply?: () => void;
  onChanged: (notice?: string) => Promise<void>;
}) {
  const [reporting, setReporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, notice?: string) {
    setError(null);
    try {
      await action();
      setReporting(false);
      setConfirming(false);
      await onChanged(notice);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted">
        <span className="font-medium text-ink">
          {comment.mine ? "You" : comment.by}
        </span>
        {comment.staff ? " · Faceless Angels" : ""} · {formatMoment(comment.at)}
        {comment.waiting ? " · waiting for a moderator" : ""}
      </p>
      <p className="whitespace-pre-wrap break-words leading-7">
        {comment.body}
      </p>
      {canAct && !comment.waiting ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {onReply ? (
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={onReply}
            >
              Reply
            </button>
          ) : null}
          {comment.mine ? (
            confirming ? (
              <>
                <button
                  type="button"
                  className="font-medium text-ink underline underline-offset-4"
                  onClick={() =>
                    void run(() =>
                      api(`/journal/comments/${comment.id}`, {
                        method: "DELETE",
                      }),
                    )
                  }
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => setConfirming(true)}
              >
                Delete
              </button>
            )
          ) : (
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => setReporting(!reporting)}
            >
              Report
            </button>
          )}
        </div>
      ) : null}
      {reporting ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(
              new FormData(event.currentTarget).get("reason"),
            ).trim();
            void run(
              () =>
                api(`/journal/comments/${comment.id}/report`, {
                  body: { reason },
                }),
              "Thank you. A moderator will look at it.",
            );
          }}
          className="flex flex-wrap items-end gap-3 pt-1"
        >
          <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm font-medium">
            What is wrong with it?
            <input
              name="reason"
              className="input font-normal"
              required
              minLength={5}
              maxLength={300}
            />
          </label>
          <button type="submit" className="btn btn-ghost px-4 py-2 text-sm">
            Send report
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function Comments({
  articleId,
  slug,
  open,
}: {
  articleId: string;
  slug: string;
  /** False when the author closed comments. */
  open: boolean;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<Comment[]>(`/journal/articles/${articleId}/comments`).then(
        setComments,
      ),
    [articleId],
  );

  useEffect(() => {
    load().catch(() => undefined);
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => undefined);
  }, [load]);

  async function changed(message?: string) {
    setReplyTo(null);
    setNotice(message ?? null);
    await load();
  }

  const sent = (waiting: boolean) =>
    changed(
      waiting
        ? "Thank you. A moderator reads a first comment before it shows."
        : undefined,
    );

  if (!comments) return null;
  if (!open && comments.length === 0) return null;

  const count = comments.reduce(
    (n, c) => n + 1 + (c.replies?.length ?? 0),
    0,
  );
  const canWrite = open && user?.emailVerified;

  return (
    <section
      id="comments"
      aria-labelledby="comments-title"
      className="flex scroll-mt-8 flex-col gap-6 border-t border-line pt-8"
    >
      <h2 id="comments-title" className="font-serif text-2xl">
        Conversation{" "}
        <span className="font-sans text-base text-muted tabular-nums">
          {count}
        </span>
      </h2>

      {notice ? (
        <p role="status" className="text-sm text-verified">
          {notice}
        </p>
      ) : null}

      {comments.length === 0 ? (
        <p className="text-sm text-muted">No one has commented yet.</p>
      ) : (
        <ul className="flex flex-col gap-7">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-4">
              <CommentBody
                comment={comment}
                canAct={!!user}
                onReply={canWrite ? () => setReplyTo(comment.id) : undefined}
                onChanged={changed}
              />
              {comment.replies && comment.replies.length > 0 ? (
                <ul className="flex flex-col gap-4 border-l-2 border-line pl-5">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentBody
                        comment={reply}
                        canAct={!!user}
                        onChanged={changed}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              {replyTo === comment.id ? (
                <div className="border-l-2 border-line pl-5">
                  <CommentForm
                    articleId={articleId}
                    parentId={comment.id}
                    label={`Reply to ${comment.mine ? "yourself" : comment.by}`}
                    onSent={sent}
                    onCancel={() => setReplyTo(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <p className="text-sm text-muted">Comments are closed.</p>
      ) : canWrite ? (
        <CommentForm articleId={articleId} label="Add a comment" onSent={sent} />
      ) : user ? (
        <p className="text-sm">
          Confirm your email to comment. Use the link we sent you, or the
          button at the top of the page.
        </p>
      ) : (
        <p className="text-sm">
          <Link
            href={`/sign-up?next=${encodeURIComponent(`/journal/${slug}#comments`)}`}
            className="font-medium underline underline-offset-4"
          >
            Join to take part
          </Link>{" "}
          or{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(`/journal/${slug}`)}`}
            className="underline underline-offset-4"
          >
            sign in
          </Link>
          .
        </p>
      )}
    </section>
  );
}
