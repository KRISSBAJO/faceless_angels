import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage, { organisations, PolicySection, whoWeAre } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Terms of use · Faceless Angels",
  description: "The agreement between you and Faceless Angels when you use the site.",
  alternates: { canonical: "/terms" },
};

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const orgs = await organisations();
  return (
    <PolicyPage
      title="Terms of use"
      current="/terms"
      intro="These terms are the agreement between you and Faceless Angels when you use the site. By creating an account, asking for help, praying, or giving, you agree to them."
    >
      <PolicySection title="Who we are">
        <p>Faceless Angels is run by {whoWeAre(orgs)}.</p>
      </PolicySection>

      <PolicySection title="Your account">
        <ul>
          <li>You must be 18 or older.</li>
          <li>One person, one account. Keep your password to yourself.</li>
          <li>Tell the truth about who you are. We may ask to see an identity document before you ask for help or give to a need.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Asking for help">
        <ul>
          <li>Your request must be true, and your documents must be real and current.</li>
          <li>Asking does not guarantee help. A reviewer decides, and explains the decision. You may appeal.</li>
          <li>When a need is met, we pay the provider, such as the landlord or utility, not you, except where we say otherwise.</li>
          <li>A false request, an altered document, or a duplicate account ends your use of the site and may be reported.</li>
          <li>Help never depends on your faith, church membership, or giving a testimony.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Prayer and community">
        <ul>
          <li>Be kind. Do not harass, threaten, shame, or exploit anyone.</li>
          <li>Keep what others share in prayer to yourself.</li>
          <li>No group may exclude people by race or ethnicity.</li>
          <li>Group leaders and our moderators may remove posts and members who break these rules. Anyone can report abuse.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Giving">
        <p>
          Gifts and monthly gifts follow the{" "}
          <Link href="/giving-policy" className="underline underline-offset-4">giving and refund policy</Link>.
          A pledge toward a need is a promise, not a payment and not a
          contract.
        </p>
      </PolicySection>

      <PolicySection title="What you post">
        <p>
          You keep ownership of what you write. You let us show it to the
          people you chose, and to moderate it. Do not post anything you do
          not have the right to share.
        </p>
      </PolicySection>

      <PolicySection title="Not an emergency service">
        <p>
          Faceless Angels cannot respond to emergencies. If you or someone
          else is in danger, call 911 in the United States or 112 in Nigeria.
        </p>
      </PolicySection>

      <PolicySection title="Our responsibility">
        <p>
          We work hard to check every request and keep the site running, but
          we provide it as it is. As far as the law allows, we are not
          responsible for losses that come from using it, from other members,
          or from services run by others, such as payment companies and
          meeting providers.
        </p>
      </PolicySection>

      <PolicySection title="Ending your use">
        <p>
          You can stop using the site and ask us to close your account at
          any time. We may suspend or close an account that breaks these
          terms, and will tell you why unless the law or someone&apos;s safety
          prevents it.
        </p>
      </PolicySection>

      <PolicySection title="Changes">
        <p>
          We may update these terms. We will post the new date at the top,
          and tell account holders by email about important changes.
        </p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>
          See the <Link href="/contact" className="underline underline-offset-4">contact page</Link>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
