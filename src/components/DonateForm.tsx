"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import {
  CURRENCY_NAMES,
  money,
  PROVIDER_NAMES,
  type Currency,
  type GivingOption,
} from "@/lib/giving";
import { useOptionalUser } from "@/lib/session";

export default function DonateForm({ cancelled }: { cancelled: boolean }) {
  const { user, ready } = useOptionalUser();
  const [options, setOptions] = useState<GivingOption[] | null>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [kind, setKind] = useState<"one_time" | "monthly">("one_time");
  const [preset, setPreset] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ options: GivingOption[] }>("/giving/options")
      .then(({ options: list }) => {
        if (!active) return;
        setOptions(list);
        if (list[0]) {
          setCurrency(list[0].currency);
          setPreset(list[0].presets[1] ?? list[0].presets[0]);
        }
      })
      .catch(() => active && setOptions([]));
    return () => {
      active = false;
    };
  }, []);

  const option = options?.find((o) => o.currency === currency) ?? null;
  const amount = custom.trim() ? Number(custom) : preset;

  function chooseCurrency(next: Currency) {
    const o = options?.find((x) => x.currency === next);
    setCurrency(next);
    setCustom("");
    setPreset(o ? (o.presets[1] ?? o.presets[0]) : null);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!option) return;
    if (!amount || !Number.isFinite(amount)) {
      setError("Choose or enter an amount.");
      return;
    }
    if (amount < option.min || amount > option.max) {
      setError(
        `Give between ${money(option.min, option.currency)} and ${money(option.max, option.currency)}.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/giving/checkout", {
        body: {
          currency: option.currency,
          kind,
          amount,
          email: user?.email ?? email,
        },
      });
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (options === null || !ready) {
    return <p className="text-sm text-muted">Getting the giving options…</p>;
  }

  if (options.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="font-serif text-2xl">Giving opens soon</h2>
        <p className="leading-7 text-muted">
          We are setting up giving in US dollars and naira. Until then you can
          pray with us, or{" "}
          <Link href="/needs" className="underline underline-offset-4">
            pledge toward an open need
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-7 rounded-2xl border border-line bg-surface p-6 sm:p-8"
      noValidate
    >
      {cancelled ? (
        <p role="status" className="rounded-lg border border-line px-4 py-3 text-sm">
          You left the payment page. Nothing was charged.
        </p>
      ) : null}

      {option?.testMode ? (
        <p className="rounded-lg border border-gold-bright bg-gold-soft px-4 py-3 text-sm leading-6">
          <strong>Test mode.</strong> Giving is being set up. Payments here use{" "}
          {PROVIDER_NAMES[option.provider]}&apos;s test system and no real money
          moves.
        </p>
      ) : null}

      {options.length > 1 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-medium">Currency</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((o) => (
              <label
                key={o.currency}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border px-4 py-3 ${
                  currency === o.currency ? "border-ink" : "border-line hover:border-muted"
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="currency"
                    checked={currency === o.currency}
                    onChange={() => chooseCurrency(o.currency)}
                  />
                  {CURRENCY_NAMES[o.currency]}
                </span>
                <span className="pl-6 text-sm text-muted">
                  Card payment through {PROVIDER_NAMES[o.provider]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium">How often</legend>
        <div className="inline-flex self-start rounded-full border border-line p-1">
          {(
            [
              ["one_time", "Once"],
              ["monthly", "Every month"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                kind === value ? "bg-ink text-surface" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {option ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-medium">
            Amount{kind === "monthly" ? " each month" : ""}
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {option.presets.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={!custom && preset === p}
                onClick={() => {
                  setPreset(p);
                  setCustom("");
                  setError(null);
                }}
                className={`rounded-xl border px-3 py-3 font-medium tabular-nums transition-colors ${
                  !custom && preset === p
                    ? "border-ink bg-ink text-surface"
                    : "border-line hover:border-ink"
                }`}
              >
                {money(p, option.currency)}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Or another amount</span>
            <input
              className="input max-w-xs tabular-nums"
              inputMode="decimal"
              placeholder={option.currency === "ngn" ? "15000" : "40"}
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value.replace(/[^0-9.]/g, ""));
                setError(null);
              }}
              aria-label="Another amount"
            />
          </label>
        </fieldset>
      ) : null}

      {user ? (
        <p className="text-sm text-muted">
          Your receipt goes to {user.email}.
        </p>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email for your receipt
          <input
            className="input max-w-md font-normal"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
      )}

      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <button type="submit" className="btn btn-primary self-start" disabled={busy}>
          {busy
            ? "Opening the payment page…"
            : amount && option
              ? `Give ${money(amount, option.currency)}${kind === "monthly" ? " a month" : ""}`
              : "Give"}
        </button>
        <p className="text-xs leading-5 text-muted">
          You will pay on {option ? PROVIDER_NAMES[option.provider] : "the payment company"}
          &apos;s secure page. Your card details never reach Faceless Angels.
          {kind === "monthly" ? " You can stop a monthly gift at any time from My giving." : ""}{" "}
          By giving you agree to the{" "}
          <Link href="/giving-policy" className="underline underline-offset-4">giving and refund policy</Link>.
        </p>
      </div>
    </form>
  );
}
