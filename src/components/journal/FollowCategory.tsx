"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage, type User } from "@/lib/api";
import type { Library } from "@/lib/journal";

/** Asks for an email when something new is published in a category. */
export default function FollowCategory({
  category,
}: {
  category: { key: string; label: string };
}) {
  const [user, setUser] = useState<User | null>(null);
  const [following, setFollowing] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<User>("/auth/me")
      .then(async (me) => {
        const library = await api<Library>("/journal/library");
        if (!active) return;
        setUser(me);
        setFollowing(library.follows.some((f) => f.key === category.key));
      })
      .catch(() => undefined)
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [category.key]);

  if (!ready) return null;

  if (!user) {
    return (
      <Link
        href={`/sign-up?next=${encodeURIComponent(`/journal/category/${category.key}`)}`}
        className="btn btn-ghost"
      >
        Email me new {category.label}
      </Link>
    );
  }

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/journal/categories/${category.key}/follow`, {
        method: following ? "DELETE" : "PUT",
      });
      setFollowing(!following);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        aria-pressed={following}
        disabled={busy}
        onClick={toggle}
        className={`btn ${
          following
            ? "border-transparent bg-verified-soft text-verified"
            : "btn-ghost"
        }`}
      >
        {following
          ? `✓ Emailing you new ${category.label}`
          : `Email me new ${category.label}`}
      </button>
      {message ? (
        <p role="alert" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
