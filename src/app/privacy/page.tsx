import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage, { contactEmail, organisations, PolicySection, whoWeAre } from "@/components/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy · Faceless Angels",
  description: "What Faceless Angels collects, why, who can see it, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const orgs = await organisations();
  const email = contactEmail();
  return (
    <PolicyPage
      title="Privacy"
      current="/privacy"
      intro="Faceless Angels exists so people can ask for help and give without being exposed. This page says what we collect, why, who can see it, and what you can ask us to do."
    >
      <PolicySection title="Who we are">
        <p>
          Faceless Angels is run by {whoWeAre(orgs)}. When this page says
          &ldquo;we&rdquo;, it means them.
        </p>
      </PolicySection>

      <PolicySection title="What we collect">
        <ul>
          <li><strong>Your account:</strong> your name, email address, and a scrambled form of your password that no one can read.</li>
          <li><strong>Requests for help:</strong> what happened, the amount, the due date, who is owed, and the bills or notices you upload. We may also ask for an identity document.</li>
          <li><strong>Prayer:</strong> the prayers you post, who you chose to share each one with, and the groups and sessions you join.</li>
          <li><strong>The Journal:</strong> your comments, reactions, saved articles, and private notes.</li>
          <li><strong>Gifts:</strong> your email, the amount, the date, and the payment reference. Your card number goes to Stripe or Paystack, never to us.</li>
          <li><strong>Technical records:</strong> one sign-in cookie, and the address your request came from, used to slow down abuse. We keep logs of actions on the site so we can check what happened.</li>
        </ul>
      </PolicySection>

      <PolicySection title="What we use it for">
        <ul>
          <li>To check requests for help, list them without your name, and pay the provider when a need is met.</li>
          <li>To share prayers only with the people you chose.</li>
          <li>To record gifts, send receipts and yearly statements, and publish totals on <Link href="/transparency" className="underline underline-offset-4">Where the money goes</Link>.</li>
          <li>To keep the community safe: stopping fraud, duplicate accounts, and abuse.</li>
          <li>To send the emails your account needs, and the Journal emails you chose to follow.</li>
        </ul>
        <p>We do not sell your information, show you advertising, or use advertising trackers.</p>
      </PolicySection>

      <PolicySection title="Who can see what">
        <ul>
          <li><strong>People who give never learn who they helped.</strong> They see the situation, the checks we made, and the amount.</li>
          <li><strong>People who are helped never learn who gave.</strong></li>
          <li><strong>Reviewers</strong> see requests and documents so they can check them. A reviewer can never review their own request. Every time a document is opened, it is logged.</li>
          <li><strong>Personal prayers</strong> are seen by no one but you. Other prayers are seen only by the people you chose: the prayer team, your group, or the network.</li>
          <li><strong>Your private Journal notes</strong> are seen by no one but you, not even staff.</li>
          <li><strong>The public</strong> sees only totals of money in and out, never a name or a single gift.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Companies that help us run the site">
        <p>They handle your information only to provide their service to us:</p>
        <ul>
          <li>Render hosts the website, the API, and the database.</li>
          <li>Amazon Web Services stores uploaded documents, which we encrypt before they leave our servers.</li>
          <li>RelyKit sends our email.</li>
          <li>Stripe and Paystack take card payments.</li>
          <li>Patvero, Zoom, or Microsoft Teams host online prayer sessions when a leader chooses them. We only store the meeting link.</li>
        </ul>
        <p>We may also share information when the law requires it, or to protect someone from harm.</p>
      </PolicySection>

      <PolicySection title="How long we keep it">
        <ul>
          <li>Your account, until you ask us to close it.</li>
          <li>Requests and their documents, for as long as we need them to review, pay, and account for the help given.</li>
          <li>Gift and payment records, for as long as tax and accounting law requires, usually seven years.</li>
          <li>Logs of actions, so that decisions can be checked later.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Your choices">
        <p>
          You can ask us to show you what we hold about you, correct it, or
          delete it. We will do so unless the law or an open review requires
          us to keep it. People in Nigeria have rights under the Nigeria Data
          Protection Act, and people in some US states have similar rights.
          We honour them for everyone.
        </p>
        <p>
          You can stop a monthly gift, unfollow Journal emails, and choose who
          sees each prayer, all from your account.
        </p>
      </PolicySection>

      <PolicySection title="Keeping it safe">
        <p>
          Uploaded documents are encrypted. Staff see only what their role
          needs. Payments to providers need two different people. Every
          sensitive action is logged.
        </p>
      </PolicySection>

      <PolicySection title="Children">
        <p>Accounts are for adults aged 18 or over.</p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>
          {email ? (
            <>Write to <a href={`mailto:${email}`} className="underline underline-offset-4">{email}</a>. </>
          ) : null}
          See the <Link href="/contact" className="underline underline-offset-4">contact page</Link> for
          other ways to reach us. If we change this policy, we will post the
          new date at the top.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
