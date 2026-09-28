"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { REACTION_LABELS, type Article } from "@/lib/journal";
import { Field } from "../Field";
import ShareBar from "../ShareBar";

/**
 * Everything a reader can do with an article: react, save it, keep a
 * private note, and mark it read.
 */
export default function Engagement({ article }: { article: Article }) {
  const signedIn = article.mine !== null;
  const [counts, setCounts] = useState(article.reactions);
  const [mine, setMine] = useState(article.mine?.reactions ?? []);
  const [saved, setSaved] = useState(article.mine?.saved ?? false);
  const [finished, setFinished] = useState(article.mine?.finished ?? false);
  const [note, setNote] = useState(article.mine?.note ?? "");
  const [noteState, setNoteState] = useState<"idle" | "saved" | string>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const base = `/journal/articles/${article.id}`;
  const next = encodeURIComponent(`/journal/${article.slug}`);

  // Count the visit once, and mark the article read when its end is reached.
  useEffect(() => {
    if (!article.live) return;
    api(`${base}/view`, { method: "POST" }).catch(() => undefined);
  }, [article.live, base]);

  useEffect(() => {
    if (!signedIn || finished || !article.live || !end.current) return;
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      api(`${base}/finished`, { method: "POST" })
        .then(() => setFinished(true))
        .catch(() => undefined);
    });
    watcher.observe(end.current);
    return () => watcher.disconnect();
  }, [signedIn, finished, article.live, base]);

  async function react(kind: string) {
    const on = !mine.includes(kind);
    setMessage(null);
    try {
      const result = await api<Record<string, number>>(
        on ? `${base}/reactions` : `${base}/reactions/remove`,
        { method: on ? "PUT" : "POST", body: { kind } },
      );
      setCounts(result);
      setMine(on ? [...mine, kind] : mine.filter((k) => k !== kind));
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function toggleSaved() {
    setMessage(null);
    try {
      await api(`${base}/saved`, { method: saved ? "DELETE" : "PUT" });
      setSaved(!saved);
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api(`${base}/note`, { method: "PUT", body: { body: note } });
      setNoteState("saved");
    } catch (err) {
      setNoteState(errorMessage(err));
    }
  }

  return (
    <section
      aria-label="Respond to this article"
      className="flex flex-col gap-6 border-t border-line pt-8"
    >
      <div ref={end} />

      <div className="flex flex-wrap items-center gap-3">
        {Object.entries(REACTION_LABELS).map(([kind, label]) =>
          signedIn ? (
            <button
              key={kind}
              type="button"
              aria-pressed={mine.includes(kind)}
              onClick={() => void react(kind)}
              className={`btn px-4 py-2 text-sm ${
                mine.includes(kind)
                  ? "border-transparent bg-verified-soft text-verified"
                  : "btn-ghost"
              }`}
            >
              {label}
              <span className="ml-2 tabular-nums text-muted">
                {counts[kind] ?? 0}
              </span>
            </button>
          ) : (
            <span
              key={kind}
              className="rounded-full border border-line px-4 py-2 text-sm text-muted"
            >
              {label}
              <span className="ml-2 tabular-nums">{counts[kind] ?? 0}</span>
            </span>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {signedIn ? (
          <button
            type="button"
            aria-pressed={saved}
            onClick={() => void toggleSaved()}
            className="underline underline-offset-4"
          >
            {saved ? "✓ Saved to your library" : "Save for later"}
          </button>
        ) : (
          <Link
            href={`/sign-up?next=${next}`}
            className="underline underline-offset-4"
          >
            Join to react, save, and keep notes
          </Link>
        )}
        {signedIn && finished ? (
          <span className="text-muted">You have read this.</span>
        ) : null}
      </div>

      <ShareBar
        path={`/journal/${article.slug}`}
        title={article.title}
        summary={article.summary}
        articleId={article.id}
        label="Share this article"
      />

      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}

      {signedIn ? (
        <form
          onSubmit={saveNote}
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
        >
          <Field
            id="note"
            label="Your private notes"
            hint="Only you can read these. Not staff, and not other readers."
          >
            <textarea
              id="note"
              className="input"
              rows={4}
              maxLength={5000}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteState("idle");
              }}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="btn btn-ghost px-4 py-2 text-sm">
              Save note
            </button>
            {noteState === "saved" ? (
              <span role="status" className="text-sm text-verified">
                Saved
              </span>
            ) : noteState !== "idle" ? (
              <span role="alert" className="text-sm">
                {noteState}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
