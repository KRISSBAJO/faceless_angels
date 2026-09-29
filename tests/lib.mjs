// Shared helpers for the end-to-end tests. See tests/README.md.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = (process.env.TEST_SITE_URL ?? "http://localhost:3230").replace(/\/$/, "");
export const WEB = `${SITE}/api`;
export const API = (process.env.TEST_API_URL ?? "http://127.0.0.1:4010").replace(/\/$/, "");
export const ENV_FILE = join(ROOT, ".env.test.local");

export function readEnv() {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

/** Counts results for one suite and prints each line. */
export function checker(suite) {
  const counts = { pass: 0, fail: 0 };
  const check = (name, ok, extra = "") => {
    if (ok) counts.pass++;
    else counts.fail++;
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${extra && !ok ? ` — ${extra}` : ""}`);
  };
  return { suite, counts, check };
}

export async function signIn(email, password) {
  const r = await fetch(`${WEB}/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`Could not sign in as ${email} (${r.status}). Run tests/setup.mjs.`);
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

/** JSON request through the website's /api, as a browser would. */
export async function j(path, opts = {}) {
  const r = await fetch(`${WEB}${path}`, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
    // No body.
  }
  return { status: r.status, body, headers: r.headers };
}

export function compose(args, options = {}) {
  return execSync(`docker compose ${args}`, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
}

/** The API's log since a moment. Mail in tests is logged, not sent. */
export function apiLogs(sinceIso) {
  return compose(`logs api --since ${sinceIso}`);
}

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** A 4×4 PNG, for uploads. */
export function png(width = 4, height = 4) {
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = (x * 255) / width;
      row[2 + x * 3] = (y * 255) / height;
      row[3 + x * 3] = 180;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

