"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { TIMEZONES } from "@/lib/prayer";
import { Field, FormError } from "./Field";

interface Campaign {
  id: string;
  title: string;
  purpose: string;
  scripture: string | null;
  startsOn: string;
  endsOn: string;
  days: number;
  today: string;
  running: boolean;
  ended: boolean;
  takingPart: number;
  iJoined: boolean;
  myDays: string[];
}

interface Chain {
  id: string;
  title: string;
  purpose: string;
  startsAt: string;
  endsAt: string;
  slotMinutes: number;
  timezone: string;
  openTurns: number;
  slots: { start: string; people: string[]; mine: boolean; past: boolean }[];
}

function useAction(reload: () => Promise<unknown>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

function dayNumber(campaign: Campaign) {
  return (
    Math.round(
      (Date.parse(campaign.today) - Date.parse(campaign.startsOn)) / 86_400_000,
    ) + 1
  );
}

export function Campaigns({
  groupId,
  canLead,
}: {
  groupId: string;
  canLead: boolean;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adding, setAdding] = useState(false);
  const load = useCallback(
    () =>
      api<Campaign[]>(`/prayer/groups/${groupId}/campaigns`).then(setCampaigns),
    [groupId],
  );
  const { error, busy, run } = useAction(load);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <>
      {campaigns.length === 0 ? (
        <p className="text-sm text-muted">No campaign is running.</p>
      ) : (
        <ul className="flex flex-col">
          {campaigns.map((campaign) => {
            const prayedToday = campaign.myDays.includes(campaign.today);
            const base = `/prayer/campaigns/${campaign.id}`;
            return (
              <li
                key={campaign.id}
                className="flex flex-col gap-3 border-t border-line py-5 first:border-t-0"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{campaign.title}</span>
                  <span className="text-sm text-muted">
                    {formatDay(campaign.startsOn)} to{" "}
                    {formatDay(campaign.endsOn)} · {campaign.days} days
                    {campaign.running
                      ? ` · day ${dayNumber(campaign)} today`
                      : campaign.ended
                        ? " · ended"
                        : " · not started"}
                  </span>
                  <span className="whitespace-pre-wrap text-sm leading-6">
                    {campaign.purpose}
                  </span>
                  {campaign.scripture ? (
                    <span className="font-serif italic">
                      {campaign.scripture}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  {campaign.iJoined ? (
                    <>
                      {campaign.running ? (
                        <button
                          type="button"
                          aria-pressed={prayedToday}
                          disabled={busy}
                          className={`btn px-4 py-2 ${
                            prayedToday
                              ? "border-transparent bg-verified-soft text-verified"
                              : "btn-ghost"
                          }`}
                          onClick={() =>
                            void run(() =>
                              api(`${base}/today`, {
                                method: prayedToday ? "DELETE" : "PUT",
                              }),
                            )
                          }
                        >
                          {prayedToday ? "✓ You prayed today" : "I prayed today"}
                        </button>
                      ) : null}
                      <span className="text-muted">
                        {campaign.myDays.length === 0
                          ? "You are taking part."
                          : `You prayed on ${campaign.myDays.length} of ${campaign.days} days. Only you see this.`}
                      </span>
                      {campaign.ended ? null : (
                        <button
                          type="button"
                          className="underline underline-offset-4"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              api(`${base}/member`, { method: "DELETE" }),
                            )
                          }
                        >
                          Stop taking part
                        </button>
                      )}
                    </>
                  ) : campaign.ended ? null : (
                    <button
                      type="button"
                      className="btn btn-ghost px-4 py-2"
                      disabled={busy}
                      onClick={() =>
                        void run(() => api(`${base}/member`, { method: "PUT" }))
                      }
                    >
                      Take part
                    </button>
                  )}
                  <span className="text-muted">
                    {campaign.takingPart === 1
                      ? "1 member taking part"
                      : `${campaign.takingPart} members taking part`}
                  </span>
                  {canLead && !campaign.ended ? (
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      disabled={busy}
                      onClick={() =>
                        void run(() => api(`${base}/cancel`, { method: "POST" }))
                      }
                    >
                      Cancel campaign
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <FormError message={error} />

      {canLead ? (
        adding ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const text = (name: string) =>
                String(form.get(name) ?? "").trim();
              void run(() =>
                api(`/prayer/groups/${groupId}/campaigns`, {
                  body: {
                    title: text("title"),
                    purpose: text("purpose"),
                    scripture: text("scripture") || undefined,
                    startsOn: text("startsOn"),
                    days: Number(text("days")),
                  },
                }),
              ).then((ok) => ok && setAdding(false));
            }}
            className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2"
          >
            <Field id="campaign-title" label="Title">
              <input
                id="campaign-title"
                name="title"
                className="input"
                placeholder="21 days for our city"
                required
                minLength={3}
                maxLength={120}
              />
            </Field>
            <Field id="campaign-scripture" label="Scripture (optional)">
              <input
                id="campaign-scripture"
                name="scripture"
                className="input"
                placeholder="Jeremiah 29:7"
                maxLength={300}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field id="campaign-purpose" label="What you are praying for">
                <textarea
                  id="campaign-purpose"
                  name="purpose"
                  className="input"
                  rows={3}
                  required
                  minLength={10}
                  maxLength={1000}
                />
              </Field>
            </div>
            <Field id="campaign-start" label="First day">
              <input
                id="campaign-start"
                name="startsOn"
                type="date"
                className="input"
                required
              />
            </Field>
            <Field id="campaign-days" label="Number of days">
              <input
                id="campaign-days"
                name="days"
                type="number"
                className="input"
                defaultValue={21}
                min={1}
                max={100}
                required
              />
            </Field>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Start campaign
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAdding(true)}
            >
              Start a campaign
            </button>
          </div>
        )
      ) : null}
    </>
  );
}

function turnTime(iso: string, timezone: string, withDay: boolean) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: timezone,
    ...(withDay ? { weekday: "short" } : {}),
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Chains({
  groupId,
  canLead,
  timezone,
}: {
  groupId: string;
  canLead: boolean;
  timezone: string;
}) {
  const [chains, setChains] = useState<Chain[]>([]);
  const [adding, setAdding] = useState(false);
  const load = useCallback(
    () => api<Chain[]>(`/prayer/groups/${groupId}/chains`).then(setChains),
    [groupId],
  );
  const { error, busy, run } = useAction(load);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <>
      {chains.length === 0 ? (
        <p className="text-sm text-muted">No prayer chain is planned.</p>
      ) : (
        <ul className="flex flex-col gap-8">
          {chains.map((chain) => {
            const zone = new Date(chain.startsAt).toLocaleString("en-US", {
              timeZone: chain.timezone,
              timeZoneName: "short",
              hour: "numeric",
            });
            return (
              <li key={chain.id} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{chain.title}</span>
                  <span className="text-sm text-muted">
                    {turnTime(chain.startsAt, chain.timezone, true)} to{" "}
                    {turnTime(chain.endsAt, chain.timezone, true)}{" "}
                    {zone.split(" ").at(-1)} · turns of {chain.slotMinutes}{" "}
                    minutes ·{" "}
                    {chain.openTurns === 0
                      ? "every turn is covered"
                      : chain.openTurns === 1
                        ? "1 turn still open"
                        : `${chain.openTurns} turns still open`}
                  </span>
                  <span className="whitespace-pre-wrap text-sm leading-6">
                    {chain.purpose}
                  </span>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {chain.slots.map((slot) => (
                    <li key={slot.start}>
                      <button
                        type="button"
                        aria-pressed={slot.mine}
                        disabled={busy || (slot.past && !slot.mine)}
                        onClick={() =>
                          void run(() =>
                            slot.mine
                              ? api(`/prayer/chains/${chain.id}/turn/release`, {
                                  body: { slotStart: slot.start },
                                })
                              : api(`/prayer/chains/${chain.id}/turn`, {
                                  method: "PUT",
                                  body: { slotStart: slot.start },
                                }),
                          )
                        }
                        className={`flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          slot.mine
                            ? "border-transparent bg-verified-soft"
                            : slot.people.length === 0
                              ? "border-gold-bright bg-gold-soft"
                              : "border-line hover:border-muted"
                        }`}
                      >
                        <span className="font-medium tabular-nums">
                          {turnTime(slot.start, chain.timezone, true)}
                        </span>
                        <span className="text-muted">
                          {slot.people.length === 0
                            ? slot.past
                              ? "No one"
                              : "Open. Take this turn"
                            : slot.people.join(", ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted">
                  Choose a turn to take it. Choose your own turn again to
                  give it back. You get an email 15 minutes before.
                </p>
                {canLead ? (
                  <div>
                    <button
                      type="button"
                      className="text-sm underline underline-offset-4"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api(`/prayer/chains/${chain.id}/cancel`, {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      Cancel chain
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <FormError message={error} />

      {canLead ? (
        adding ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const text = (name: string) =>
                String(form.get(name) ?? "").trim();
              void run(() =>
                api(`/prayer/groups/${groupId}/chains`, {
                  body: {
                    title: text("title"),
                    purpose: text("purpose"),
                    startsLocal: text("startsLocal"),
                    hours: Number(text("hours")),
                    slotMinutes: Number(text("slotMinutes")),
                    timezone: text("timezone"),
                  },
                }),
              ).then((ok) => ok && setAdding(false));
            }}
            className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2"
          >
            <Field id="chain-title" label="Title">
              <input
                id="chain-title"
                name="title"
                className="input"
                placeholder="Night of prayer"
                required
                minLength={3}
                maxLength={120}
              />
            </Field>
            <Field id="chain-start" label="Starts">
              <input
                id="chain-start"
                name="startsLocal"
                type="datetime-local"
                className="input"
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Field id="chain-purpose" label="What you are praying for">
                <textarea
                  id="chain-purpose"
                  name="purpose"
                  className="input"
                  rows={3}
                  required
                  minLength={10}
                  maxLength={1000}
                />
              </Field>
            </div>
            <Field id="chain-hours" label="How long">
              <select id="chain-hours" name="hours" className="input">
                <option value="3">3 hours</option>
                <option value="6">6 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="72">3 days</option>
                <option value="168">7 days</option>
              </select>
            </Field>
            <Field id="chain-slot" label="Each turn lasts">
              <select
                id="chain-slot"
                name="slotMinutes"
                className="input"
                defaultValue="30"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </Field>
            <Field id="chain-timezone" label="Time zone">
              <select
                id="chain-timezone"
                name="timezone"
                className="input"
                defaultValue={timezone}
              >
                {TIMEZONES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Plan the chain
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAdding(true)}
            >
              Plan a prayer chain
            </button>
          </div>
        )
      ) : null}
    </>
  );
}
