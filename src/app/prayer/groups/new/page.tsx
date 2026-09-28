"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import GroupForm, { type GroupValues } from "@/components/GroupForm";
import { api, errorMessage } from "@/lib/api";
import type { PrayerAbout } from "@/lib/prayer";
import { useRequiredUser } from "@/lib/session";

export default function NewGroupPage() {
  const user = useRequiredUser();
  const router = useRouter();
  const [about, setAbout] = useState<PrayerAbout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<PrayerAbout>("/prayer/about")
      .then((a) => active && setAbout(a))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  async function create(values: GroupValues) {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/prayer/groups", {
        body: { ...values, acceptLeaderDuties: true },
      });
      router.push(`/prayer/groups/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!user) return <AppShell>{null}</AppShell>;

  return (
    <AppShell user={user}>
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-serif text-4xl sm:text-5xl">Start a prayer group</h1>
        <p className="leading-7 text-muted">
          A moderator looks at each new group before it opens. We will email
          you when yours is approved.
        </p>
      </div>
      {user.emailVerified ? null : (
        <p className="max-w-2xl rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-6">
          Confirm your email before you start a group. Use the link we sent
          you, or the button at the top of the page.
        </p>
      )}
      {about ? (
        <GroupForm
          codeOfConduct={about.codeOfConduct}
          submitLabel="Send for approval"
          error={error}
          busy={busy || !user.emailVerified}
          onSubmit={create}
        />
      ) : null}
    </AppShell>
  );
}
