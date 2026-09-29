import type { Metadata } from "next";
import Link from "next/link";
import DonateForm from "@/components/DonateForm";
import PublicShell from "@/components/PublicShell";

export const metadata: Metadata = {
  title: "Support Faceless Angels",
  description:
    "Give once or every month to keep Faceless Angels running: checking requests, keeping documents safe, and serving the prayer network.",
  alternates: { canonical: "/donate" },
};

const USES = [
  ["Checking every request", "Reviewers, identity checks, and confirming bills with providers."],
  ["Keeping people safe", "Encrypted storage for bills and IDs, and careful moderation."],
  ["Serving the prayer network", "Groups, live prayer, and the Journal, free for everyone."],
];

export default async function DonatePage({ searchParams }: PageProps<"/donate">) {
  const cancelled = (await searchParams).cancelled === "1";
  return (
    <PublicShell>
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
            Support the work
          </p>
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
            Keep Faceless Angels running
          </h1>
          <p className="max-w-[34rem] leading-7 text-muted">
            A free-will gift, once or every month. It pays for what it takes to
            help people safely and quietly. It does not go to a specific need.
          </p>
          <ul className="flex flex-col border-t border-line">
            {USES.map(([title, body]) => (
              <li key={title} className="flex flex-col gap-1 border-b border-line py-4">
                <span className="font-medium">{title}</span>
                <span className="text-sm leading-6 text-muted">{body}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-6 text-muted">
            Every gift, cost, and payment is recorded and shown in total on{" "}
            <Link href="/transparency" className="font-medium text-ink underline underline-offset-4">
              Where the money goes
            </Link>
            . Your name is never shown.
          </p>
        </div>
        <DonateForm cancelled={cancelled} />
      </div>
    </PublicShell>
  );
}
