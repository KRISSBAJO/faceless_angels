// Makes sure the test accounts exist. New ones get a random password, saved
// in .env.test.local (git-ignored). Accounts already listed there are kept.
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { API, compose, ENV_FILE, readEnv } from "./lib.mjs";

const ACCOUNTS = [
  { key: "ADMIN", name: "Demo Admin", role: "admin" },
  { key: "EDITOR", name: "Demo Editor", role: "editor" },
  { key: "MEMBER", name: "Miriam Member", role: "angel" },
  { key: "TREASURER", name: "Demo Treasurer", role: "payment_approver" },
];

export async function setup() {
  const env = readEnv();
  for (const account of ACCOUNTS) {
    if (env[`TEST_${account.key}_EMAIL`]) continue;
    const email = `demo-${account.key.toLowerCase()}-${randomBytes(3).toString("hex")}@example.test`;
    const password = `Tt-${randomBytes(12).toString("base64url")}`;
    const r = await fetch(`${API}/api/auth/sign-up`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, fullName: account.name, intent: "give" }),
    });
    if (!r.ok) throw new Error(`Could not create ${email}: ${r.status} ${await r.text()}`);
    compose(`exec -T api node dist/scripts/prepare-test-account.js ${email} ${account.role}`);
    appendFileSync(
      ENV_FILE,
      `\nTEST_${account.key}_EMAIL=${email}\nTEST_${account.key}_PASSWORD=${password}\n`,
    );
    console.log(`  made ${account.role} test account ${email}`);
  }
}

// Run on its own with: node tests/setup.mjs
if (process.argv[1]?.replace(/\\/g, "/").endsWith("tests/setup.mjs")) {
  setup().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
