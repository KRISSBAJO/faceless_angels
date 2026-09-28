import Link from "next/link";
import CaseViews from "@/components/CaseViews";
import HomeHeader from "@/components/HomeHeader";
import Mark from "@/components/Mark";
import JournalHome from "@/components/JournalHome";
import OpenNeeds from "@/components/OpenNeeds";
import PrayerHome from "@/components/PrayerHome";

// Giving is not open yet: Angels pledge, and no money moves. Keep these
// words true to what the site does today.
const steps = [
  {
    title: "Ask in private",
    body: "Tell us what happened, what is owed, and when it is due. Upload the bill or notice. None of this is shown to the public.",
  },
  {
    title: "We check the person and the need",
    body: "We confirm your identity and check the document. For larger amounts we confirm the balance with the provider.",
  },
  {
    title: "A reviewer decides",
    body: "A trained person approves the amount and explains the decision in plain words. You can appeal.",
  },
  {
    title: "Angels pledge",
    body: "The need is listed without your name. Angels pledge toward it, and never learn who you are.",
  },
  {
    title: "The provider is paid",
    body: "When giving opens, the money goes straight to the utility, landlord, or school, and the receipt is filed with the case.",
  },
];

const destinations: [string, string][] = [
  ["Rent", "Landlord or property manager"],
  ["Electricity, gas, water", "Utility provider"],
  ["Groceries", "Controlled grocery assistance"],
  ["Emergency shelter", "Hotel"],
  ["School needs", "School or vendor"],
];

const safeguards = [
  {
    title: "One person, one account",
    body: "Identity is checked privately, which makes duplicate accounts hard to run.",
  },
  {
    title: "Documents are checked",
    body: "Old, altered, or reused bills go to a moderator before anything is published.",
  },
  {
    title: "Review scales with the risk",
    body: "A small grocery request gets a light check. Rent and repeat requests get a senior reviewer.",
  },
  {
    title: "No one decides alone",
    body: "Reviewers cannot approve their own requests, and every step is logged.",
  },
  {
    title: "People decide, and decisions can be appealed",
    body: "Automated signals only set the order of review. A job or past help is context, never proof of deceit.",
  },
];

const levels = [
  {
    name: "Public Identity",
    body: "A normal profile. Your name is visible to the community.",
  },
  {
    name: "Faceless Angel",
    body: "The recipient never learns who gave. The platform does.",
  },
  {
    name: "Private Requester",
    body: "Donors see the situation. They do not see who you are.",
  },
  {
    name: "Fully Private Mission",
    body: "Sensitive cases are not searchable. Only approved Angels can see them.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
      {children}
    </p>
  );
}

const FOOTER_LINKS: [string, [string, string][]][] = [
  [
    "Take part",
    [
      ["/prayer", "Prayer"],
      ["/prayer/groups", "Prayer groups"],
      ["/needs", "Open needs"],
      ["/ask", "Ask for help"],
    ],
  ],
  [
    "Read",
    [
      ["/journal", "Journal"],
      ["/journal/articles", "All articles"],
      ["/journal/feed.xml", "Journal feed"],
    ],
  ],
  [
    "How it works",
    [
      ["/#how", "How giving works"],
      ["/#safeguards", "Safeguards"],
      ["/#privacy", "Privacy"],
    ],
  ],
];

export default function Home() {
  return (
    <>
      <HomeHeader />

      <main className="flex flex-col">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-14 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div className="flex flex-col gap-6">
            <Eyebrow>A Christian community of prayer and quiet giving</Eyebrow>
            <h1 className="font-serif text-4xl leading-[1.08] tracking-tight sm:text-6xl">
              Pray together.
              <br />
              Help quietly.
              <br />
              <em className="text-gold">Love openly.</em>
            </h1>
            <p className="max-w-[32rem] leading-7 text-muted">
              Faceless Angels is a network of prayer groups, and a way to meet
              real needs without seeking recognition. Pray with a group each
              week. Help someone who never learns your name.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/prayer"
                className="rounded-full bg-ink px-6 py-3 font-medium text-paper transition-opacity hover:opacity-90"
              >
                Pray with us
              </Link>
              <Link
                href="/needs"
                className="rounded-full border border-ink px-6 py-3 font-medium transition-colors hover:bg-ink hover:text-paper"
              >
                See open needs
              </Link>
            </div>
          </div>

          <article
            aria-label="Example from a prayer group"
            className="flex flex-col rounded-2xl border border-line bg-surface shadow-[0_24px_60px_-30px_rgba(20,33,61,0.3)]"
          >
            <div className="flex flex-col gap-5 p-7 sm:p-9">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
                  Midweek prayer group · Nashville, TN
                </p>
                <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-medium text-gold">
                  Example
                </span>
              </div>
              <p className="font-serif text-2xl leading-snug">
                Please pray for my mother. She goes into surgery on Monday.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-muted">
                  From{" "}
                  <span className="redacted w-24" aria-label="name hidden" />
                </span>
                <span className="rounded-full bg-verified-soft px-3 py-1 font-medium text-verified">
                  ✓ You prayed
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-7 py-5 text-sm sm:px-9">
              <span>
                <span className="block font-medium">Evening prayer</span>
                <span className="text-muted">
                  Wednesday, 7:00 PM CDT · on Patvero
                </span>
              </span>
              <span className="font-medium text-verified">
                ✓ You are coming
              </span>
            </div>
          </article>
        </section>

        {/* Scripture */}
        <section className="border-t border-line">
          <figure className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-5 py-12 text-center">
            <blockquote className="font-serif text-xl italic leading-relaxed sm:text-2xl">
              But when thou doest alms, let not thy left hand know what thy
              right hand doeth: that thine alms may be in secret.
            </blockquote>
            <figcaption className="text-sm text-muted">
              Matthew 6:3–4 (KJV)
            </figcaption>
          </figure>
        </section>

        <PrayerHome />

        <OpenNeeds />

        <JournalHome />

        {/* How giving works */}
        <section
          id="how"
          className="mx-auto flex w-full max-w-6xl scroll-mt-8 flex-col gap-10 px-5 py-16"
        >
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div className="flex flex-col gap-4">
              <Eyebrow>How giving works</Eyebrow>
              <h2 className="font-serif text-3xl leading-tight sm:text-4xl">
                From a private request to a paid bill
              </h2>
              <p className="max-w-[32rem] leading-7 text-muted">
                The person you help never learns your name. Every gift is
                still recorded, checked, and accounted for.
              </p>
              <p className="max-w-[32rem] rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-6">
                Giving is not open yet. For now, Angels pledge: a promise to
                give. No money is taken, and we will write when giving opens.
              </p>
            </div>
            <article
              aria-label="Example help request"
              className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_60px_-30px_rgba(20,33,61,0.35)] sm:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
                  School needs · Knoxville, TN
                </p>
                <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-medium text-gold">
                  Example request
                </span>
              </div>
              <p className="font-serif text-2xl leading-snug">
                School supplies for two children starting at a new school
                after a move.
              </p>
              <p className="text-sm text-muted">
                Requested by{" "}
                <span className="redacted w-28" aria-label="name hidden" />
              </p>
              <div className="flex flex-wrap gap-2 text-sm font-medium text-verified">
                <span className="rounded-full bg-verified-soft px-3 py-1">
                  ✓ Identity checked
                </span>
                <span className="rounded-full bg-verified-soft px-3 py-1">
                  ✓ School list reviewed
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-4 tabular-nums">
                  <span className="font-serif text-4xl">$96.50</span>
                  <span className="text-sm text-muted">needed</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Amount pledged"
                  aria-valuemin={0}
                  aria-valuemax={96.5}
                  aria-valuenow={40}
                  className="h-2 overflow-hidden rounded-full bg-line"
                >
                  <div className="h-full w-[41%] rounded-full bg-gold-bright" />
                </div>
                <div className="flex justify-between gap-4 text-sm tabular-nums text-muted">
                  <span>$40.00 pledged</span>
                  <span>$56.50 still needed</span>
                </div>
              </div>
              <p className="border-t border-line pt-4 text-sm text-muted">
                To be paid directly to the school supplier.
              </p>
            </article>
          </div>
          <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-x-6">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-3 border-t-2 border-ink pt-4"
              >
                <span className="font-mono text-sm text-gold">
                  Step {i + 1}
                </span>
                <h3 className="font-serif text-xl leading-snug">
                  {step.title}
                </h3>
                <p className="text-sm leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* How we keep it safe: privacy, safeguards, and who is paid */}
        <section
          id="safeguards"
          className="scroll-mt-8 border-y border-line bg-surface"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 py-16">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-center">
              <div className="flex flex-col gap-5">
                <Eyebrow>How we keep it safe</Eyebrow>
                <h2 className="font-serif text-3xl leading-tight sm:text-4xl">
                  The Angel may be faceless. The transaction never is.
                </h2>
                <p className="max-w-[32rem] leading-7 text-muted">
                  The helper stays hidden from the recipient, but nobody is
                  hidden from the platform. We know who gave, who received,
                  what was paid, and when. Switch between the two views of the
                  same gift.
                </p>
              </div>
              <CaseViews />
            </div>

            <div className="grid gap-12 border-t border-line pt-12 lg:grid-cols-3">
              <div className="flex flex-col gap-4">
                <h3 className="font-serif text-2xl">
                  We pay the need, not the applicant
                </h3>
                <p className="text-sm leading-6 text-muted">
                  Cash is the exception. The gift goes straight to whoever is
                  owed.
                </p>
                <dl className="flex flex-col text-sm">
                  {destinations.map(([need, payee]) => (
                    <div
                      key={need}
                      className="flex justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
                    >
                      <dt className="font-medium">{need}</dt>
                      <dd className="text-right text-muted">{payee}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="font-serif text-2xl">Checks at every step</h3>
                <ul className="flex flex-col">
                  {safeguards.map((item) => (
                    <li
                      key={item.title}
                      className="flex flex-col gap-1 border-b border-line py-3 first:pt-0 last:border-b-0"
                    >
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-sm leading-6 text-muted">
                        {item.body}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div id="privacy" className="flex scroll-mt-8 flex-col gap-4">
                <h3 className="font-serif text-2xl">
                  You choose how much is seen
                </h3>
                <dl className="flex flex-col">
                  {levels.map((level) => (
                    <div
                      key={level.name}
                      className="flex flex-col gap-1 border-b border-line py-3 first:pt-0 last:border-b-0"
                    >
                      <dt className="text-sm font-medium">{level.name}</dt>
                      <dd className="text-sm leading-6 text-muted">
                        {level.body}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm leading-6 text-muted">
                  At every level, administrators keep an identity trail that
                  can be audited. No leaderboard: giving here is not a
                  contest.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section
          id="community"
          className="mx-auto flex w-full max-w-6xl scroll-mt-8 flex-col gap-10 px-5 py-16"
        >
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>More than a place to give</Eyebrow>
            <h2 className="font-serif text-3xl leading-tight sm:text-4xl">
              Come as you are
            </h2>
            <p className="leading-7 text-muted">
              After a need is met, we ask one more question: would you like
              help getting beyond this? We can point you to work, budgeting,
              food, counseling, and a local church.
            </p>
            <p className="border-l-2 border-gold-bright pl-4 leading-7">
              Help never depends on conversion, church membership, or giving
              a testimony.
            </p>
          </div>
          <div id="start" className="grid scroll-mt-8 gap-6 lg:grid-cols-3">
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-7 sm:p-8">
              <h3 className="font-serif text-2xl">Pray with a group</h3>
              <p className="leading-7 text-muted">
                Find a group that prays each week, or start one for your
                church, your street, or your family.
              </p>
              <Link href="/prayer" className="btn btn-primary mt-auto">
                Pray with us
              </Link>
            </div>
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-7 sm:p-8">
              <h3 className="font-serif text-2xl">
                Become someone&apos;s Angel
              </h3>
              <p className="leading-7 text-muted">
                Confirm your identity once. Then pledge toward an approved
                need, with no name attached.
              </p>
              <Link href="/needs" className="btn btn-ghost mt-auto">
                See open needs
              </Link>
            </div>
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-7 sm:p-8">
              <h3 className="font-serif text-2xl">Ask for help</h3>
              <p className="leading-7 text-muted">
                Your request is reviewed in private. Donors see the
                situation, never your name.
              </p>
              <Link href="/ask" className="btn btn-ghost mt-auto">
                Ask for help
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <Mark />
              <span className="font-serif text-lg">Faceless Angels</span>
            </div>
            <p className="text-sm text-muted">
              Pray together. Help quietly. Love openly.
            </p>
          </div>
          {FOOTER_LINKS.map(([heading, links]) => (
            <nav key={heading} aria-label={heading} className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {heading}
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="hover:underline hover:underline-offset-4">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mx-auto w-full max-w-6xl border-t border-line px-5 py-5 text-sm text-muted">
          Faceless Angels is not an emergency service. If you are in immediate
          danger, call 911.
        </p>
      </footer>
    </>
  );
}
