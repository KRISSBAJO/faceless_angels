import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage, { contactEmail, organisations, PolicySection } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Giving and refunds · Faceless Angels",
  description: "How gifts to Faceless Angels work: what they pay for, monthly gifts, refunds, receipts, and taxes.",
  alternates: { canonical: "/giving-policy" },
};

export const dynamic = "force-dynamic";

export default async function GivingPolicyPage() {
  const orgs = await organisations();
  const email = contactEmail();
  const usd = orgs.find((o) => o.currency === "usd");
  const ngn = orgs.find((o) => o.currency === "ngn");
  return (
    <PolicyPage
      title="Giving and refunds"
      current="/giving-policy"
      intro="Giving to Faceless Angels is always free and never required. This page explains what a gift pays for, how monthly gifts and refunds work, and what records you receive."
    >
      <PolicySection title="What a gift pays for">
        <p>
          A gift supports the running of Faceless Angels: checking requests,
          keeping documents safe, and serving the prayer network. It does not
          go to a specific need. Every gift, cost, and payment is shown in
          total on{" "}
          <Link href="/transparency" className="underline underline-offset-4">Where the money goes</Link>.
        </p>
        <p>Help and prayer never depend on whether you give.</p>
      </PolicySection>

      <PolicySection title="Who receives it">
        <ul>
          <li>
            Gifts in US dollars are received by{" "}
            {usd ? `${usd.legalName}` : "our US organisation"} and taken by
            card through Stripe.
          </li>
          <li>
            Gifts in naira are received by{" "}
            {ngn ? `${ngn.legalName}` : "our Nigerian organisation"} and taken
            by card through Paystack.
          </li>
        </ul>
        <p>Your card details go to Stripe or Paystack and never reach us.</p>
      </PolicySection>

      <PolicySection title="Monthly gifts">
        <ul>
          <li>A monthly gift is taken once a month, on about the same day as the first.</li>
          <li>You can stop it at any time from My giving. Stopping it takes effect before the next payment.</li>
          <li>We never raise the amount without asking you first.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Refunds">
        <p>
          Gifts are usually final. But if a gift was made by mistake, such as
          the wrong amount, a gift made twice, or a payment you did not make,
          tell us within 30 days and we will refund the full amount to the
          card it came from. It can take up to 10 business days to appear,
          depending on your bank.
        </p>
        <p>
          Please contact us before disputing a payment with your bank. We can
          usually put it right faster.
        </p>
      </PolicySection>

      <PolicySection title="Receipts, statements, and taxes">
        <ul>
          <li>Every gift gets a numbered receipt by email. You can print or save any receipt from My giving.</li>
          <li>Each January we email a statement listing every gift from the year before.</li>
          <li>
            Whether a gift reduces your taxes depends on the tax status of the
            organisation that received it. Each receipt says whether that
            organisation is recognised as tax-exempt. Until it says so, treat
            the gift as not tax-deductible, and ask your tax adviser.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="Your privacy as a giver">
        <p>
          Your name is never shown publicly, and the people who are helped
          never learn who gave. See the{" "}
          <Link href="/privacy" className="underline underline-offset-4">privacy page</Link>.
        </p>
      </PolicySection>

      <PolicySection title="Questions and refund requests">
        <p>
          {email ? (
            <>
              Write to <a href={`mailto:${email}`} className="underline underline-offset-4">{email}</a> with
              your receipt number (it starts with FA-R).
            </>
          ) : (
            <>Use the <Link href="/contact" className="underline underline-offset-4">contact page</Link>, with your receipt number (it starts with FA-R).</>
          )}
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
