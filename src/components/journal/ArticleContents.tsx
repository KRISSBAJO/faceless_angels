"use client";

import { useEffect, useState } from "react";

type Heading = { id: string; text: string };

/** Follows which section is being read, by the last heading passed. */
function useCurrent(headings: Heading[]) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (headings.length === 0) return;
    function update() {
      let found: string | null = null;
      for (const { id } of headings) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 140) found = id;
      }
      setCurrent(found);
    }
    const frame = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, [headings]);
  return current;
}

function List({ headings, current }: { headings: Heading[]; current?: string | null }) {
  return (
    <ol className="flex flex-col border-l border-line text-sm">
      {headings.map((h) => {
        const active = h.id === current;
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={active ? "location" : undefined}
              className={`-ml-px block border-l-2 py-1.5 pl-4 leading-snug transition-colors ${
                active
                  ? "border-gold-bright font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** The article's sections, beside the text on wide screens. */
export function ContentsRail({ headings }: { headings: Heading[] }) {
  const current = useCurrent(headings);
  if (headings.length < 2) return null;
  return (
    <nav
      aria-label="In this article"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        In this article
      </p>
      <List headings={headings} current={current} />
    </nav>
  );
}

/** The same list, folded above the text on narrow screens. */
export function ContentsFolded({ headings }: { headings: Heading[] }) {
  if (headings.length < 2) return null;
  return (
    <details className="group rounded-xl border border-line bg-surface px-5 py-4 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        In this article
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="pt-4">
        <List headings={headings} />
      </div>
    </details>
  );
}

/** A thin line across the top that fills as the article is read. */
export function ReadingProgress({ target }: { target: string }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    function update() {
      const el = document.getElementById(target);
      if (!el) return;
      const box = el.getBoundingClientRect();
      const span = box.height - window.innerHeight;
      const done = span <= 0 ? (box.top <= 0 ? 1 : 0) : -box.top / span;
      setProgress(Math.min(1, Math.max(0, done)));
    }
    const frame = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [target]);
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gold-bright"
      style={{ transform: `scaleX(${progress})` }}
    />
  );
}
