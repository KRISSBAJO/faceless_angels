import type { NextRequest } from "next/server";
import { apiOrigin } from "@/lib/api-origin";

/**
 * Passes /api/* to the API. The API sets the session cookie, so the browser
 * must reach it on this site's own address. A rewrite in next.config would
 * fix the API address when the site is built; this reads it when it runs.
 */

// Headers that belong to one connection and must not be passed on.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

/**
 * The visitor's address, for the API's rate limits. CLIENT_IP_HEADER names a
 * header the host sets and visitors cannot forge. Without it, the first
 * address in X-Forwarded-For is used.
 */
function clientIp(request: NextRequest) {
  const named = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (named) {
    const value = request.headers.get(named)?.split(",")[0]?.trim();
    if (value) return value;
  }
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

async function forward(
  request: NextRequest,
  { params }: RouteContext<"/api/[...path]">,
) {
  const { path } = await params;
  const target = new URL(
    `/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
    apiOrigin(),
  );

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key) && !key.startsWith("x-forwarded-")) {
      headers.set(key, value);
    }
  });
  const ip = clientIp(request);
  if (ip) headers.set("x-forwarded-for", ip);
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
  headers.set("x-forwarded-host", request.nextUrl.host);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      cache: "no-store",
      // Streams the upload instead of holding it in memory.
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch {
    return Response.json(
      { message: "The service is not answering. Please try again shortly." },
      { status: 502 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (
      HOP_BY_HOP.has(key) ||
      key === "set-cookie" ||
      // fetch has already undone any compression, so the size has changed.
      key === "content-encoding" ||
      key === "content-length"
    ) {
      return;
    }
    out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    out.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export const dynamic = "force-dynamic";

export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
  forward as HEAD,
  forward as OPTIONS,
};
