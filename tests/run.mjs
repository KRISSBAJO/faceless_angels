// Runs every end-to-end suite. See tests/README.md.
//
//   node tests/run.mjs             switches the local API to test settings,
//                                  runs the suites, then switches it back
//   node tests/run.mjs --ready     the stack is already up with
//                                  docker-compose.test.yml (as in CI)
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { API, checker, compose, pause, readEnv, ROOT, SITE } from "./lib.mjs";
import { setup } from "./setup.mjs";
import { startStandIn } from "./standin.mjs";
import * as giving from "./suites/giving.mjs";
import * as patvero from "./suites/patvero.mjs";
import * as receipts from "./suites/receipts.mjs";
import * as webProxy from "./suites/web-proxy.mjs";

const SUITES = [webProxy, giving, receipts, patvero];
const ready = process.argv.includes("--ready");

function composeFiles(test) {
  const files = ["docker-compose.yml"];
  if (existsSync(join(ROOT, "docker-compose.override.yml"))) files.push("docker-compose.override.yml");
  if (test) files.push("docker-compose.test.yml");
  return files.map((f) => `-f ${f}`).join(" ");
}

async function waitFor(url, what) {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await pause(2000);
  }
  throw new Error(`${what} did not come up at ${url}`);
}

async function main() {
  console.log("Compiling the API for the Patvero client suite…");
  execSync("npx tsc -p . --outDir ../tests/.cache/api-dist", { cwd: join(ROOT, "api"), stdio: "inherit" });

  if (!ready) {
    console.log("Switching the API to test settings…");
    compose(`${composeFiles(true)} up -d --build api`, { stdio: "inherit", timeout: 600_000 });
  }
  await waitFor(`${API}/api/health`, "The API");
  await waitFor(`${SITE}/healthz`, "The website");

  console.log("Checking test accounts…");
  await setup();
  const env = readEnv();
  const standin = await startStandIn();

  const results = [];
  try {
    for (const suite of SUITES) {
      console.log(`\n${suite.name}`);
      const t = checker(suite.name);
      let skipped = null;
      try {
        await suite.default({
          check: t.check,
          env,
          standin: standin.state,
          skip: (why) => {
            skipped = why;
            console.log(`  SKIP ${why}`);
          },
        });
      } catch (err) {
        t.check("suite finished without crashing", false, err?.stack ?? String(err));
      }
      results.push({ name: suite.name, ...t.counts, skipped });
    }
  } finally {
    standin.close();
    if (!ready) {
      console.log("\nSwitching the API back to normal settings…");
      compose(`${composeFiles(false)} up -d api`, { stdio: "inherit", timeout: 300_000 });
    }
  }

  console.log("\nSummary");
  for (const r of results) {
    console.log(`  ${r.fail ? "✗" : "✓"} ${r.name}: ${r.pass} passed${r.fail ? `, ${r.fail} failed` : ""}${r.skipped ? ` (skipped: ${r.skipped})` : ""}`);
  }
  const failed = results.reduce((n, r) => n + r.fail, 0);
  const passed = results.reduce((n, r) => n + r.pass, 0);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
