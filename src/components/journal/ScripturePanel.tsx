"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

export type Translation = "kjv" | "web";

export interface Passage {
  ref: string;
  text: string;
  translation: Translation;
}

interface Found {
  reference: string;
  translation: Translation;
  text: string;
}

export const TRANSLATION_NAMES: Record<Translation, string> = {
  kjv: "King James Version",
  web: "World English Bible",
};

const MAX_PASSAGES = 12;

/** Looks a passage up in the Bible text the site holds. */
export function lookUp(ref: string, translation: Translation) {
  const query = new URLSearchParams({ ref: ref.trim(), translation });
  return api<Found>(`/journal/studio/scripture?${query}`);
}

/**
 * The passages shown above an article. The words come from a public-domain
 * Bible held on the site, so they are exact. Nothing is made up.
 */
export default function ScripturePanel({
  passages,
  body,
  disabled,
  onChange,
}: {
  passages: Passage[];
  /** The article text, searched for references. */
  body: string;
  disabled: boolean;
  onChange: (passages: Passage[]) => void;
}) {
  const [busy, setBusy] = useState<number | "find" | null>(null);
  const [problems, setProblems] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const update = (i: number, change: Partial<Passage>) =>
    onChange(passages.map((p, n) => (n === i ? { ...p, ...change } : p)));

  async function fill(i: number, translation = passages[i].translation) {
    const ref = passages[i].ref.trim();
    if (!ref) return;
    setBusy(i);
    setProblems((old) => ({ ...old, [i]: "" }));
    try {
      const found = await lookUp(ref, translation);
      update(i, { ref: found.reference, text: found.text, translation });
    } catch (err) {
      setProblems((old) => ({ ...old, [i]: errorMessage(err) }));
    } finally {
      setBusy(null);
    }
  }

  async function findInArticle() {
    setBusy("find");
    setNotice(null);
    try {
      const found = await api<{ reference: string }[]>(
        "/journal/studio/scripture/find",
        { body: { text: body } },
      );
      const have = new Set(passages.map((p) => p.ref.trim().toLowerCase()));
      const fresh = found
        .map((f) => f.reference)
        .filter((ref) => !have.has(ref.toLowerCase()))
        .slice(0, MAX_PASSAGES - passages.length);
      const added: Passage[] = [];
      for (const ref of fresh) {
        try {
          const passage = await lookUp(ref, "kjv");
          added.push({ ref: passage.reference, text: passage.text, translation: "kjv" });
        } catch {
          // A reference that is not in the Bible, like John 99:1, is left out.
        }
      }
      onChange([...passages, ...added]);
      setNotice(
        found.length === 0
          ? "No Bible references were found in the article."
          : added.length === 0
            ? "Every reference in the article is already listed."
            : `Added ${added.length} passage${added.length === 1 ? "" : "s"} from the article. Check that each one belongs.`,
      );
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted">
        Shown in a box above the article. A teaching or devotional needs at
        least one. Type a reference, like John 3:16 or 1 Cor 13:4-7, and the
        exact words are filled in from the King James Version or the World
        English Bible. Both are in the public domain.
      </p>

      {passages.map((passage, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-xl border border-line p-4"
        >
          <div className="flex flex-wrap items-start gap-3">
            <input
              id={`scripture-ref-${i}`}
              aria-label="Reference"
              className="input min-w-40 flex-1"
              placeholder="Matthew 6:3-4"
              value={passage.ref}
              disabled={disabled}
              maxLength={80}
              onChange={(event) => update(i, { ref: event.target.value })}
              // Fill in the words when a reference is typed and there are none yet.
              onBlur={() => {
                if (passage.ref.trim() && !passage.text.trim()) void fill(i);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void fill(i);
                }
              }}
            />
            <select
              id={`scripture-translation-${i}`}
              aria-label="Translation"
              className="input w-auto"
              value={passage.translation}
              disabled={disabled}
              onChange={(event) => {
                const translation = event.target.value as Translation;
                update(i, { translation });
                // Changing the translation brings in that translation's words.
                if (passage.ref.trim()) void fill(i, translation);
              }}
            >
              <option value="kjv">KJV</option>
              <option value="web">WEB</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost px-4 py-2 text-sm"
              disabled={disabled || busy !== null || !passage.ref.trim()}
              onClick={() => void fill(i)}
            >
              {busy === i ? "Looking up…" : "Fill in the words"}
            </button>
            <button
              type="button"
              className="pt-2.5 text-sm text-muted underline underline-offset-4"
              disabled={disabled}
              onClick={() => onChange(passages.filter((_, n) => n !== i))}
            >
              Remove
            </button>
          </div>
          {problems[i] ? (
            <p role="alert" className="text-sm">
              {problems[i]}
            </p>
          ) : null}
          <textarea
            id={`scripture-text-${i}`}
            aria-label="The words of the passage"
            className="input font-serif"
            rows={Math.min(8, Math.max(2, Math.ceil(passage.text.length / 90)))}
            placeholder="The words appear here"
            value={passage.text}
            disabled={disabled}
            maxLength={6000}
            onChange={(event) => update(i, { text: event.target.value })}
          />
          {passage.text ? (
            <p className="text-xs text-muted">
              {TRANSLATION_NAMES[passage.translation]}. If you change the
              words, make sure they still match the translation.
            </p>
          ) : null}
        </div>
      ))}

      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}

      {disabled ? null : (
        <div className="flex flex-wrap gap-3">
          {passages.length < MAX_PASSAGES ? (
            <button
              type="button"
              className="btn btn-ghost px-4 py-2 text-sm"
              onClick={() =>
                onChange([...passages, { ref: "", text: "", translation: "kjv" }])
              }
            >
              Add a passage
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost px-4 py-2 text-sm"
            disabled={busy !== null || !body.trim() || passages.length >= MAX_PASSAGES}
            onClick={() => void findInArticle()}
          >
            {busy === "find" ? "Looking…" : "Find verses in the article"}
          </button>
        </div>
      )}
    </div>
  );
}
