/** Tells the host the website is up, without depending on the API. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
