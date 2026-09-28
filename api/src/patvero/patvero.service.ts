import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

/**
 * Reads from Patvero's Developer API with a workspace key.
 *
 * The API is read-only: this service never writes to Patvero. The key lives
 * only here, on the server. It is sent as a Bearer token and is never logged,
 * returned to a browser, or stored anywhere else. Response shapes follow
 * Patvero's integration endpoints (/integrations/workspace and /meetings).
 */

export type PatveroProblem =
  | 'not_configured'
  | 'key_rejected'
  | 'missing_scope'
  | 'rate_limited'
  | 'unavailable';

export class PatveroError extends Error {
  constructor(
    readonly problem: PatveroProblem,
    readonly status: number | null,
  ) {
    super(`Patvero request failed: ${problem}`);
  }
}

export interface PatveroWorkspace {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  /** The key's own name and scopes. Its prefix and secret are not kept. */
  keyName: string | null;
  scopes: string[];
}

export interface PatveroMeeting {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  startsAt: string | null;
  durationMinutes: number | null;
  timeZone: string | null;
  status: string | null;
}

// Patvero wraps every response as { success, data, meta }.
interface Envelope<T> {
  success?: boolean;
  data?: T;
  meta?: { requestId?: string };
}

const TIMEOUT_MS = 5000;
const CACHE_MS = 60_000;

@Injectable()
export class PatveroService {
  private readonly log = new Logger(PatveroService.name);
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  /** True when a key is set. It does not mean the key works. */
  get configured() {
    return Boolean(config.patvero.apiKey);
  }

  async workspace(): Promise<PatveroWorkspace> {
    const body = await this.get<{
      workspace?: {
        id: string;
        name: string;
        slug?: string;
        status?: string;
      };
      credential?: { name?: string; scopes?: string[] };
    }>('/integrations/workspace');
    if (!body?.workspace) throw new PatveroError('unavailable', 200);
    return {
      id: body.workspace.id,
      name: body.workspace.name,
      slug: body.workspace.slug ?? null,
      status: body.workspace.status ?? null,
      keyName: body.credential?.name ?? null,
      scopes: body.credential?.scopes ?? [],
    };
  }

  /** The workspace's meetings, newest first, as Patvero lists them. */
  async meetings(): Promise<PatveroMeeting[]> {
    const body = await this.get<{
      data?: {
        id: string;
        title?: string;
        description?: string | null;
        meetingType?: string;
        scheduledStartAt?: string | null;
        scheduledDurationMinutes?: number | null;
        timeZone?: string | null;
        status?: string;
      }[];
    }>('/integrations/workspace/meetings');
    return (body?.data ?? []).map((m) => ({
      id: m.id,
      title: m.title?.trim() || 'Untitled meeting',
      description: m.description ?? null,
      type: m.meetingType ?? null,
      startsAt: m.scheduledStartAt ?? null,
      durationMinutes: m.scheduledDurationMinutes ?? null,
      timeZone: m.timeZone ?? null,
      status: m.status ?? null,
    }));
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.configured) throw new PatveroError('not_configured', null);

    const cached = this.cache.get(path);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value as T;

    // One retry for a busy or briefly down server, with a little jitter.
    // A rejected key or missing scope is never retried.
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${config.patvero.baseUrl}${path}`, {
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${config.patvero.apiKey}`,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        if (attempt === 0) {
          await pause();
          continue;
        }
        // Only the error's name: its text could echo the request.
        this.log.warn(
          `Could not reach Patvero (${path}): ${(err as Error).name}`,
        );
        throw new PatveroError('unavailable', null);
      }

      if (res.ok) {
        const envelope = (await res.json().catch(() => null)) as Envelope<T> | null;
        if (!envelope?.data) throw new PatveroError('unavailable', res.status);
        this.cache.set(path, { at: Date.now(), value: envelope.data });
        return envelope.data;
      }

      const retry = res.status === 429 || res.status >= 500;
      if (retry && attempt === 0) {
        await pause();
        continue;
      }
      const requestId = await res
        .json()
        .then((b) => (b as Envelope<unknown> | null)?.meta?.requestId)
        .catch(() => undefined);
      this.log.warn(
        `Patvero answered ${res.status} for ${path}` +
          (requestId ? ` (request ${requestId})` : ''),
      );
      throw new PatveroError(
        res.status === 401
          ? 'key_rejected'
          : res.status === 403
            ? 'missing_scope'
            : res.status === 429
              ? 'rate_limited'
              : 'unavailable',
        res.status,
      );
    }
  }
}

function pause() {
  return new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 400));
}
