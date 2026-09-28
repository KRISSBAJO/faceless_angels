import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

/**
 * Reads from Patvero's Developer API with a workspace key.
 *
 * The API is read-only: this service never writes to Patvero. The key lives
 * only here, on the server. It is sent as a Bearer token and is never logged,
 * returned to a browser, or stored anywhere else. The types below follow
 * the published OpenAPI description (https://www.patvero.com/docs/openapi.json),
 * and each response is checked against them before it is used.
 */

export type PatveroProblem =
  | 'not_configured'
  | 'key_rejected'
  | 'missing_scope'
  | 'rate_limited'
  | 'unexpected_response'
  | 'unavailable';

export class PatveroError extends Error {
  constructor(
    readonly problem: PatveroProblem,
    readonly status: number | null,
  ) {
    super(`Patvero request failed: ${problem}`);
  }
}

// ---- Published schemas (OpenAPI components), only the fields we read.

/** WorkspaceIntegrationWorkspaceDto */
interface WorkspaceDto {
  workspace: {
    id: string;
    name: string;
    slug: string;
    status: 'active' | 'suspended' | 'archived';
  };
  credential: {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
  };
}

/** WorkspaceIntegrationMeetingDto */
interface MeetingDto {
  id: string;
  title: string;
  description: string | null;
  meetingType: 'instant' | 'scheduled' | 'recurring' | 'personal' | 'webinar';
  scheduledStartAt: string | null;
  scheduledDurationMinutes: number;
  timeZone: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
}

/** WorkspaceIntegrationMeetingsDto */
interface MeetingsDto {
  meetings: MeetingDto[];
  count: number;
  workspaceId: string;
}

/** ApiErrorResponseDto */
interface ErrorDto {
  success: false;
  error?: { code?: string; message?: string };
  meta?: { requestId?: string };
}

// Patvero wraps every successful response as { success, data, meta }.
interface Envelope<T> {
  success?: boolean;
  data?: T;
  meta?: { requestId?: string };
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function isWorkspaceDto(v: unknown): v is WorkspaceDto {
  if (!isObject(v) || !isObject(v.workspace) || !isObject(v.credential)) {
    return false;
  }
  const { workspace: w, credential: c } = v;
  return (
    isString(w.id) &&
    isString(w.name) &&
    isString(w.status) &&
    isString(c.name) &&
    Array.isArray(c.scopes) &&
    c.scopes.every(isString)
  );
}

function isMeetingDto(v: unknown): v is MeetingDto {
  return (
    isObject(v) &&
    isString(v.id) &&
    isString(v.title) &&
    isString(v.status) &&
    isString(v.timeZone) &&
    typeof v.scheduledDurationMinutes === 'number' &&
    (v.scheduledStartAt === null || isString(v.scheduledStartAt)) &&
    (v.description === null || isString(v.description))
  );
}

function isMeetingsDto(v: unknown): v is MeetingsDto {
  return (
    isObject(v) &&
    Array.isArray(v.meetings) &&
    v.meetings.every(isMeetingDto) &&
    typeof v.count === 'number' &&
    isString(v.workspaceId)
  );
}

// ---- What the rest of the app uses.

export interface PatveroWorkspace {
  id: string;
  name: string;
  status: string;
  /** The key's own name and scopes. Its prefix and secret are not kept. */
  keyName: string;
  scopes: string[];
}

export interface PatveroMeeting {
  id: string;
  title: string;
  description: string | null;
  type: MeetingDto['meetingType'];
  startsAt: string | null;
  durationMinutes: number;
  timeZone: string;
  status: MeetingDto['status'];
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
    const body = await this.get('/integrations/workspace', isWorkspaceDto);
    return {
      id: body.workspace.id,
      name: body.workspace.name,
      status: body.workspace.status,
      keyName: body.credential.name,
      scopes: body.credential.scopes,
    };
  }

  /** The workspace's meetings, as Patvero lists them (a bounded list). */
  async meetings(): Promise<PatveroMeeting[]> {
    const body = await this.get(
      '/integrations/workspace/meetings',
      isMeetingsDto,
    );
    return body.meetings.map((m) => ({
      id: m.id,
      title: m.title.trim() || 'Untitled meeting',
      description: m.description,
      type: m.meetingType,
      startsAt: m.scheduledStartAt,
      durationMinutes: m.scheduledDurationMinutes,
      timeZone: m.timeZone,
      status: m.status,
    }));
  }

  private async get<T>(
    path: string,
    valid: (data: unknown) => data is T,
  ): Promise<T> {
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
        const envelope = (await res
          .json()
          .catch(() => null)) as Envelope<unknown> | null;
        if (envelope?.success !== true || !valid(envelope.data)) {
          this.log.warn(
            `Patvero's answer for ${path} did not match its published shape` +
              (envelope?.meta?.requestId
                ? ` (request ${envelope.meta.requestId})`
                : ''),
          );
          throw new PatveroError('unexpected_response', res.status);
        }
        this.cache.set(path, { at: Date.now(), value: envelope.data });
        return envelope.data;
      }

      const retry = res.status === 429 || res.status >= 500;
      if (retry && attempt === 0) {
        await pause();
        continue;
      }
      const failure = (await res.json().catch(() => null)) as ErrorDto | null;
      const code = failure?.error?.code;
      const requestId = failure?.meta?.requestId;
      // The error code and request id help Patvero trace it. The message is
      // left out: it is theirs to word, and could change.
      this.log.warn(
        `Patvero answered ${res.status}${code ? ` ${code}` : ''} for ${path}` +
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
