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
    <AppShell user={user} verificationMessage="Confirm your email before you start a prayer group.">
      <div className="max-w-3xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Prayer groups</p>
        <h1 className="font-serif text-4xl sm:text-5xl">Start a prayer group</h1>
        <p className="max-w-2xl leading-7 text-muted">
          Bring people together to pray regularly. Tell us about the group, how it meets, and who can join. A moderator will review your request and email you when it is approved.
        </p>
      </div>
      {about ? (
        <GroupForm
          codeOfConduct={about.codeOfConduct}
          submitLabel="Send for approval"
          error={error}
          busy={busy || !user.emailVerified}
          disabledReason={!user.emailVerified ? "Confirm your email with the link we sent before you can send this group for approval." : undefined}
          onSubmit={create}
        />
      ) : null}
    </AppShell>
  );
}
