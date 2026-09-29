import type { Metadata } from "next";
import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import { apiOrigin } from "@/lib/api-origin";
import { CURRENCY_NAMES, money, type Transparency } from "@/lib/giving";

export const metadata: Metadata = {
  title: "Where the money goes · Faceless Angels",
  description:
    "Every gift Faceless Angels receives, every cost of running it, and the help paid to people in need, shown in total.",
  alternates: { canonical: "/transparency" },
};

export const dynamic = "force-dynamic";

async function load(): Promise<Transparency | null> {
  try {
    const res = await fetch(`${apiOrigin()}/api/transparency`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Transparency) : null;
  } catch {
    return null;
  }
}

function monthName(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 border-t-2 border-ink pt-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-serif text-3xl tabular-nums">{value}</span>
      {note ? <span className="text-xs leading-5 text-muted">{note}</span> : null}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  currency,
  empty,
}: {
  title: string;
  rows: { category: string; label: string; total: number; entries: number }[];
  currency: string;
  empty: string;
}) {
  const total = rows.reduce((n, r) => n + r.total, 0);
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col text-sm">
          {rows.map((r) => (
            <li key={r.category} className="flex flex-col gap-1.5 border-b border-line py-2.5 last:border-b-0">
              <div className="flex justify-between gap-4">
                <span>{r.label}</span>
                <span className="font-medium tabular-nums">{money(r.total, currency)}</span>
              </div>
              <div aria-hidden className="h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gold-bright"
                  style={{ width: `${total ? Math.max(2, (r.total / total) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function TransparencyPage() {
  const data = await load();

  return (
    <PublicShell>
      <div className="flex max-w-2xl flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
          Transparency
        </p>
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">Where the money goes</h1>
        <p className="leading-7 text-muted">
          Every gift is recorded when the payment company confirms it. Every
          cost and every payment to help someone needs a receipt and a second
          person&apos;s approval before it appears here. We show totals only:
          no names, and no single gift with its time.
        </p>
      </div>

      {!data ? (
        <p className="text-muted">We could not load the figures. Try again in a moment.</p>
      ) : (
        <>
          {data.currencies.map((c) => {
            const maxMonth = Math.max(1, ...c.months.map((m) => Math.max(m.received, m.spent + m.helped)));
            return (
              <section
                key={c.currency}
                aria-labelledby={`cur-${c.currency}`}
                className="flex flex-col gap-8 rounded-2xl border border-line bg-surface p-6 sm:p-8"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id={`cur-${c.currency}`} className="font-serif text-2xl">
                    {CURRENCY_NAMES[c.currency]}
                  </h2>
                  {c.testMode ? (
                    <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-medium text-gold">
                      Test mode: not real money
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <Figure
                    label="Gifts received"
                    value={money(c.received, c.currency)}
                    note={`${c.gifts} ${c.gifts === 1 ? "gift" : "gifts"} from ${c.givers} ${c.givers === 1 ? "giver" : "givers"}${c.monthlyGivers ? `, ${c.monthlyGivers} giving monthly` : ""}`}
                  />
                  <Figure
                    label="Running costs"
                    value={money(c.spent + c.fees, c.currency)}
                    note={`Includes ${money(c.fees, c.currency)} in payment fees${c.feesPartlyUnknown ? ", some still being confirmed" : ""}`}
                  />
                  <Figure label="Help paid to people in need" value={money(c.helped, c.currency)} />
                  <Figure
                    label="Held for the work"
                    value={money(c.balance, c.currency)}
                    note={
                      c.balance < 0
                        ? "Costs so far are more than gifts received. The difference was paid from other funds."
                        : "Kept for the coming months' costs and help."
                    }
                  />
                </div>

                <section className="flex flex-col gap-3">
                  <h3 className="font-medium">The last twelve months</h3>
                  <div className="overflow-x-auto">
                    <div className="flex min-w-[36rem] items-end gap-2" role="img" aria-label={`Money in and out each month in ${CURRENCY_NAMES[c.currency]}`}>
                      {c.months.map((m) => (
                        <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                          <div className="flex h-32 w-full items-end justify-center gap-0.5">
                            <div
                              className="w-2.5 rounded-t bg-ink"
                              style={{ height: `${(m.received / maxMonth) * 100}%` }}
                              title={`In: ${money(m.received, c.currency)}`}
                            />
                            <div
                              className="w-2.5 rounded-t bg-gold-bright"
                              style={{ height: `${((m.spent + m.helped) / maxMonth) * 100}%` }}
                              title={`Out: ${money(m.spent + m.helped, c.currency)}`}
                            />
                          </div>
                          <span className="text-[11px] text-muted">{monthName(m.month)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="flex gap-5 text-xs text-muted">
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ink" /> In</span>
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-gold-bright" /> Out (costs and help)</span>
                  </p>
                </section>

                <div className="grid gap-10 border-t border-line pt-6 lg:grid-cols-2">
                  <Breakdown
                    title="Running costs by kind"
                    rows={c.expenses}
                    currency={c.currency}
                    empty="No approved costs yet."
                  />
                  <Breakdown
                    title="Help paid, by need"
                    rows={c.help}
                    currency={c.currency}
                    empty="No help has been paid from gifts yet."
                  />
                </div>
              </section>
            );
          })}

          <section className="flex flex-col gap-3 rounded-2xl border border-line p-6 sm:p-8">
            <h2 className="font-serif text-2xl">Promises from Angels</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted">
              Giving to a specific need is not open yet. Until it is, Angels
              pledge: a promise to give when it opens. No money has moved for
              these.
            </p>
            <p className="tabular-nums">
              <span className="font-serif text-3xl">{money(data.pledges.total, "usd")}</span>{" "}
              <span className="text-sm text-muted">
                pledged toward {data.pledges.needs} {data.pledges.needs === 1 ? "need" : "needs"} by{" "}
                {data.pledges.angels} {data.pledges.angels === 1 ? "Angel" : "Angels"}
              </span>
            </p>
          </section>

          <p className="text-sm text-muted">
            Figures as of{" "}
            {new Date(data.updatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}.{" "}
            <Link href="/donate" className="font-medium text-ink underline underline-offset-4">
              Support the work
            </Link>
          </p>
        </>
      )}
    </PublicShell>
  );
}
