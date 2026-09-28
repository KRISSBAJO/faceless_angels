"use client";

import { useEffect, useState } from "react";

type Channel =
  | "device"
  | "whatsapp"
  | "facebook"
  | "x"
  | "linkedin"
  | "email"
  | "link";

/**
 * Buttons to share a public page. Each opens the other site's own share
 * screen with the link filled in. Nothing is posted for the reader.
 */
export default function ShareBar({
  path,
  title,
  summary,
  articleId,
  label = "Share",
}: {
  /** The page's own address, like /journal/giving-in-secret. */
  path: string;
  title: string;
  summary?: string;
  /** When set, each share is counted for the article's numbers. */
  articleId?: string;
  label?: string;
}) {
  const [url, setUrl] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  // The address is known only in the browser, where the origin is.
  useEffect(() => {
    const full = `${window.location.origin}${path}`;
    const native = typeof navigator.share === "function";
    queueMicrotask(() => {
      setUrl(full);
      setCanShare(native);
    });
  }, [path]);

  function count(channel: Channel) {
    if (!articleId) return;
    // keepalive lets the count finish while the page opens the other site.
    fetch(`/api/journal/articles/${articleId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
      keepalive: true,
    }).catch(() => undefined);
  }

  async function shareOnDevice() {
    try {
      await navigator.share({ title, text: summary, url });
      count("device");
    } catch {
      // The person closed the share sheet. Nothing to do.
    }
  }

  function copy() {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        count("link");
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => window.prompt("Copy this link:", url));
  }

  if (!url) return null;

  const text = encodeURIComponent(title);
  const link = encodeURIComponent(url);
  const places: [Channel, string, string][] = [
    ["whatsapp", "WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`],
    ["facebook", "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${link}`],
    ["x", "X", `https://x.com/intent/tweet?text=${text}&url=${link}`],
    ["linkedin", "LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${link}`],
    [
      "email",
      "Email",
      `mailto:?subject=${text}&body=${encodeURIComponent(
        `${summary ? `${summary}\n\n` : ""}${url}`,
      )}`,
    ],
  ];

  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
    >
      <span className="text-muted">{label}</span>
      {canShare ? (
        <button
          type="button"
          onClick={() => void shareOnDevice()}
          className="font-medium underline underline-offset-4"
        >
          Share…
        </button>
      ) : null}
      {places.map(([channel, name, href]) => (
        <a
          key={channel}
          href={href}
          target={channel === "email" ? undefined : "_blank"}
          rel="noreferrer"
          onClick={() => count(channel)}
          className="underline underline-offset-4 hover:text-ink"
        >
          {name}
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        className="underline underline-offset-4"
      >
        {copied ? "✓ Link copied" : "Copy link"}
      </button>
    </div>
  );
}
