"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/Field";
import StudioShell, { JOURNAL_STAFF } from "@/components/journal/StudioShell";
import { api, errorMessage } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import { STAGE_LABELS, type Desk, type StudioArticle } from "@/lib/journal";
import { useRequiredUser } from "@/lib/session";

type Row = Omit<StudioArticle, "body">;

const STAGES = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "archived",
];

export default function StudioPage() {
  const user = useRequiredUser();
  const [desk, setDesk] = useState<Desk | null>(null);
  const [articles, setArticles] = useState<Row[] | null>(null);
  const [filters, setFilters] = useState({ stage: "", mine: "", q: "" });
  const [error, setError] = useState<string | null>(null);
  const staff = !!user && JOURNAL_STAFF.includes(user.role);

  useEffect(() => {
    if (!staff) return;
    api<Desk>("/journal/studio/desk")
      .then(setDesk)
      .catch((err) => setError(errorMessage(err)));
  }, [staff]);

  useEffect(() => {
    if (!staff) return;
    // Wait for typing to pause before searching.
    const timer = setTimeout(() => {
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value),
      );
      api<Row[]>(`/journal/studio/articles?${query}`)
        .then(setArticles)
        .catch((err) => setError(errorMessage(err)));
    }, 250);
    return () => clearTimeout(timer);
  }, [staff, filters]);

  if (!user) return null;

  return (
    <StudioShell
      user={user}
      title="Studio"
      intro="Write, review, and publish the Journal. An article is published after a second person approves it."
      action={
        <Link href="/journal/studio/new" className="btn btn-primary">
          Write an article
        </Link>
      }
    >
      <FormError message={error} />

      {desk ? (
        <section
          aria-label="At a glance"
          className="grid gap-x-10 gap-y-6 md:grid-cols-2"
        >
          <ul className="flex flex-col text-sm">
            <li className="flex justify-between gap-4 border-t border-line py-3 first:border-t-0">
              <span>
                <strong className="tabular-nums">{desk.waitingForYou}</strong>{" "}
                {desk.waitingForYou === 1 ? "article waits" : "articles wait"}{" "}
                for your review
              </span>
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() =>
                  setFilters({ stage: "in_review", mine: "", q: "" })
                }
              >
                Show
              </button>
            </li>
            <li className="flex justify-between gap-4 border-t border-line py-3">
              <span>
                <strong className="tabular-nums">{desk.commentsToCheck}</strong>{" "}
                {desk.commentsToCheck === 1 ? "comment" : "comments"} to check
              </span>
              <Link
                href="/journal/studio/comments"
                className="underline underline-offset-4"
              >
                Open
              </Link>
            </li>
            <li className="flex justify-between gap-4 border-t border-line py-3">
              <span>
                <strong className="tabular-nums">
                  {desk.stages.published ?? 0}
                </strong>{" "}
                published,{" "}
                <strong className="tabular-nums">
                  {desk.stages.scheduled ?? 0}
                </strong>{" "}
                scheduled,{" "}
                <strong className="tabular-nums">
                  {desk.stages.draft ?? 0}
                </strong>{" "}
                in draft
              </span>
            </li>
          </ul>
          <div className="flex flex-col gap-2">
            <h2 className="font-medium">Most read in the last 30 days</h2>
            {desk.mostRead.length === 0 ? (
              <p className="text-sm text-muted">No one has read anything yet.</p>
            ) : (
              <ol className="flex flex-col text-sm">
                {desk.mostRead.map((article) => (
                  <li
                    key={article.slug}
                    className="flex justify-between gap-4 border-t border-line py-2.5 first:border-t-0"
                  >
                    <Link
                      href={`/journal/${article.slug}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {article.title}
                    </Link>
                    <span className="text-muted tabular-nums">
                      {article.views} {article.views === 1 ? "view" : "views"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-6">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium">
          Find by title
          <input
            id="studio-search"
            type="search"
            className="input font-normal"
            value={filters.q}
            onChange={(event) =>
              setFilters({ ...filters, q: event.target.value })
            }
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Stage
          <select
            id="studio-stage"
            className="input font-normal"
            value={filters.stage}
            onChange={(event) =>
              setFilters({ ...filters, stage: event.target.value })
            }
          >
            <option value="">Every stage</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Written by
          <select
            id="studio-mine"
            className="input font-normal"
            value={filters.mine}
            onChange={(event) =>
              setFilters({ ...filters, mine: event.target.value })
            }
          >
            <option value="">Anyone</option>
            <option value="yes">Me</option>
          </select>
        </label>
      </div>

      {articles && articles.length === 0 ? (
        <p className="text-muted">No articles match.</p>
      ) : null}

      {articles && articles.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-xs uppercase tracking-[0.08em] text-muted">
                <th className="py-2 pr-4 font-semibold">Article</th>
                <th className="py-2 pr-4 font-semibold">Author</th>
                <th className="py-2 pr-4 font-semibold">Stage</th>
                <th className="py-2 font-semibold">Last changed</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr key={article.id} className="border-b border-line align-top">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/journal/studio/${article.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {article.title}
                    </Link>
                    <span className="block text-muted">
                      {article.category.label}
                      {article.featured ? " · Featured" : ""}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {article.mine ? "You" : article.author.name}
                  </td>
                  <td className="py-3 pr-4">
                    {STAGE_LABELS[article.stage] ?? article.stage}
                    {article.stage === "scheduled" && article.publishedAt ? (
                      <span className="block text-muted">
                        for {formatMoment(article.publishedAt)}
                      </span>
                    ) : null}
                    {article.can.review ? (
                      <span className="block font-medium">
                        Needs your review
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 text-muted">
                    {formatMoment(article.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </StudioShell>
  );
}
