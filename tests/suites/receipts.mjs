// Receipts, yearly statements, legal details, and who may see each. Runs
// after the giving suite, which makes the gifts.
import { apiLogs, j, pause, signIn, SITE } from "../lib.mjs";

export const name = "Receipts and yearly statements";

const BLANK = { legalName: "", registrationNumber: "", address: "", taxStatus: "not_recognised", taxStatement: "", religiousBenefits: false };

export default async function run({ check, env }) {
  const admin = await signIn(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD);
  const treasurer = await signIn(env.TEST_TREASURER_EMAIL, env.TEST_TREASURER_PASSWORD);
  const member = await signIn(env.TEST_MEMBER_EMAIL, env.TEST_MEMBER_PASSWORD);
  const editor = await signIn(env.TEST_EDITOR_EMAIL, env.TEST_EDITOR_PASSWORD);

  // Keep whatever the US details were, and put them back at the end.
  const saved = (await j("/finance/entities", { headers: { cookie: admin } })).body;
  check("both legal bodies listed", saved?.map((e) => e.currency).sort().join(",") === "ngn,usd");
  const usdBefore = saved?.find((e) => e.currency === "usd");

  try {
    const usd = { legalName: "Faceless Angels Inc.", registrationNumber: "", address: "PO Box 1, Nashville, TN 37201", taxStatus: "recognised", taxStatement: "", religiousBenefits: false };
    let r = await j("/finance/entities/usd", { method: "PUT", headers: { cookie: member }, body: JSON.stringify(usd) });
    check("a member cannot change legal details", r.status === 403);
    r = await j("/finance/entities/usd", { method: "PUT", headers: { cookie: treasurer }, body: JSON.stringify(usd) });
    check("only an administrator changes legal details", r.status === 403);
    r = await j("/finance/entities/usd", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify(usd) });
    check("cannot mark recognised without a tax ID", r.status === 400);
    r = await j("/finance/entities/usd", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify({ ...usd, taxStatus: "not_recognised", registrationNumber: "00-0000000" }) });
    check("admin saves US legal details", r.status === 204);

    // ---- A receipt
    r = await j("/giving/mine", { headers: { cookie: member } });
    const gift = r.body?.gifts?.find((g) => g.currency === "usd");
    check("member has a gift", Boolean(gift));
    r = await j(`/giving/receipts/${gift.id}`, { headers: { cookie: member } });
    const receipt = r.body;
    check("giver opens their numbered receipt", r.status === 200 && /^FA-R-\d+$/.test(receipt?.receiptNumber ?? ""));
    check("receipt carries legal name and EIN", receipt?.entity?.legalName === "Faceless Angels Inc." && receipt?.entity?.registrationNumber === "00-0000000");
    check("receipt says no goods or services were given", receipt?.tax?.exchange?.startsWith("No goods or services were provided"));
    check("receipt says it may not be tax-deductible yet", /not yet recognised as a tax-exempt organisation/.test(receipt?.tax?.status ?? ""));
    check("receipt marked as a test payment", receipt?.testMode === true);
    check("someone else cannot open it", (await j(`/giving/receipts/${gift.id}`, { headers: { cookie: editor } })).status === 403);
    check("a visitor without the link cannot open it", (await j(`/giving/receipts/${gift.id}`)).status === 403);
    check("a forged link does not open it", (await j(`/giving/receipts/${gift.id}?t=forged`)).status === 403);
    check("money staff can open it", (await j(`/giving/receipts/${gift.id}`, { headers: { cookie: treasurer } })).status === 200);

    const since = new Date(Date.now() - 2000).toISOString();
    r = await j(`/finance/gifts/${gift.id}/resend`, { method: "POST", headers: { cookie: treasurer } });
    check("staff resend a receipt (kept in the log in tests)", r.status === 201 && r.body?.sent === false);
    await pause(800);
    const log = apiLogs(since);
    // Other gifts' receipts may be in the log too, so find this gift's link.
    const link = new RegExp(`View or print your receipt: (\\S*/giving/receipts/${gift.id}\\?t=\\S+)`).exec(log)?.[1];
    check("receipt email names the receipt number", log.includes(`Receipt ${receipt.receiptNumber}`));
    check("receipt email carries the EIN and tax wording", log.includes("EIN: 00-0000000") && log.includes("not yet recognised as a tax-exempt organisation"));
    check("receipt email has a signed link", Boolean(link) && link.includes(`/giving/receipts/${gift.id}?t=`));
    const token = link ? new URL(link).searchParams.get("t") : "";
    r = await j(`/giving/receipts/${gift.id}?t=${encodeURIComponent(token)}`);
    check("the emailed link opens it without signing in", r.status === 200);
    const other = (await j("/finance/overview", { headers: { cookie: admin } })).body?.gifts?.find((g) => g.id !== gift.id);
    check("that link opens no other receipt", (await j(`/giving/receipts/${other.id}?t=${encodeURIComponent(token)}`)).status === 403);

    // ---- Yearly statements
    const year = new Date().getFullYear();
    r = await j("/giving/statements", { headers: { cookie: member } });
    check("this year's statement listed for the member", r.body?.some((s) => s.year === year && s.currency === "usd"));
    r = await j(`/giving/statements/${year}?currency=usd`, { headers: { cookie: member } });
    const st = r.body;
    const sum = st?.gifts?.reduce((n, g) => n + g.kept, 0);
    check("statement lists each gift by receipt number", st?.gifts?.length >= 2 && st.gifts.every((g) => /^FA-R-/.test(g.receiptNumber)));
    check("statement total adds up", Math.abs(sum - st?.total) < 0.001);
    check("statement marked as including test payments", st?.includesTest === true);
    check("unknown currency refused", (await j(`/giving/statements/${year}?currency=eur`, { headers: { cookie: member } })).status === 404);
    check("statements need sign-in", (await j(`/giving/statements/${year}?currency=usd`)).status === 401);

    const since2 = new Date(Date.now() - 2000).toISOString();
    check("a member cannot send statements", (await j("/finance/statements", { method: "POST", headers: { cookie: member }, body: JSON.stringify({ year }) })).status === 403);
    r = await j("/finance/statements", { method: "POST", headers: { cookie: treasurer }, body: JSON.stringify({ year }) });
    const first = r.body;
    check("staff send this year's statements", r.status === 201 && first?.sent + first?.skipped >= 1);
    await pause(800);
    const links = [...apiLogs(since2).matchAll(/View or print your statement: (\S+)/g)].map((m) => m[1]);
    if (links.length > 0) {
      check("statement links never carry an email address", links.every((l) => !l.includes("%40") && !l.includes("@")));
      const u = new URL(links[0]);
      r = await j(`/giving/statement-links/${u.searchParams.get("s")}?t=${encodeURIComponent(u.searchParams.get("t"))}`);
      check("an emailed statement link opens without signing in", r.status === 200 && r.body?.gifts?.length >= 1);
      check("a forged statement link is refused", (await j(`/giving/statement-links/${u.searchParams.get("s")}?t=forged`)).status === 403);
      for (const path of [`/giving/receipts/${gift.id}?t=${encodeURIComponent(token)}`, `/giving/statements/view?s=${u.searchParams.get("s")}&t=${encodeURIComponent(u.searchParams.get("t"))}`]) {
        check(`page ${path.split("?")[0]} renders`, (await fetch(`${SITE}${path}`)).status === 200);
      }
    }
    r = await j("/finance/statements", { method: "POST", headers: { cookie: treasurer }, body: JSON.stringify({ year }) });
    check("sending again sends nobody a second copy", r.body?.sent === 0);
  } finally {
    const restore = usdBefore
      ? {
          legalName: usdBefore.legalName,
          registrationNumber: usdBefore.registrationNumber,
          address: usdBefore.address,
          taxStatus: usdBefore.taxStatus,
          taxStatement: usdBefore.taxStatement,
          religiousBenefits: usdBefore.religiousBenefits,
        }
      : BLANK;
    await j("/finance/entities/usd", { method: "PUT", headers: { cookie: admin }, body: JSON.stringify(restore) });
  }
}
