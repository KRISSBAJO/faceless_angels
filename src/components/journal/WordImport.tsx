"use client";

import { useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Passage } from "./ScripturePanel";

export interface Imported {
  title: string;
  summary: string;
  body: string;
  scripture: Passage[];
  pictures: number;
  notes: string[];
}

/**
 * Reads a Word file into the editor. Nothing is saved or published: the
 * writer checks the result, changes what they like, then saves.
 */
export default function WordImport({
  replacing,
  onImported,
}: {
  /** True when the editor already has words that an import would replace. */
  replacing: boolean;
  onImported: (article: Imported, fileName: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [waiting, setWaiting] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    setWaiting(null);
    try {
      const form = new FormData();
      form.set("file", file);
      onImported(
        await api<Imported>("/journal/studio/import", { body: form }),
        file.name,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function chosen(file: File | undefined) {
    if (!file) return;
    if (replacing) setWaiting(file);
    else void send(file);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Have it in Word?</span>
          <span className="text-sm text-muted">
            Import a .docx file. Headings, bold, lists, quotes, tables, and
            pictures come across, and Bible references are looked up. You
            check it before anything is saved.
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost px-4 py-2 text-sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Reading the file…" : "Import a Word file"}
        </button>
        <input
          ref={input}
          id="word-file"
          type="file"
          aria-label="Choose a Word file"
          className="sr-only"
          tabIndex={-1}
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => chosen(event.target.files?.[0])}
        />
      </div>
      {waiting ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Replace what is in the editor with “{waiting.name}”? You can
            undo this by not saving.
          </span>
          <button
            type="button"
            className="btn btn-primary px-4 py-2"
            onClick={() => void send(waiting)}
          >
            Replace
          </button>
          <button
            type="button"
            className="btn btn-ghost px-4 py-2"
            onClick={() => {
              setWaiting(null);
              if (input.current) input.current.value = "";
            }}
          >
            Keep what I have
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
