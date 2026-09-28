"use client";

import { useOptionalUser } from "@/lib/session";
import AppShell from "./AppShell";

/** The site frame for pages anyone can read, rendered on the server. */
export default function PublicShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useOptionalUser();
  return (
    <AppShell user={user} visitorNav>
      {children}
    </AppShell>
  );
}
