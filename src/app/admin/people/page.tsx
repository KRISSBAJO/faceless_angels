"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { FormError } from "@/components/Field";
import { api, errorMessage, type AdminUser } from "@/lib/api";
import { formatMoment } from "@/lib/format";
import { ROLE_LABELS, useRequiredUser } from "@/lib/session";

const IDENTITY_LABELS: Record<string, string> = {
  unverified: "No ID sent",
  pending: "ID waiting",
  verified: "ID confirmed",
  rejected: "ID not accepted",
};

export default function PeoplePage() {
  const user = useRequiredUser();
  const [people, setPeople] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingOff, setConfirmingOff] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("q", search.trim());
    if (role) query.set("role", role);
    return api<AdminUser[]>(`/admin/users?${query}`).then(setPeople);
  }, [search, role]);

  useEffect(() => {
    if (!user) return;
    // Wait for typing to pause before searching.
    const timer = setTimeout(() => {
      load().catch((err) => setError(errorMessage(err)));
    }, 250);
    return () => clearTimeout(timer);
  }, [user, load]);

  async function change(id: string, body: { role?: string; status?: string }) {
    setBusy(true);
    setError(null);
    setConfirmingOff(null);
    try {
      await api(`/admin/users/${id}`, { method: "PATCH", body });
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
      title="People"
      intro="Change what someone can do, or turn an account off. Turning an account off signs the person out at once and keeps their history."
    >
      <div className="flex max-w-2xl flex-wrap gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium">
          Search by name or email
          <input
            id="people-search"
            type="search"
            className="input font-normal"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Role
          <select
            id="people-role"
            className="input font-normal"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">Everyone</option>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <FormError message={error} />

      {people && people.length === 0 ? (
        <p className="text-muted">No one matches.</p>
      ) : null}

      {people && people.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-xs uppercase tracking-[0.08em] text-muted">
                <th className="py-2 pr-4 font-semibold">Person</th>
                <th className="py-2 pr-4 font-semibold">Role</th>
                <th className="py-2 pr-4 font-semibold">Checks</th>
                <th className="py-2 pr-4 font-semibold">Last sign-in</th>
                <th className="py-2 font-semibold">Account</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const isSelf = person.id === user.id;
                const off = person.status !== "active";
                return (
                  <tr
                    key={person.id}
                    className="border-b border-line align-top"
                  >
                    <td className="py-3 pr-4">
                      <span className={`font-medium ${off ? "text-muted" : ""}`}>
                        {person.fullName}
                        {isSelf ? " (you)" : ""}
                      </span>
                      <span className="block break-all text-muted">
                        {person.email}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {isSelf ? (
                        ROLE_LABELS[person.role]
                      ) : (
                        <select
                          id={`role-${person.id}`}
                          aria-label={`Role for ${person.fullName}`}
                          className="input py-1.5"
                          value={person.role}
                          disabled={busy}
                          onChange={(event) =>
                            void change(person.id, { role: event.target.value })
                          }
                        >
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {person.emailVerified
                        ? "Email confirmed"
                        : "Email not confirmed"}
                      <span className="block">
                        {IDENTITY_LABELS[person.identityStatus] ??
                          person.identityStatus}
                      </span>
                      {person.mustChangePassword ? (
                        <span className="block">Has a starting password</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {person.lastSignIn
                        ? formatMoment(person.lastSignIn)
                        : "Never"}
                    </td>
                    <td className="py-3">
                      {isSelf ? (
                        <span className="text-muted">On</span>
                      ) : off ? (
                        <button
                          type="button"
                          className="underline underline-offset-4"
                          disabled={busy}
                          onClick={() =>
                            void change(person.id, { status: "active" })
                          }
                        >
                          Off. Turn on
                        </button>
                      ) : confirmingOff === person.id ? (
                        <span className="flex flex-wrap gap-x-4 gap-y-1">
                          <button
                            type="button"
                            className="font-medium underline underline-offset-4"
                            disabled={busy}
                            onClick={() =>
                              void change(person.id, { status: "disabled" })
                            }
                          >
                            Yes, turn off
                          </button>
                          <button
                            type="button"
                            className="text-muted underline underline-offset-4"
                            onClick={() => setConfirmingOff(null)}
                          >
                            Keep on
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="underline underline-offset-4"
                          disabled={busy}
                          onClick={() => setConfirmingOff(person.id)}
                        >
                          On. Turn off
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminShell>
  );
}
