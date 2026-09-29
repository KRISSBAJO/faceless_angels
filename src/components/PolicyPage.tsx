import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import { apiOrigin } from "@/lib/api-origin";

/** Until counsel has reviewed them, the policies say so at the top. */
export const POLICIES_REVIEWED = false;
export const POLICIES_UPDATED = "September 29, 2026";

export interface Organisation {
  currency: "usd" | "ngn";
  legalName: string;
  address: string;
  registrationLabel: string;
  registrationNumber: string;
}

export async function organisations(): Promise<Organisation[]> {
  try {
    const res = await fetch(`${apiOrigin()}/api/giving/organisations`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Organisation[]) : [];
  } catch {
    return [];
  }
}

export function contactEmail() {
  return process.env.CONTACT_EMAIL?.trim() || null;
}

/** "Faceless Angels Inc. (United States) and …", or the plain name. */
export function whoWeAre(orgs: Organisation[]) {
  if (orgs.length === 0) return "Faceless Angels";
  return orgs
    .map((o) => `${o.legalName} (${o.currency === "usd" ? "United States" : "Nigeria"})`)
    .join(" and ");
}

const POLICIES: [string, string][] = [
  ["/privacy", "Privacy"],
  ["/terms", "Terms of use"],
  ["/giving-policy", "Giving and refunds"],
  ["/contact", "Contact"],
];

export function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="flex flex-col gap-3 leading-7 text-ink/90 [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </section>
  );
}

export default function PolicyPage({
  title,
  intro,
  current,
  children,
}: {
  title: string;
  intro: string;
  current: string;
  children: React.ReactNode;
}) {
  return (
    <PublicShell>
      <div className="grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Policies" className="flex flex-row flex-wrap gap-x-5 gap-y-2 text-sm lg:flex-col">
          {POLICIES.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={href === current ? "page" : undefined}
              className={href === current ? "font-medium text-ink" : "text-muted hover:text-ink"}
            >
              {label}
            </Link>
          ))}
        </nav>
        <article className="flex max-w-3xl flex-col gap-8">
          <header className="flex flex-col gap-3">
            <h1 className="font-serif text-4xl leading-tight sm:text-5xl">{title}</h1>
            <p className="text-lg leading-8 text-muted">{intro}</p>
            <p className="text-sm text-muted">Last updated {POLICIES_UPDATED}</p>
            {POLICIES_REVIEWED ? null : (
              <p className="rounded-lg border border-gold-bright bg-gold-soft px-4 py-3 text-sm leading-6">
                This page is being reviewed by our legal advisers and may
                change before Faceless Angels opens to the public.
              </p>
            )}
          </header>
          {children}
        </article>
      </div>
    </PublicShell>
  );
}
