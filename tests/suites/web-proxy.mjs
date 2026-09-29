// The website passes /api to the API: cookies, errors, uploads, pictures.
import { png, SITE, WEB } from "../lib.mjs";

export const name = "Website to API";

export default async function run({ check, env }) {
  let r = await fetch(`${WEB}/health`);
  check("API health through the website", r.ok);
  r = await fetch(`${SITE}/healthz`);
  check("website health", r.ok && (await r.json()).ok === true);

  r = await fetch(`${WEB}/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: env.TEST_EDITOR_EMAIL, password: env.TEST_EDITOR_PASSWORD }),
  });
  const cookies = r.headers.getSetCookie();
  check("sign-in", r.ok, String(r.status));
  check("session cookie passed on, HttpOnly", cookies.some((c) => c.startsWith("fa_session=") && /httponly/i.test(c)));
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");

  r = await fetch(`${WEB}/auth/me`, { headers: { cookie } });
  check("signed-in user read back", r.ok && (await r.json()).email === env.TEST_EDITOR_EMAIL.toLowerCase());

  r = await fetch(`${WEB}/journal/articles?q=prayer`);
  check("query string passed on", r.status === 200, String(r.status));

  r = await fetch(`${WEB}/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "x" }),
  });
  check("validation error passed on as 400 JSON", r.status === 400 && (await r.json()).message !== undefined);

  const image = png(400, 300);
  const form = new FormData();
  form.set("file", new Blob([image], { type: "image/png" }), "check.png");
  r = await fetch(`${WEB}/journal/studio/media`, { method: "POST", headers: { cookie }, body: form });
  const media = await r.json().catch(() => ({}));
  check("picture upload streams through", r.ok && media.id, `${r.status}`);
  if (media.id) {
    r = await fetch(`${WEB}/journal/media/${media.id}`);
    check("picture served back unchanged", r.ok && Buffer.from(await r.arrayBuffer()).equals(image));
  }

  r = await fetch(`${WEB}/auth/me`);
  check("401 when signed out", r.status === 401);
  r = await fetch(`${WEB}/auth/sign-out`, { method: "POST", headers: { cookie } });
  check("sign-out clears the cookie", r.ok && r.headers.getSetCookie().some((c) => c.startsWith("fa_session=")));

  for (const path of ["/", "/journal", "/journal/articles", "/prayer", "/needs", "/donate", "/transparency", "/privacy", "/terms", "/giving-policy", "/contact", "/sitemap.xml", "/robots.txt"]) {
    const status = await fetch(`${SITE}${path}`).then((x) => x.status);
    check(`page ${path} loads`, status === 200, String(status));
  }
}
