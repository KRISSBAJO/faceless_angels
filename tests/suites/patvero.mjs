// The Patvero client against Patvero's published OpenAPI description:
// answers come from the spec's own examples and are checked against its
// schemas first. Keys here are made up.
import http from "node:http";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "../lib.mjs";

export const name = "Patvero client (published contract)";

const PORT = 47312;
const DIST = join(ROOT, "tests", ".cache", "api-dist", "patvero", "patvero.service.js");

export default async function run({ check, skip }) {
  let spec;
  try {
    const res = await fetch("https://www.patvero.com/docs/openapi.json", { signal: AbortSignal.timeout(20_000) });
    spec = await res.json();
  } catch (err) {
    return skip(`could not download Patvero's OpenAPI file (${err.name})`);
  }

  const resolve = (s) => (s.$ref ? spec.components.schemas[s.$ref.split("/").pop()] : s);
  const example = (s) => {
    s = resolve(s);
    if (s.example !== undefined) return s.example;
    if (s.type === "object" || s.properties) return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, example(v)]));
    if (s.type === "array") return [example(s.items)];
    if (s.type === "string") return s.format === "uuid" ? "00000000-0000-4000-8000-000000000000" : "x";
    if (s.type === "number") return 1;
    if (s.type === "boolean") return true;
    return null;
  };
  const validate = (s, v, path = "$") => {
    s = resolve(s);
    if (v === null) return s.nullable ? [] : [`${path} is null`];
    const errors = [];
    if (s.enum && !s.enum.includes(v)) errors.push(`${path} not in enum`);
    const type = s.type ?? (s.properties ? "object" : undefined);
    if (type === "object") {
      if (typeof v !== "object" || Array.isArray(v)) return [`${path} not object`];
      for (const r of s.required ?? []) if (!(r in v)) errors.push(`${path}.${r} missing`);
      for (const [k, sub] of Object.entries(s.properties ?? {})) if (k in v) errors.push(...validate(sub, v[k], `${path}.${k}`));
    } else if (type === "array") {
      if (!Array.isArray(v)) return [`${path} not array`];
      v.forEach((item, i) => errors.push(...validate(s.items, item, `${path}[${i}]`)));
    } else if (type === "string" && typeof v !== "string") errors.push(`${path} not string`);
    else if (type === "number" && typeof v !== "number") errors.push(`${path} not number`);
    return errors;
  };

  const op = (p) => spec.paths?.[`/api/v1/integrations/workspace${p}`]?.get;
  if (!op("") || !op("/meetings")) {
    check("Patvero still publishes the workspace and meetings endpoints", false);
    return;
  }
  const ok = (p) => op(p).responses["200"].content["application/json"].schema;
  const errSchema = op("").responses["401"].content["application/json"].schema;
  const workspace = example(ok(""));
  const meetings = example(ok("/meetings"));
  meetings.data.meetings.push({ ...meetings.data.meetings[0], id: "11111111-2222-4333-8444-555555555555", title: "Cancelled one", status: "cancelled" });
  meetings.data.count = meetings.data.meetings.length;
  const denied = { ...example(errSchema), success: false };
  denied.error = { ...denied.error, code: "UNAUTHORIZED" };

  check("stand-in workspace answer matches the spec", validate(ok(""), workspace).length === 0);
  check("stand-in meetings answer matches the spec", validate(ok("/meetings"), meetings).length === 0);

  const seen = [];
  const server = http.createServer((req, res) => {
    const key = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    seen.push(req.headers.authorization ?? "");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (!key || key === "pv_live_test_revoked") return send(401, denied);
    if (req.url === "/api/v1/integrations/workspace") return send(200, workspace);
    if (req.url === "/api/v1/integrations/workspace/meetings") {
      if (key === "pv_live_test_oldshape") return send(200, { success: true, data: { data: meetings.data.meetings }, meta: meetings.meta });
      return send(200, meetings);
    }
    send(404, {});
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  const runClient = (key) =>
    new Promise((done) => {
      const code = `
        const { PatveroService, PatveroError } = require(${JSON.stringify(DIST)});
        const p = new PatveroService();
        (async () => {
          const out = {};
          try { out.workspace = await p.workspace(); } catch (e) { out.workspaceError = e instanceof PatveroError ? e.problem : String(e); }
          try { out.meetings = await p.meetings(); } catch (e) { out.meetingsError = e instanceof PatveroError ? e.problem : String(e); }
          console.log('RESULT ' + JSON.stringify(out));
        })();`;
      const child = spawn(process.execPath, ["-e", code], {
        env: {
          ...process.env,
          NODE_PATH: join(ROOT, "api", "node_modules"),
          PATVERO_API_BASE_URL: `http://127.0.0.1:${PORT}/api/v1`,
          PATVERO_API_KEY: key,
        },
      });
      let text = "";
      child.stdout.on("data", (d) => (text += d));
      child.stderr.on("data", (d) => (text += d));
      child.on("close", () => done({ text, r: JSON.parse(/RESULT (.*)/.exec(text)?.[1] ?? "{}") }));
    });

  try {
    const good = await runClient("pv_live_test_good");
    check("key sent as a Bearer token", seen.includes("Bearer pv_live_test_good"));
    check("workspace read from data.workspace", good.r.workspace?.name === workspace.data.workspace.name);
    check("key prefix not kept", !JSON.stringify(good.r).includes(workspace.data.credential.keyPrefix));
    check("meetings read from data.meetings", good.r.meetings?.length === 2);
    check("the key never appears in output", !good.text.includes("pv_live_test_good"));
    const revoked = await runClient("pv_live_test_revoked");
    check("a revoked key reads as key_rejected", revoked.r.workspaceError === "key_rejected");
    check("the error code is logged, never the key", revoked.text.includes("UNAUTHORIZED") && !revoked.text.includes("pv_live_test_revoked"));
    const old = await runClient("pv_live_test_oldshape");
    check("an answer in an unknown shape is refused", old.r.meetingsError === "unexpected_response");
  } finally {
    server.close();
  }
}
