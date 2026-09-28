import Link from "next/link";
import CaseViews from "@/components/CaseViews";
import Mark from "@/components/Mark";
import OpenNeeds from "@/components/OpenNeeds";
import PrayerHome from "@/components/PrayerHome";

const nav = [
  { href: "/prayer", label: "Prayer" },
  { href: "/needs", label: "Needs" },
  { href: "#how", label: "How giving works" },
  { href: "#safeguards", label: "Safeguards" },
  { href: "#privacy", label: "Privacy" },
  { href: "#community", label: "Community" },
];

const steps = [
  {
    title: "Ask in private",
    body: "Tell us what happened, what is owed, and when it is due. Upload the bill or notice. None of this is shown to the public.",
  },
  {
    title: "We verify the person and the need",
    body: "We confirm your identity and check the document. For larger amounts we confirm the balance with the provider.",
  },
  {
    title: "A reviewer decides",
    body: "A trained person approves the amount and explains the decision in plain words. A second person authorizes the payment.",
  },
  {
    title: "An Angel pays the provider",
    body: "Angels fund the approved amount. We recheck the balance, then the money goes to the utility, landlord, or school.",
  },
  {
    title: "Proof, then follow-up",
    body: "The receipt is filed with the case. We ask if you want help getting beyond the situation.",
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
    body: "Identity is verified privately, which makes duplicate accounts hard to run.",
  },
  {
    title: "Documents are checked",
    body: "Old, altered, or reused bills are sent to a moderator before anything is published.",
  },
  {
    title: "Review scales with the risk",
    body: "A small grocery request gets a light check. Rent, repeat requests, and cash exceptions get a senior reviewer.",
  },
  {
    title: "Two people release every payment",
    body: "The person who reviews a case cannot pay it out alone. Every step is logged.",
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

const areas = [
  {
    name: "Prayer Groups",
    body: "A network of groups that pray each week, online and in person, led by named leaders.",
  },
  {
    name: "Prayer Requests",
    body: "Ask for prayer in private, in your group, or across the network. Prayer is always optional.",
  },
  {
    name: "Ask for Help",
    body: "Food, rent, utilities, transportation, school supplies, and emergencies.",
  },
  {
    name: "Be an Angel",
    body: "Browse approved needs and pledge toward one without your name attached.",
  },
  {
    name: "Nominate Someone",
    body: "Tell us about a neighbor in need. We check the situation and ask their consent before opening a mission.",
  },
  {
    name: "Angel Missions",
    body: "Churches and groups organize help around a specific need.",
  },
  {
    name: "Journal",
    body: "Devotionals, Bible study, family, finances, and stories from people who were helped.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-4">
          <a href="#" className="flex items-center gap-2.5">
            <Mark />
            <span className="font-serif text-xl">Faceless Angels</span>
          </a>
          <nav aria-label="Main" className="hidden gap-7 text-sm md:flex">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-muted transition-colors hover:text-ink"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/sign-in" className="text-muted hover:text-ink">
              Sign in
            </Link>
            <Link
              href="/ask"
              className="rounded-full bg-ink px-4 py-2 font-medium text-paper transition-opacity hover:opacity-90"
            >
              Ask for help
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-col">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="flex flex-col gap-7">
            <Eyebrow>A Christian community of prayer and quiet giving</Eyebrow>
            <h1 className="font-serif text-5xl leading-[1.02] tracking-tight sm:text-7xl">
              Pray together.
              <br />
              Help quietly.
              <br />
              <em className="text-gold">Love openly.</em>
            </h1>
            <p className="max-w-[34rem] text-lg leading-8 text-muted">
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
                Become an Angel
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-5">
          <article
            aria-label="Example prayer request"
            className="flex flex-col gap-4 rounded-2xl bg-night p-6 text-night-ink shadow-[0_24px_60px_-30px_rgba(20,33,61,0.5)] sm:p-8 lg:-ml-8 lg:mr-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.1em] text-night-muted">
                Prayer request · Midweek group
              </p>
              <span className="rounded-full bg-gold-bright px-2.5 py-1 text-xs font-medium text-night">
                Example request
              </span>
            </div>
            <p className="font-serif text-2xl leading-snug">
              Please pray for my mother. She goes into surgery on Monday.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-night-muted">
                From{" "}
                <span
                  className="redacted on-night w-20"
                  aria-label="name hidden"
                />
              </span>
              <span className="rounded-full border border-night-line px-3 py-1 font-medium">
                ✓ You prayed
              </span>
            </div>
          </article>

          <article
            aria-label="Example help request"
            className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_60px_-30px_rgba(20,33,61,0.35)] sm:p-8 lg:ml-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">
                Utility assistance · Nashville, TN
              </p>
              <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-medium text-gold">
                Example request
              </span>
            </div>
            <p className="font-serif text-2xl leading-snug">
              Single-parent household requesting assistance with an electricity
              bill.
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
                ✓ Bill reviewed
              </span>
              <span className="rounded-full bg-verified-soft px-3 py-1">
                ✓ Balance confirmed with provider
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4 tabular-nums">
                <span className="font-serif text-4xl">$187.42</span>
                <span className="text-sm text-muted">needed</span>
              </div>
              <div
                role="progressbar"
                aria-label="Amount funded"
                aria-valuemin={0}
                aria-valuemax={187.42}
                aria-valuenow={120}
                className="h-2 overflow-hidden rounded-full bg-line"
              >
                <div className="h-full w-[64%] rounded-full bg-gold-bright" />
              </div>
              <div className="flex justify-between gap-4 text-sm tabular-nums text-muted">
                <span>$120.00 funded</span>
                <span>$67.42 remaining</span>
              </div>
            </div>
            <p className="border-t border-line pt-4 text-sm text-muted">
              Paid directly to the utility provider. Due Friday.
            </p>
          </article>
          </div>
        </section>

        <PrayerHome />

        <OpenNeeds />

        {/* Scripture */}
        <section className="border-y border-line bg-surface">
          <figure className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-14 text-center">
            <blockquote className="font-serif text-2xl italic leading-relaxed sm:text-3xl">
              But when thou doest alms, let not thy left hand know what thy
              right hand doeth: that thine alms may be in secret.
            </blockquote>
            <figcaption className="text-sm text-muted">
              Matthew 6:3–4 (KJV)
            </figcaption>
          </figure>
        </section>

        {/* How it works */}
        <section
          id="how"
          className="mx-auto flex w-full max-w-6xl scroll-mt-8 flex-col gap-10 px-5 py-20"
        >
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>How giving works</Eyebrow>
            <h2 className="font-serif text-4xl leading-tight sm:text-5xl">
              From a private request to a paid bill
            </h2>
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

        {/* Two views */}
        <section className="bg-night text-night-ink">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <div className="flex flex-col gap-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright">
                Privacy with accountability
              </p>
              <h2 className="font-serif text-4xl leading-tight sm:text-5xl">
                The Angel may be faceless. The transaction never is.
              </h2>
              <p className="max-w-[32rem] leading-7 text-night-muted">
                The helper stays hidden from the recipient, but nobody is
                hidden from the platform. We know who gave, who received, what
                was paid, and when. Switch between the two views of the same
                gift.
              </p>
            </div>
            <CaseViews />
          </div>
        </section>

        {/* Safeguards */}
        <section
          id="safeguards"
          className="mx-auto grid w-full max-w-6xl scroll-mt-8 gap-14 px-5 py-20 lg:grid-cols-2"
        >
          <div className="flex flex-col gap-6">
            <Eyebrow>Safeguards</Eyebrow>
            <h2 className="font-serif text-4xl leading-tight sm:text-5xl">
              We pay the need, not the applicant
            </h2>
            <p className="max-w-[34rem] leading-7 text-muted">
              Cash is the exception. When a bill is confirmed, the gift goes
              straight to whoever is owed. Each badge names the exact check
              we completed, so you know what was confirmed and what was not.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink text-xs uppercase tracking-[0.1em] text-muted">
                    <th className="py-3 pr-6 font-semibold">The need</th>
                    <th className="py-3 font-semibold">Who is paid</th>
                  </tr>
                </thead>
                <tbody>
                  {destinations.map(([need, payee]) => (
                    <tr key={need} className="border-b border-line">
                      <td className="py-3 pr-6 font-medium">{need}</td>
                      <td className="py-3 text-muted">{payee}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ul className="flex flex-col">
            {safeguards.map((item) => (
              <li
                key={item.title}
                className="flex flex-col gap-1.5 border-b border-line py-5 first:pt-0 last:border-b-0"
              >
                <h3 className="font-medium">{item.title}</h3>
                <p className="text-sm leading-6 text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Privacy levels */}
        <section
          id="privacy"
          className="scroll-mt-8 border-y border-line bg-surface"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-20">
            <div className="flex max-w-2xl flex-col gap-4">
              <Eyebrow>Privacy</Eyebrow>
              <h2 className="font-serif text-4xl leading-tight sm:text-5xl">
                You choose how much of yourself is seen
              </h2>
              <p className="leading-7 text-muted">
                At every level, administrators keep an identity trail that can
                be audited.
              </p>
            </div>
            <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
              <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {levels.map((level) => (
                  <div key={level.name} className="flex flex-col gap-2">
                    <dt className="font-serif text-xl">{level.name}</dt>
                    <dd className="text-sm leading-6 text-muted">
                      {level.body}
                    </dd>
                  </div>
                ))}
              </dl>
              <article
                aria-label="Example Angel profile"
                className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm">Faceless Angel #FA-7281</p>
                  <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-medium text-gold">
                    Example profile
                  </span>
                </div>
                <dl className="flex flex-col text-sm tabular-nums">
                  <div className="flex justify-between gap-4 border-b border-line py-2.5">
                    <dt className="text-muted">People helped</dt>
                    <dd className="font-medium">18</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-line py-2.5">
                    <dt className="text-muted">Verified needs fulfilled</dt>
                    <dd className="font-medium">$2,840</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-muted">Member since</dt>
                    <dd className="font-medium">2026</dd>
                  </div>
                </dl>
                <p className="text-sm font-medium text-verified">
                  ✓ Identity checked
                </p>
                <p className="text-sm leading-6 text-muted">
                  No name and no leaderboard. Giving here is not a contest.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Community */}
        <section
          id="community"
          className="mx-auto flex w-full max-w-6xl scroll-mt-8 flex-col gap-10 px-5 py-20"
        >
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow>Community</Eyebrow>
            <h2 className="font-serif text-4xl leading-tight sm:text-5xl">
              More than a place to give
            </h2>
            <p className="leading-7 text-muted">
              After a bill is paid, we ask one more question: would you like
              help getting beyond this? We can point you to work, budgeting,
              food, counseling, and a local church.
            </p>
            <p className="border-l-2 border-gold-bright pl-4 leading-7">
              Help never depends on conversion, church membership, or giving
              a testimony.
            </p>
          </div>
          <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => (
              <li
                key={area.name}
                className="flex flex-col gap-2 border-t border-line pt-5"
              >
                <h3 className="font-serif text-2xl">{area.name}</h3>
                <p className="text-sm leading-6 text-muted">{area.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Closing */}
        <section id="start" className="scroll-mt-8 bg-night text-night-ink">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-20 lg:grid-cols-3">
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-night-line p-7 sm:p-10">
              <h2 className="font-serif text-3xl sm:text-4xl">
                Pray with a group
              </h2>
              <p className="leading-7 text-night-muted">
                Find a group that prays each week, or start one for your
                church, your street, or your family.
              </p>
              <Link
                href="/prayer"
                className="mt-auto rounded-full bg-gold-bright px-6 py-3 font-medium text-night transition-opacity hover:opacity-90"
              >
                Pray with us
              </Link>
            </div>
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-night-line p-7 sm:p-10">
              <h2 className="font-serif text-3xl sm:text-4xl">
                Become someone&apos;s Angel
              </h2>
              <p className="leading-7 text-night-muted">
                Confirm your identity once. Then cover an approved need
                whenever you are able, with no name attached.
              </p>
              <Link
                href="/needs"
                className="mt-auto rounded-full border border-night-ink px-6 py-3 font-medium transition-colors hover:bg-night-ink hover:text-night"
              >
                See open needs
              </Link>
            </div>
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-night-line p-7 sm:p-10">
              <h2 className="font-serif text-3xl sm:text-4xl">
                Ask for help, or for a neighbor
              </h2>
              <p className="leading-7 text-night-muted">
                Your request is reviewed in private. Donors see the situation,
                never your name.
              </p>
              <Link
                href="/ask"
                className="mt-auto rounded-full border border-night-ink px-6 py-3 font-medium transition-colors hover:bg-night-ink hover:text-night"
              >
                Ask for help
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted">
          <div className="flex items-center gap-2.5 text-ink">
            <Mark />
            <span className="font-serif text-lg">Faceless Angels</span>
          </div>
          <p>Pray together. Help quietly. Love openly.</p>
          <p className="basis-full">
            Faceless Angels is not an emergency service. If you are in
            immediate danger, call 911.
          </p>
        </div>
      </footer>
    </>
  );
}
