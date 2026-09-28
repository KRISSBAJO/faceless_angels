"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, type User } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import {
  ACTION_LABELS,
  KIND_LABELS,
  KIND_NOTES,
  mediaUrl,
  REACTION_LABELS,
  STAGE_LABELS,
  type ArticleStats,
  type StudioArticleDetail,
  type StudioCategory,
  type StudioSeries,
} from "@/lib/journal";
import { Field, FormError } from "../Field";
import ShareBar from "../ShareBar";
import BodyEditor from "./BodyEditor";
import ScripturePanel, { type Passage } from "./ScripturePanel";
import WordImport, { type Imported } from "./WordImport";

interface Draft {
  title: string;
  summary: string;
  body: string;
  kind: string;
  categoryKey: string;
  tags: string;
  coverMediaId: string | null;
  coverAlt: string;
  scripture: Passage[];
  reflection: string[];
  action: string;
  seriesId: string;
  seriesPosition: string;
  allowComments: boolean;
}

const EMPTY: Draft = {
  title: "",
  summary: "",
  body: "",
  kind: "teaching",
  categoryKey: "christian_living",
  tags: "",
  coverMediaId: null,
  coverAlt: "",
  scripture: [],
  reflection: [],
  action: "pray",
  seriesId: "",
  seriesPosition: "",
  allowComments: true,
};

function fromArticle(article: StudioArticleDetail): Draft {
  return {
    title: article.title,
    summary: article.summary,
    body: article.body,
    kind: article.kind,
    categoryKey: article.category.key,
    tags: article.tags.join(", "),
    coverMediaId: article.cover?.id ?? null,
    coverAlt: article.cover?.alt ?? "",
    scripture: article.scripture.map((s) => ({
      ref: s.ref,
      text: s.text ?? "",
      translation: s.translation ?? "kjv",
    })),
    reflection: article.reflection,
    action: article.action,
    seriesId: article.seriesId ?? "",
    seriesPosition: article.seriesPosition ? String(article.seriesPosition) : "",
    allowComments: article.allowComments,
  };
}

function toBody(draft: Draft, note: string) {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    body: draft.body,
    kind: draft.kind,
    categoryKey: draft.categoryKey,
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    coverMediaId: draft.coverMediaId,
    coverAlt: draft.coverAlt.trim() || undefined,
    scripture: draft.scripture
      .filter((s) => s.ref.trim())
      .map((s) => ({
        ref: s.ref.trim(),
        text: s.text.trim() || undefined,
        translation: s.translation,
      })),
    reflection: draft.reflection.map((q) => q.trim()).filter(Boolean),
    action: draft.action,
    seriesId: draft.seriesId || null,
    seriesPosition: draft.seriesPosition
      ? Number(draft.seriesPosition)
      : undefined,
    allowComments: draft.allowComments,
    note: note.trim() || undefined,
  };
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-5">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

const SHARE_NAMES: Record<string, string> = {
  device: "Phone share sheet",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  x: "X",
  linkedin: "LinkedIn",
  email: "Email",
  link: "Copied link",
};

function Stats({ articleId }: { articleId: string }) {
  const [stats, setStats] = useState<ArticleStats | null>(null);

  useEffect(() => {
    api<ArticleStats>(`/journal/studio/articles/${articleId}/stats`)
      .then(setStats)
      .catch(() => undefined);
  }, [articleId]);

  if (!stats) return null;
  const peak = Math.max(1, ...stats.last30Days.map((d) => d.views));
  const finished =
    stats.readersStarted === 0
      ? null
      : Math.round((stats.readersFinished / stats.readersStarted) * 100);

  return (
    <Panel title="How it is doing">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
        {(
          [
            ["Views", stats.views],
            ["Read to the end", finished === null ? "No data" : `${finished}%`],
            ["Shared", stats.shares],
            ["Comments", stats.comments],
            ["Saved", stats.saved],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-muted">{label}</dt>
            <dd className="font-serif text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <figure className="flex flex-col gap-2">
        <div
          role="img"
          aria-label={`Views each day for the last 30 days. The most in one day was ${peak}.`}
          className="flex h-20 items-end gap-[3px]"
        >
          {stats.last30Days.map((day) => (
            <div
              key={day.day}
              title={`${day.day}: ${day.views}`}
              className="flex-1 rounded-t-sm bg-gold-bright"
              style={{
                height: `${Math.max(day.views === 0 ? 2 : 6, (day.views / peak) * 100)}%`,
                opacity: day.views === 0 ? 0.25 : 1,
              }}
            />
          ))}
        </div>
        <figcaption className="flex justify-between text-xs text-muted tabular-nums">
          <span>{stats.last30Days[0]?.day}</span>
          <span>Views each day. Most in a day: {peak}</span>
          <span>Today</span>
        </figcaption>
      </figure>
      <p className="text-sm text-muted">
        {Object.entries(REACTION_LABELS)
          .map(([kind, label]) => `${label}: ${stats.reactions[kind] ?? 0}`)
          .join(" · ")}
        {" · "}
        {stats.notes === 1
          ? "1 reader kept a private note"
          : `${stats.notes} readers kept private notes`}
        . Notes are never shown to staff.
      </p>
      {stats.shares > 0 ? (
        <p className="text-sm text-muted">
          Shared on:{" "}
          {Object.entries(stats.sharedTo)
            .map(([channel, n]) => `${SHARE_NAMES[channel] ?? channel} ${n}`)
            .join(" · ")}
        </p>
      ) : null}
    </Panel>
  );
}

export default function ArticleEditor({
  user,
  articleId,
}: {
  user: User;
  articleId: string | null;
}) {
  const router = useRouter();
  const [article, setArticle] = useState<StudioArticleDetail | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<Draft>(EMPTY);
  const [note, setNote] = useState("");
  const [categories, setCategories] = useState<StudioCategory[]>([]);
  const [series, setSeries] = useState<StudioSeries[]>([]);
  const [recovered, setRecovered] = useState<{ draft: Draft; at: string } | null>(
    null,
  );
  const [panel, setPanel] = useState<
    null | "changes" | "schedule" | "correction" | "archive"
  >(null);
  const [version, setVersion] = useState<{
    id: string;
    title: string;
    body: string;
    at: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [imported, setImported] = useState<{ file: string; notes: string[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const storageKey = `fa-journal-draft-${articleId ?? "new"}`;
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );
  const canEdit = article ? article.can.edit && article.stage !== "archived" : true;

  const accept = useCallback((loaded: StudioArticleDetail) => {
    const next = fromArticle(loaded);
    setArticle(loaded);
    setDraft(next);
    setSaved(next);
    setNote("");
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<StudioCategory[]>("/journal/studio/categories"),
      api<StudioSeries[]>("/journal/studio/series"),
      articleId
        ? api<StudioArticleDetail>(`/journal/studio/articles/${articleId}`)
        : Promise.resolve(null),
    ])
      .then(([c, s, loaded]) => {
        if (!active) return;
        setCategories(c.filter((category) => category.enabled));
        setSeries(s);
        const base = loaded ? fromArticle(loaded) : EMPTY;
        if (loaded) accept(loaded);
        // Words typed but never saved, kept in this browser.
        try {
          const kept = localStorage.getItem(storageKey);
          if (kept) {
            const parsed = JSON.parse(kept) as { draft: Draft; at: string };
            if (JSON.stringify(parsed.draft) !== JSON.stringify(base)) {
              setRecovered(parsed);
            }
          }
        } catch {
          // Storage is blocked or the copy is damaged. Nothing to recover.
        }
      })
      .catch(() => active && setMissing(true));
    return () => {
      active = false;
    };
  }, [articleId, accept, storageKey]);

  // Keep a copy in this browser while there are unsaved words.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ draft, at: new Date().toISOString() }),
        );
      } catch {
        // Storage is full or blocked. Saving to the server still works.
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [dirty, draft, storageKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function forget() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Nothing to remove.
    }
    setRecovered(null);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((old) => ({ ...old, [key]: value }));

  const save = useCallback(async () => {
    if (!draft.title.trim()) {
      setError("Give the article a title before you save.");
      return null;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = toBody(draft, note);
      const result = articleId
        ? await api<StudioArticleDetail>(
            `/journal/studio/articles/${articleId}`,
            { method: "PATCH", body },
          )
        : await api<StudioArticleDetail>("/journal/studio/articles", { body });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Nothing to remove.
      }
      setRecovered(null);
      if (!articleId) {
        router.replace(`/journal/studio/${result.id}`);
        return result;
      }
      accept(result);
      setNotice("Saved.");
      return result;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [accept, articleId, draft, note, router, storageKey]);

  // Ctrl+S or Cmd+S saves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canEdit && !busy) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, canEdit, save]);

  /** Runs a step such as review or publish. Unsaved words are saved first. */
  async function step(path: string, body: unknown, done: string) {
    if (!articleId) return;
    if (dirty && canEdit && !(await save())) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<StudioArticleDetail | undefined>(
        `/journal/studio/articles/${articleId}${path}`,
        { method: path === "/featured" ? "PUT" : "POST", body: body ?? {} },
      );
      accept(
        result ??
          (await api<StudioArticleDetail>(
            `/journal/studio/articles/${articleId}`,
          )),
      );
      setPanel(null);
      setNotice(done);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const media = await api<{ id: string }>("/journal/studio/media", {
        body: form,
      });
      set("coverMediaId", media.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function openVersion(id: string) {
    if (!articleId) return;
    try {
      const old = await api<{ title: string; body: string; at: string }>(
        `/journal/studio/articles/${articleId}/revisions/${id}`,
      );
      setVersion({ id, ...old });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (missing) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-muted">We could not find that article.</p>
        <Link href="/journal/studio" className="btn btn-primary">
          Back to the Studio
        </Link>
      </div>
    );
  }
  if (articleId && !article) return null;

  const stage = article?.stage ?? "draft";
  const live = stage === "published" || stage === "scheduled";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/journal/studio" className="text-muted hover:text-ink">
          ← Studio
        </Link>
        <span className="text-muted">
          {STAGE_LABELS[stage]}
          {article ? ` · by ${article.mine ? "you" : article.author.name}` : ""}
          {article?.reviewer ? ` · reviewed by ${article.reviewer.name}` : ""}
          {stage === "scheduled" && article?.publishedAt
            ? ` · goes out ${formatMoment(article.publishedAt)}`
            : ""}
        </span>
      </div>

      {recovered ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-bright bg-gold-soft p-4 text-sm"
        >
          <span>
            This browser kept words you did not save, from{" "}
            {formatMoment(recovered.at)}.
          </span>
          <span className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary px-4 py-2"
              onClick={() => {
                setDraft(recovered.draft);
                setRecovered(null);
              }}
            >
              Bring them back
            </button>
            <button
              type="button"
              className="btn btn-ghost px-4 py-2"
              onClick={forget}
            >
              Discard
            </button>
          </span>
        </div>
      ) : null}

      {article?.reviewNote && stage === "changes_requested" ? (
        <div className="rounded-xl border border-gold-bright bg-gold-soft p-4 leading-7">
          <p className="font-medium">
            {article.reviewer?.name ?? "The reviewer"} asked for changes
          </p>
          <p className="whitespace-pre-wrap">{article.reviewNote}</p>
        </div>
      ) : null}

      {!canEdit && article ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm">
          {article.stage === "archived"
            ? "This article is archived. Bring it back to change it."
            : "You can read this article. Only its author or an editor can change it."}
        </p>
      ) : null}

      <div className="grid gap-10 xl:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {canEdit && !live ? (
            <WordImport
              replacing={Boolean(draft.title.trim() || draft.body.trim())}
              onImported={(result: Imported, file) => {
                setDraft((old) => {
                  const have = new Set(
                    old.scripture.map((p) => p.ref.trim().toLowerCase()),
                  );
                  return {
                    ...old,
                    title: result.title || old.title,
                    summary: result.summary || old.summary,
                    body: result.body,
                    scripture: [
                      ...old.scripture,
                      ...result.scripture.filter(
                        (p) => !have.has(p.ref.toLowerCase()),
                      ),
                    ].slice(0, 12),
                  };
                });
                setImported({ file, notes: result.notes });
                setNotice(null);
                setError(null);
              }}
            />
          ) : null}

          {imported ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-xl border border-gold-bright bg-gold-soft p-4 text-sm leading-6"
            >
              <p className="font-medium">
                “{imported.file}” is in the editor. Nothing is saved yet.
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                <li>Read it through and change anything you like.</li>
                {imported.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
                <li>
                  When it looks right, press Save. Then send it for review as
                  usual.
                </li>
              </ul>
              <button
                type="button"
                className="self-start underline underline-offset-4"
                onClick={() => setImported(null)}
              >
                Close
              </button>
            </div>
          ) : null}

          <Field id="title" label="Title">
            <input
              id="title"
              className="input font-serif text-2xl"
              value={draft.title}
              disabled={!canEdit}
              maxLength={160}
              onChange={(event) => set("title", event.target.value)}
            />
          </Field>
          <Field
            id="summary"
            label="Summary"
            hint="One or two sentences. Shown in lists, in search, and when the article is shared."
          >
            <textarea
              id="summary"
              className="input"
              rows={2}
              value={draft.summary}
              disabled={!canEdit}
              maxLength={400}
              onChange={(event) => set("summary", event.target.value)}
            />
          </Field>

          <BodyEditor
            value={draft.body}
            disabled={!canEdit}
            onChange={(value) => set("body", value)}
          />

          <Panel title="Scripture">
            <ScripturePanel
              passages={draft.scripture}
              body={draft.body}
              disabled={!canEdit}
              onChange={(passages) => set("scripture", passages)}
            />
          </Panel>

          <Panel title="Questions to think about">
            {draft.reflection.map((question, i) => (
              <div key={i} className="flex items-start gap-3">
                <input
                  id={`question-${i}`}
                  aria-label={`Question ${i + 1}`}
                  className="input"
                  value={question}
                  disabled={!canEdit}
                  maxLength={300}
                  onChange={(event) =>
                    set(
                      "reflection",
                      draft.reflection.map((q, n) =>
                        n === i ? event.target.value : q,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="pt-3 text-sm text-muted underline underline-offset-4"
                  disabled={!canEdit}
                  onClick={() =>
                    set(
                      "reflection",
                      draft.reflection.filter((_, n) => n !== i),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {canEdit && draft.reflection.length < 6 ? (
              <div>
                <button
                  type="button"
                  className="btn btn-ghost px-4 py-2 text-sm"
                  onClick={() => set("reflection", [...draft.reflection, ""])}
                >
                  Add a question
                </button>
              </div>
            ) : null}
          </Panel>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <FormError message={error} />
            {notice ? (
              <p role="status" className="text-sm text-verified">
                {notice}
              </p>
            ) : null}

            {canEdit ? (
              <>
                {article && dirty ? (
                  <Field id="note" label="What did you change? (optional)">
                    <input
                      id="note"
                      className="input"
                      value={note}
                      maxLength={200}
                      placeholder="Kept with this version"
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || (!dirty && !!article)}
                  onClick={() => void save()}
                >
                  {!article
                    ? "Save draft"
                    : dirty
                      ? live
                        ? "Save changes to the live article"
                        : "Save"
                      : "Saved"}
                </button>
                <p className="text-xs text-muted">
                  {dirty
                    ? "You have unsaved words. Ctrl+S saves."
                    : "Ctrl+S saves."}
                </p>
              </>
            ) : null}

            {article ? (
              <Link
                href={`/journal/${article.slug}`}
                target="_blank"
                className="text-sm underline underline-offset-4"
              >
                {stage === "published"
                  ? "Open the published article"
                  : "Preview as a reader"}
              </Link>
            ) : null}

            {article?.mine &&
            (stage === "draft" || stage === "changes_requested") ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void step("/submit", null, "Sent for review.")
                }
              >
                Send for review
              </button>
            ) : null}

            {article?.can.review ? (
              panel === "changes" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const text = String(
                      new FormData(event.currentTarget).get("reviewNote"),
                    );
                    void step(
                      "/review",
                      { action: "changes", note: text.trim() },
                      "Sent back to the author.",
                    );
                  }}
                  className="flex flex-col gap-3"
                >
                  <Field id="reviewNote" label="What should change?">
                    <textarea
                      id="reviewNote"
                      name="reviewNote"
                      className="input"
                      rows={4}
                      required
                      minLength={10}
                      maxLength={1000}
                    />
                  </Field>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Send back to the author
                  </button>
                  <button
                    type="button"
                    className="text-sm text-muted underline underline-offset-4"
                    onClick={() => setPanel(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <p className="text-sm font-medium">This needs your review</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void step("/review", { action: "approve" }, "Approved.")
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setPanel("changes")}
                  >
                    Ask for changes
                  </button>
                </>
              )
            ) : null}

            {article?.can.publish && !live ? (
              panel === "schedule" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const when = String(
                      new FormData(event.currentTarget).get("publishAt"),
                    );
                    void step(
                      "/publish",
                      { publishAt: new Date(when).toISOString() },
                      "Scheduled.",
                    );
                  }}
                  className="flex flex-col gap-3"
                >
                  <Field
                    id="publishAt"
                    label="Publish on"
                    hint="In your own time zone."
                  >
                    <input
                      id="publishAt"
                      name="publishAt"
                      type="datetime-local"
                      className="input"
                      required
                    />
                  </Field>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    Schedule
                  </button>
                  <button
                    type="button"
                    className="text-sm text-muted underline underline-offset-4"
                    onClick={() => setPanel(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  {stage !== "approved" ? (
                    <p className="text-xs text-muted">
                      No second person has approved this. As an administrator
                      you can still publish it, and that is recorded.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void step("/publish", {}, "Published.")}
                  >
                    Publish now
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setPanel("schedule")}
                  >
                    Schedule for later
                  </button>
                </>
              )
            ) : null}

            {article?.can.manage && live ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    void step(
                      "/featured",
                      { featured: !article.featured },
                      article.featured
                        ? "No longer featured."
                        : "Featured at the top of the Journal.",
                    )
                  }
                >
                  {article.featured ? "Stop featuring" : "Feature at the top"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    void step("/unpublish", null, "Taken down. Readers cannot see it.")
                  }
                >
                  {stage === "scheduled" ? "Cancel the schedule" : "Take down"}
                </button>
              </>
            ) : null}

            {article?.can.manage ? (
              stage === "archived" ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    void step("/restore", null, "Brought back as a draft.")
                  }
                >
                  Bring back as a draft
                </button>
              ) : panel === "archive" ? (
                <span className="flex flex-col gap-2 text-sm">
                  Archive this article? Readers will no longer see it.
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void step("/archive", null, "Archived.")}
                  >
                    Yes, archive
                  </button>
                  <button
                    type="button"
                    className="text-muted underline underline-offset-4"
                    onClick={() => setPanel(null)}
                  >
                    Keep it
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="text-sm text-muted underline underline-offset-4"
                  onClick={() => setPanel("archive")}
                >
                  Archive
                </button>
              )
            ) : null}
          </section>

          <section className="flex flex-col gap-4">
            <Field id="categoryKey" label="Category">
              <select
                id="categoryKey"
                className="input"
                value={draft.categoryKey}
                disabled={!canEdit}
                onChange={(event) => set("categoryKey", event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="kind" label="Kind" hint={KIND_NOTES[draft.kind]}>
              <select
                id="kind"
                className="input"
                value={draft.kind}
                disabled={!canEdit}
                onChange={(event) => set("kind", event.target.value)}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="tags" label="Tags" hint="Up to 8, with commas between.">
              <input
                id="tags"
                className="input"
                value={draft.tags}
                disabled={!canEdit}
                placeholder="prayer, forgiveness"
                onChange={(event) => set("tags", event.target.value)}
              />
            </Field>
            <Field id="action" label="At the end of the article">
              <select
                id="action"
                className="input"
                value={draft.action}
                disabled={!canEdit}
                onChange={(event) => set("action", event.target.value)}
              >
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="seriesId" label="Series">
              <select
                id="seriesId"
                className="input"
                value={draft.seriesId}
                disabled={!canEdit}
                onChange={(event) => set("seriesId", event.target.value)}
              >
                <option value="">Not part of a series</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
            {draft.seriesId ? (
              <Field id="seriesPosition" label="Part number">
                <input
                  id="seriesPosition"
                  type="number"
                  className="input"
                  min={1}
                  max={999}
                  value={draft.seriesPosition}
                  disabled={!canEdit}
                  onChange={(event) => set("seriesPosition", event.target.value)}
                />
              </Field>
            ) : null}

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Cover picture</span>
              {draft.coverMediaId ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(draft.coverMediaId)}
                    alt={draft.coverAlt}
                    className="aspect-[16/9] w-full rounded-lg object-cover"
                  />
                  <input
                    id="coverAlt"
                    aria-label="Describe the picture"
                    className="input"
                    placeholder="Describe the picture for people who cannot see it"
                    value={draft.coverAlt}
                    disabled={!canEdit}
                    maxLength={200}
                    onChange={(event) => set("coverAlt", event.target.value)}
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      className="self-start text-sm text-muted underline underline-offset-4"
                      onClick={() => set("coverMediaId", null)}
                    >
                      Remove the picture
                    </button>
                  ) : null}
                </>
              ) : canEdit ? (
                <>
                  <input
                    ref={fileInput}
                    id="cover"
                    type="file"
                    className="input"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      void uploadCover(event.target.files?.[0])
                    }
                  />
                  <p className="text-xs text-muted">
                    JPG, PNG, or WebP, up to 5 MB. Use only pictures you have
                    the right to use, and none that show a person we helped.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">No picture.</p>
              )}
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                id="allowComments"
                type="checkbox"
                className="size-4"
                checked={draft.allowComments}
                disabled={!canEdit}
                onChange={(event) => set("allowComments", event.target.checked)}
              />
              Let readers comment
            </label>
          </section>
        </aside>
      </div>

      {article && stage === "published" ? (
        <>
          <section className="flex flex-col gap-3 border-t border-line pt-5">
            <h2 className="font-medium">Share it</h2>
            <ShareBar
              path={`/journal/${article.slug}`}
              title={article.title}
              summary={article.summary}
            />
          </section>
          <Stats articleId={article.id} />
        </>
      ) : null}

      {article && stage === "published" && article.can.edit ? (
        <Panel title="Corrections">
          <p className="text-sm text-muted">
            When you fix a mistake in a published article, say so here.
            Readers see corrections under the article.
          </p>
          {article.corrections.length > 0 ? (
            <ul className="flex flex-col text-sm">
              {article.corrections.map((correction) => (
                <li
                  key={correction.id}
                  className="border-t border-line py-2.5 first:border-t-0"
                >
                  <span className="text-muted">
                    {formatMoment(correction.at)}:
                  </span>{" "}
                  {correction.body}
                </li>
              ))}
            </ul>
          ) : null}
          {panel === "correction" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const body = String(
                  new FormData(event.currentTarget).get("correction"),
                );
                void step(
                  "/corrections",
                  { body: body.trim() },
                  "Correction added.",
                );
              }}
              className="flex max-w-2xl flex-col gap-3"
            >
              <Field id="correction" label="What was corrected?">
                <textarea
                  id="correction"
                  name="correction"
                  className="input"
                  rows={2}
                  placeholder="An earlier version gave the wrong verse number."
                  required
                  minLength={10}
                  maxLength={1000}
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Add correction
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setPanel(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div>
              <button
                type="button"
                className="btn btn-ghost px-4 py-2 text-sm"
                onClick={() => setPanel("correction")}
              >
                Add a correction
              </button>
            </div>
          )}
        </Panel>
      ) : null}

      {article && article.revisions.length > 0 ? (
        <Panel title="Earlier versions">
          <ul className="flex flex-col text-sm">
            {article.revisions.map((revision, i) => (
              <li
                key={revision.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-2.5 first:border-t-0"
              >
                <span>
                  {formatMoment(revision.at)} · {revision.by} ·{" "}
                  <span className="tabular-nums">{revision.words} words</span>
                  {revision.note ? (
                    <span className="text-muted"> · {revision.note}</span>
                  ) : null}
                  {i === 0 ? (
                    <span className="text-muted"> · current</span>
                  ) : null}
                </span>
                {i === 0 ? null : (
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => void openVersion(revision.id)}
                  >
                    Read this version
                  </button>
                )}
              </li>
            ))}
          </ul>
          {version ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  The version from {formatMoment(version.at)}
                </p>
                <span className="flex flex-wrap gap-3">
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-primary px-4 py-2 text-sm"
                      disabled={busy}
                      onClick={() => {
                        const id = version.id;
                        setVersion(null);
                        void step(
                          `/revisions/${id}/restore`,
                          null,
                          "Brought back. The words you replaced are kept as a version too.",
                        );
                      }}
                    >
                      Bring this version back
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost px-4 py-2 text-sm"
                    onClick={() => setVersion(null)}
                  >
                    Close
                  </button>
                </span>
              </div>
              <h3 className="font-serif text-2xl">{version.title}</h3>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6">
                {version.body}
              </pre>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* Shown so staff know who they are writing as. */}
      <p className="text-xs text-muted">
        Signed in as {user.fullName}. Your byline can be changed under Series,
        categories, byline.
      </p>
    </div>
  );
}
