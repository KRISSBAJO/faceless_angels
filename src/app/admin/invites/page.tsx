"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Field, FormError } from "@/components/Field";
import { api, errorMessage, type Invite, type NewInvite } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import { ROLE_LABELS, useRequiredUser } from "@/lib/session";

const ROLE_NOTES: Record<string, string> = {
  reviewer: "Reviews requests and IDs, and approves or declines.",
  senior_reviewer:
    "Same as a case reviewer today. Meant for larger or disputed requests.",
  auditor: "Reads the audit log and the overview. Cannot change anything.",
  admin: "Manages people, invitations, need types, and wording.",
  payment_approver: "No screens yet. Will authorize payments.",
  editor:
    "Approves what is shared on the prayer network. Will also publish the Journal.",
  prayer_team: "Reads requests sent to the prayer team, and prays.",
  pastor:
    "Reads requests sent to the prayer team, approves what is shared, and approves new prayer groups.",
  angel: "No screens yet. Will fund approved requests.",
  requester: "Asks for help. People can also sign up for this on their own.",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  accepted: "Accepted",
  cancelled: "Cancelled",
  expired: "Expired",
};

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <input
        id="invite-link"
        aria-label="Invitation link"
        className="input font-mono text-sm"
        readOnly
        value={link}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            navigator.clipboard
              .writeText(link)
              .then(() => setCopied(true))
              .catch(() => document.getElementById("invite-link")?.focus());
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

export default function InvitesPage() {
  const user = useRequiredUser();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [created, setCreated] = useState<NewInvite | null>(null);
  const [role, setRole] = useState("reviewer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api<Invite[]>("/admin/invites").then(setInvites),
    [],
  );

  useEffect(() => {
    if (!user) return;
    load().catch((err) => setError(errorMessage(err)));
  }, [user, load]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const email = String(new FormData(formEl).get("email")).trim();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      setCreated(
        await api<NewInvite>("/admin/invites", { body: { email, role } }),
      );
      formEl.reset();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/invites/${id}/revoke`, { method: "POST" });
      if (created?.id === id) setCreated(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <AdminShell
      user={user}
      title="Invitations"
      intro="Staff cannot sign themselves up. Invite them here. They get a link that works once, for 7 days, and they choose their own password."
    >
      <form
        onSubmit={onSubmit}
        className="flex max-w-2xl flex-col gap-5 rounded-xl border border-line bg-surface p-6"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="email" label="Email">
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              autoComplete="off"
              required
            />
          </Field>
          <Field id="role" label="Role">
            <select
              id="role"
              className="input"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-sm leading-6 text-muted">{ROLE_NOTES[role]}</p>
        <FormError message={error} />
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Send invitation
          </button>
        </div>
      </form>

      {created ? (
        <section
          role="status"
          className="flex max-w-2xl flex-col gap-3 rounded-xl border border-gold-bright bg-gold-soft p-6"
        >
          <h2 className="font-serif text-2xl">
            {created.emailSent
              ? `Invitation sent to ${created.email}`
              : `Invitation made for ${created.email}`}
          </h2>
          <p className="text-sm leading-6">
            {created.emailSent
              ? "You can also pass the link on yourself. It is shown only this once."
              : "The email could not be sent. Pass this link on yourself. It is shown only this once."}
          </p>
          <CopyLink link={created.link} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-2xl">Sent invitations</h2>
        {invites && invites.length === 0 ? (
          <p className="text-sm text-muted">No invitations yet.</p>
        ) : null}
        {invites && invites.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-ink text-xs uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 pr-4 font-semibold">Role</th>
                  <th className="py-2 pr-4 font-semibold">Sent</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-b border-line">
                    <td className="break-all py-3 pr-4 font-medium">
                      {invite.email}
                    </td>
                    <td className="py-3 pr-4">
                      {ROLE_LABELS[invite.role] ?? invite.role}
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {formatMoment(invite.createdAt)}
                      {invite.invitedBy ? (
                        <span className="block">by {invite.invitedBy}</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      {STATUS_LABELS[invite.status] ?? invite.status}
                      {invite.status === "pending" ? (
                        <span className="block text-muted">
                          until {formatMoment(invite.expiresAt)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3">
                      {invite.status === "pending" ? (
                        <button
                          type="button"
                          className="underline underline-offset-4"
                          disabled={busy}
                          onClick={() => void cancel(invite.id)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </AdminShell>
  );
}
