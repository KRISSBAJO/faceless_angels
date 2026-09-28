import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:4010";

/**
 * Reads from the Journal on the server, as the person making the request.
 * Returns null when the article or list is not there.
 */
export async function journal<T>(path: string): Promise<T | null> {
  try {
    // The session cookie goes along so staff can preview unpublished work.
    const session = (await cookies()).get("fa_session");
    const res = await fetch(`${API_URL}/api/journal${path}`, {
      cache: "no-store",
      headers: session ? { cookie: `fa_session=${session.value}` } : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
