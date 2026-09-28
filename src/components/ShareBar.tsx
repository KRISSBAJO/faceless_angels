"use client";

import { useEffect, useState } from "react";
import {
  CheckIcon,
  FacebookIcon,
  LinkedInIcon,
  LinkIcon,
  MailIcon,
  ShareIcon,
  WhatsAppIcon,
  XIcon,
} from "./ShareIcons";

// A round button holding one icon. The name is for screen readers and
// shows as a tooltip on hover.
const ROUND =
  "flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-ink hover:bg-ink hover:text-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";
const ICON = "size-4";

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
  stacked = false,
}: {
  /** The page's own address, like /journal/giving-in-secret. */
  path: string;
  title: string;
  summary?: string;
  /** When set, each share is counted for the article's numbers. */
  articleId?: string;
  label?: string;
  /** One link per line, for a side column. */
  stacked?: boolean;
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
  const places: [Channel, string, string, React.ReactNode][] = [
    [
      "whatsapp",
      "WhatsApp",
      `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
      <WhatsAppIcon key="i" className={ICON} />,
    ],
    [
      "facebook",
      "Facebook",
      `https://www.facebook.com/sharer/sharer.php?u=${link}`,
      <FacebookIcon key="i" className={ICON} />,
    ],
    [
      "x",
      "X",
      `https://x.com/intent/tweet?text=${text}&url=${link}`,
      <XIcon key="i" className={ICON} />,
    ],
    [
      "linkedin",
      "LinkedIn",
      `https://www.linkedin.com/sharing/share-offsite/?url=${link}`,
      <LinkedInIcon key="i" className={ICON} />,
    ],
    [
      "email",
      "Email",
      `mailto:?subject=${text}&body=${encodeURIComponent(
        `${summary ? `${summary}

` : ""}${url}`,
      )}`,
      <MailIcon key="i" className={ICON} />,
    ],
  ];

  return (
    <div
      role="group"
      aria-label={label}
      className={
        stacked
          ? "flex flex-col gap-3"
          : "flex flex-wrap items-center gap-x-4 gap-y-3"
      }
    >
      <span
        className={
          stacked
            ? "text-xs font-semibold uppercase tracking-[0.14em] text-muted"
            : "text-sm text-muted"
        }
      >
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {canShare ? (
          <button
            type="button"
            onClick={() => void shareOnDevice()}
            aria-label="Share with an app on this device"
            title="Share with an app"
            className={ROUND}
          >
            <ShareIcon className={ICON} />
          </button>
        ) : null}
        {places.map(([channel, name, href, icon]) => (
          <a
            key={channel}
            href={href}
            target={channel === "email" ? undefined : "_blank"}
            rel="noreferrer"
            onClick={() => count(channel)}
            aria-label={`Share on ${name}`}
            title={name}
            className={ROUND}
          >
            {icon}
          </a>
        ))}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Link copied" : "Copy the link"}
          title={copied ? "Copied" : "Copy link"}
          className={`${ROUND} ${
            copied ? "border-transparent bg-verified-soft text-verified" : ""
          }`}
        >
          {copied ? <CheckIcon className={ICON} /> : <LinkIcon className={ICON} />}
        </button>
      </div>
      <span
        role="status"
        className={copied ? "text-xs text-verified" : "sr-only"}
      >
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
