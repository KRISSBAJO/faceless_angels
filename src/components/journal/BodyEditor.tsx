"use client";

import { useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { mediaUrl } from "@/lib/journal";
import Markdown from "./Markdown";

type Mode = "write" | "preview" | "both";

interface Tool {
  label: string;
  title: string;
  /** Wraps the selection, or starts each selected line with a mark. */
  wrap?: [string, string];
  line?: string;
  placeholder: string;
}

const TOOLS: Tool[] = [
  { label: "Bold", title: "Bold", wrap: ["**", "**"], placeholder: "bold words" },
  { label: "Italic", title: "Italic", wrap: ["_", "_"], placeholder: "italic words" },
  { label: "Heading", title: "Section heading", line: "## ", placeholder: "Heading" },
  { label: "Scripture", title: "Quote scripture", line: "> ", placeholder: "The words of the verse" },
  { label: "List", title: "List", line: "- ", placeholder: "First point" },
  { label: "Numbered", title: "Numbered list", line: "1. ", placeholder: "First step" },
  { label: "Link", title: "Link", wrap: ["[", "](https://)"], placeholder: "words to link" },
];

const WORDS_PER_MINUTE = 220;

export default function BodyEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>("write");
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  /** Stores the picture, then puts it in the text where the cursor is. */
  async function addPicture(file: File | undefined) {
    const el = area.current;
    if (!file || !el) return;
    setUploading(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const media = await api<{ id: string }>("/journal/studio/media", {
        body: form,
      });
      const at = el.selectionStart;
      const describe = "Describe the picture";
      const before = value.slice(0, at).replace(/\n*$/, "");
      const lead = before ? `${before}\n\n` : "";
      const mark = `![${describe}](${mediaUrl(media.id)})`;
      onChange(`${lead}${mark}\n\n${value.slice(at).replace(/^\n*/, "")}`);
      // Select the placeholder so the writer types the description over it.
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(lead.length + 2, lead.length + 2 + describe.length);
      });
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  function apply(tool: Tool) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: from, selectionEnd: to } = el;
    const chosen = value.slice(from, to) || tool.placeholder;
    let inserted: string;
    let select: [number, number];

    if (tool.wrap) {
      inserted = `${tool.wrap[0]}${chosen}${tool.wrap[1]}`;
      select = [
        from + tool.wrap[0].length,
        from + tool.wrap[0].length + chosen.length,
      ];
    } else {
      // A line mark needs to start on a line of its own.
      const needsBreak = from > 0 && value[from - 1] !== "\n";
      const lines = chosen
        .split("\n")
        .map((line) => `${tool.line}${line}`)
        .join("\n");
      inserted = `${needsBreak ? "\n\n" : ""}${lines}`;
      select = [from + inserted.length - lines.length + tool.line!.length, from + inserted.length];
    }

    onChange(value.slice(0, from) + inserted + value.slice(to));
    // Put the cursor back once React has written the new text.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(select[0], select[1]);
    });
  }

  const words = value.trim().split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  const showWrite = mode !== "preview";
  const showPreview = mode !== "write";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="toolbar"
          aria-label="Text tools"
          className="flex flex-wrap gap-1.5"
        >
          {TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              title={tool.title}
              disabled={disabled || !showWrite}
              onClick={() => apply(tool)}
              className="rounded-md border border-line px-2.5 py-1 text-sm hover:border-muted disabled:opacity-50"
            >
              {tool.label}
            </button>
          ))}
          <button
            type="button"
            title="Add a picture"
            disabled={disabled || !showWrite || uploading}
            onClick={() => picker.current?.click()}
            className="rounded-md border border-line px-2.5 py-1 text-sm hover:border-muted disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Picture"}
          </button>
          <input
            ref={picker}
            id="body-picture"
            type="file"
            aria-label="Choose a picture to add"
            className="sr-only"
            tabIndex={-1}
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void addPicture(event.target.files?.[0])}
          />
        </div>
        <div
          role="radiogroup"
          aria-label="View"
          className="flex rounded-md border border-line text-sm"
        >
          {(
            [
              ["write", "Write"],
              ["both", "Side by side"],
              ["preview", "Preview"],
            ] as const
          ).map(([value_, label]) => (
            <button
              key={value_}
              type="button"
              role="radio"
              aria-checked={mode === value_}
              onClick={() => setMode(value_)}
              className={`px-3 py-1 first:rounded-l-md last:rounded-r-md ${
                value_ === "both" ? "hidden lg:block" : ""
              } ${mode === value_ ? "bg-ink text-paper" : "hover:bg-surface"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-5 ${mode === "both" ? "lg:grid-cols-2" : ""}`}>
        {showWrite ? (
          <textarea
            ref={area}
            id="body"
            aria-label="Article text"
            className="input min-h-[32rem] font-mono text-[0.95rem] leading-7"
            value={value}
            disabled={disabled}
            spellCheck
            onChange={(event) => onChange(event.target.value)}
            placeholder={
              "Write here.\n\nLeave an empty line between paragraphs.\n\n> Use the Scripture button to quote a verse."
            }
          />
        ) : null}
        {showPreview ? (
          <div className="min-h-[32rem] rounded-[0.6rem] border border-line bg-surface p-6">
            {value.trim() ? (
              <Markdown>{value}</Markdown>
            ) : (
              <p className="text-muted">Nothing written yet.</p>
            )}
          </div>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="text-sm">
          {problem}
        </p>
      ) : null}
      <p className="text-sm text-muted">
        Pictures: JPG, PNG, or WebP, up to 5 MB. Replace “Describe the
        picture” with what it shows. Use only pictures you have the right to
        use, and none that show a person we helped.
      </p>

      <p className="text-sm text-muted tabular-nums">
        {words === 1 ? "1 word" : `${words.toLocaleString("en-US")} words`} ·
        about {readMinutes} {readMinutes === 1 ? "minute" : "minutes"} to read
      </p>
    </div>
  );
}
