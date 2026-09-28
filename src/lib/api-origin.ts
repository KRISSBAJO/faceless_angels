/**
 * Where the website reaches the API, read when the server runs rather than
 * when it is built. Render gives a private service's address as "host:port"
 * in API_HOSTPORT; API_URL, when set, wins.
 */
export function apiOrigin() {
  const url = process.env.API_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  const hostport = process.env.API_HOSTPORT?.trim();
  if (hostport) return `http://${hostport}`;
  return "http://localhost:4010";
}
