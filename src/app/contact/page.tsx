import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage, { contactEmail, organisations, PolicySection } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Contact · Faceless Angels",
  description: "How to reach Faceless Angels about a request, a gift, a refund, or your privacy.",
  alternates: { canonical: "/contact" },
};

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const orgs = await organisations();
  const email = contactEmail();
  return (
    <PolicyPage
      title="Contact"
      current="/contact"
      intro="We read every message. We usually reply within two working days."
    >
      <div className="rounded-lg border border-line bg-surface px-5 py-4 text-sm leading-6">
        <strong>In danger now?</strong> Faceless Angels is not an emergency
        service. Call 911 in the United States or 112 in Nigeria.
      </div>

      <PolicySection title="Write to us">
        {email ? (
          <p className="text-lg">
            <a href={`mailto:${email}`} className="font-medium underline underline-offset-4">{email}</a>
          </p>
        ) : (
          <p className="text-muted">Our contact email is being set up.</p>
        )}
        <ul>
          <li>About a gift or refund: include your receipt number, which starts with FA-R.</li>
          <li>About a request for help: include its reference, which starts with FA-, and sign in first if you can.</li>
          <li>About your information: say what you would like us to show, correct, or delete.</li>
        </ul>
      </PolicySection>

      {orgs.length > 0 ? (
        <PolicySection title="Our organisations">
          <div className="grid gap-4 sm:grid-cols-2">
            {orgs.map((o) => (
              <div key={o.currency} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {o.currency === "usd" ? "United States" : "Nigeria"}
                </span>
                <span className="font-medium">{o.legalName}</span>
                {o.address ? <span className="whitespace-pre-line text-muted">{o.address}</span> : null}
                {o.registrationNumber ? (
                  <span className="text-muted">
                    {o.registrationLabel}: {o.registrationNumber}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </PolicySection>
      ) : null}

      <PolicySection title="Our policies">
        <ul>
          <li><Link href="/privacy" className="underline underline-offset-4">Privacy</Link></li>
          <li><Link href="/terms" className="underline underline-offset-4">Terms of use</Link></li>
          <li><Link href="/giving-policy" className="underline underline-offset-4">Giving and refunds</Link></li>
        </ul>
      </PolicySection>
    </PolicyPage>
  );
}
