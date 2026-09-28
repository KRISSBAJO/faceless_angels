"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "./api";

export const REVIEW_ROLES = ["reviewer", "senior_reviewer", "admin"];

export const ROLE_LABELS: Record<string, string> = {
  requester: "Requester",
  angel: "Angel",
  reviewer: "Case reviewer",
  senior_reviewer: "Senior reviewer",
  payment_approver: "Payment approver",
  editor: "Editor",
  prayer_team: "Prayer team",
  pastor: "Pastor",
  auditor: "Auditor",
  admin: "Administrator",
};

/** Where someone lands after sign-in, by what they are here to do. */
export function homeFor(user: User) {
  if (user.mustChangePassword) return "/account";
  if (user.role === "admin" || user.role === "auditor") return "/admin";
  if (REVIEW_ROLES.includes(user.role)) return "/review";
  if (user.role === "angel") return "/needs";
  if (user.role === "prayer_team" || user.role === "pastor") {
    return "/prayer/team";
  }
  if (user.role === "editor") return "/journal/studio";
  return "/requests";
}

/** Only same-site paths, so a crafted link cannot send someone elsewhere after sign-in. */
export function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : fallback;
}

/**
 * Loads the signed-in user. Sends visitors to sign in when there is none,
 * and to the account page while a temporary password is still in use.
 */
export function useRequiredUser() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    api<User>("/auth/me")
      .then((u) => {
        if (!active) return;
        if (u.mustChangePassword && pathname !== "/account") {
          router.replace("/account");
          return;
        }
        setUser(u);
      })
      .catch(() => {
        if (active) {
          router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
        }
      });
    return () => {
      active = false;
    };
  }, [router, pathname]);

  return user;
}

/** Loads the signed-in user if there is one. Never redirects. */
export function useOptionalUser() {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({
    user: null,
    ready: false,
  });

  useEffect(() => {
    let active = true;
    api<User>("/auth/me")
      .then((user) => active && setState({ user, ready: true }))
      .catch(() => active && setState({ user: null, ready: true }));
    return () => {
      active = false;
    };
  }, []);

  return state;
}

/** Reads the one-time token from the link's fragment, which is never sent to a server. */
export function useLinkToken() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // Set after mount: the fragment does not exist during server rendering.
    const value = window.location.hash.slice(1);
    queueMicrotask(() => setToken(value || null));
  }, []);
  return token;
}
