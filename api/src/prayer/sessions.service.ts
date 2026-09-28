import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { PrayerGroupsService } from './groups.service';
import { checkMeetingLink, PROVIDERS } from './meeting-providers';
import { SessionDto } from './prayer.dto';
import { isPrayerModerator } from './prayer.shared';

const REMINDER_MINUTES = 60;
const REMINDER_CHECK_MS = 5 * 60 * 1000;
// The join link opens shortly before the start and closes when the session ends.
const JOIN_OPENS_MINUTES = 30;

interface SessionRow {
  id: string;
  group_id: string;
  group_name: string;
  host_id: string;
  host_name: string;
  series_id: string | null;
  title: string;
  starts_at: Date;
  timezone: string;
  duration_minutes: number;
  capacity: number | null;
  provider: string | null;
  url: string | null;
  place: string | null;
  notes: string | null;
  cancelled_at: Date | null;
  attending: number;
  i_attend: boolean;
}

// $1 is always the viewer's id.
const SESSION_SQL = `
  select s.*, g.name as group_name, h.full_name as host_name,
         (select count(*)::int from prayer_session_attendees a
          where a.session_id = s.id) as attending,
         exists(select 1 from prayer_session_attendees a
                where a.session_id = s.id and a.user_id = $1) as i_attend
  from prayer_sessions s
  join prayer_groups g on g.id = s.group_id
  join users h on h.id = s.host_id`;

function view(row: SessionRow, viewer: SessionUser) {
  const provider = PROVIDERS.find((p) => p.key === row.provider);
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    title: row.title,
    startsAt: row.starts_at,
    timezone: row.timezone,
    durationMinutes: row.duration_minutes,
    // Hosts are named in full: they are accountable for the session.
    host: row.host_name,
    isHost: row.host_id === viewer.id,
    inSeries: row.series_id !== null,
    capacity: row.capacity,
    attending: row.attending,
    full: row.capacity !== null && row.attending >= row.capacity,
    iAttend: row.i_attend,
    online: row.url !== null,
    providerName: provider?.name ?? null,
    place: row.place,
    notes: row.notes,
    cancelled: row.cancelled_at !== null,
    // The link itself is never in a list. It is asked for one session at a time.
  };
}

@Injectable()
export class PrayerSessionsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrayerSessionsService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly groups: PrayerGroupsService,
  ) {}

  onModuleInit() {
    const run = () =>
      this.sendReminders().catch((err) =>
        this.log.error(`Reminders failed: ${String(err)}`),
      );
    // Once soon after start, so a restart does not skip a reminder.
    setTimeout(run, 15_000).unref();
    this.timer = setInterval(run, REMINDER_CHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  providers() {
    return PROVIDERS.map((p) => ({ key: p.key, name: p.name }));
  }

  async forGroup(viewer: SessionUser, groupId: string) {
    await this.groups.requireMember(this.db, viewer, groupId);
    const found = await this.db.query<SessionRow>(
      `${SESSION_SQL}
       where s.group_id = $2
         and s.starts_at + make_interval(mins => s.duration_minutes) > now()
       order by s.starts_at limit 60`,
      [viewer.id, groupId],
    );
    return found.rows.map((row) => view(row, viewer));
  }

  /** Coming sessions across every group I belong to. */
  async upcoming(viewer: SessionUser) {
    const found = await this.db.query<SessionRow>(
      `${SESSION_SQL}
       join prayer_group_members me
         on me.group_id = s.group_id and me.user_id = $1
        and me.status = 'active'
       where g.status = 'active' and s.cancelled_at is null
         and s.starts_at + make_interval(mins => s.duration_minutes) > now()
       order by s.starts_at limit 30`,
      [viewer.id],
    );
    return found.rows.map((row) => view(row, viewer));
  }

  async create(user: SessionUser, groupId: string, dto: SessionDto) {
    const group = await this.groups.find(this.db, user, groupId);
    // Only approved hosts make sessions: leaders of an approved group.
    this.groups.requireLeader(group, user);
    if (group.status !== 'active') {
      throw new ConflictException(
        'Sessions can be scheduled once the group is approved.',
      );
    }
    const link = checkMeetingLink(dto.provider, dto.url);
    const place = dto.place?.trim() || null;
    if (!link.url && !place) {
      throw new BadRequestException(
        'Add a join link, or say where the group meets in person.',
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dto.startsLocal)) {
      throw new BadRequestException('Enter the date and time.');
    }

    const weeks = dto.weeks ?? 1;
    const seriesId = weeks > 1 ? randomUUID() : null;
    const created = await this.db.tx(async (client) => {
      const inserted = await client.query<{ id: string; starts_at: Date }>(
        // The local time is read in the session's own time zone, week by
        // week, so a series keeps its clock time across daylight saving.
        `insert into prayer_sessions
           (group_id, host_id, series_id, title, starts_at, timezone,
            duration_minutes, capacity, provider, url, place, notes,
            created_by)
         select $1, $2, $3, $4,
                ($5::timestamp + make_interval(weeks => n::int))
                  at time zone $6::text,
                $6::text, $7, $8, $9, $10, $11, $12, $2
         from generate_series(0, $13::int - 1) as n
         returning id, starts_at`,
        [
          groupId,
          user.id,
          seriesId,
          dto.title.trim(),
          dto.startsLocal,
          dto.timezone,
          dto.durationMinutes,
          dto.capacity ?? null,
          link.provider,
          link.url,
          place,
          dto.notes?.trim() || null,
          weeks,
        ],
      );
      if (inserted.rows.some((s) => s.starts_at.getTime() < Date.now())) {
        throw new BadRequestException('Choose a time in the future.');
      }
      await this.audit.record(client, {
        actorId: user.id,
        action: 'prayer_session.created',
        objectType: 'prayer_group',
        objectId: groupId,
        newState: `${weeks} session${weeks === 1 ? '' : 's'}`,
        reason: dto.title.trim(),
      });
      return inserted.rows;
    });
    return { created: created.length };
  }

  async attend(user: SessionUser, sessionId: string, on: boolean) {
    const row = await this.find(user, sessionId);
    if (!on) {
      await this.db.query(
        `delete from prayer_session_attendees
         where session_id = $1 and user_id = $2`,
        [sessionId, user.id],
      );
      return;
    }
    if (row.cancelled_at) {
      throw new ConflictException('This session was cancelled.');
    }
    await this.db.tx(async (client) => {
      // Holds the session so two people cannot take the last place.
      await client.query(
        'select 1 from prayer_sessions where id = $1 for update',
        [sessionId],
      );
      const taken = await client.query<{ n: number }>(
        `select count(*)::int as n from prayer_session_attendees
         where session_id = $1 and user_id <> $2`,
        [sessionId, user.id],
      );
      if (row.capacity !== null && taken.rows[0].n >= row.capacity) {
        throw new ConflictException('This session is full.');
      }
      await client.query(
        `insert into prayer_session_attendees (session_id, user_id, consent_at)
         values ($1, $2, now()) on conflict do nothing`,
        [sessionId, user.id],
      );
    });
  }

  /** Gives the join link to someone who said they are coming, near the start. */
  async joinLink(user: SessionUser, sessionId: string) {
    const row = await this.find(user, sessionId);
    if (row.cancelled_at) {
      throw new ConflictException('This session was cancelled.');
    }
    if (!row.url) {
      throw new NotFoundException('This session meets in person.');
    }
    if (!row.i_attend && row.host_id !== user.id) {
      throw new ForbiddenException(
        'Say you are coming first. Then the join link opens for you.',
      );
    }
    const start = row.starts_at.getTime();
    const opens = start - JOIN_OPENS_MINUTES * 60_000;
    const closes = start + row.duration_minutes * 60_000;
    if (Date.now() > closes) {
      throw new ConflictException('This session has ended.');
    }
    if (Date.now() < opens && row.host_id !== user.id) {
      throw new ConflictException(
        `The join link opens ${JOIN_OPENS_MINUTES} minutes before the start.`,
      );
    }
    return { url: row.url, providerName: view(row, user).providerName };
  }

  async attendees(user: SessionUser, sessionId: string) {
    const row = await this.find(user, sessionId);
    if (row.host_id !== user.id) {
      const group = await this.groups.find(this.db, user, row.group_id);
      this.groups.requireLeader(group, user);
    }
    // Everyone listed agreed the host may see that they plan to come.
    const found = await this.db.query<{ full_name: string }>(
      `select u.full_name from prayer_session_attendees a
       join users u on u.id = a.user_id
       where a.session_id = $1 order by a.created_at`,
      [sessionId],
    );
    return found.rows.map((a) => a.full_name);
  }

  async cancel(user: SessionUser, sessionId: string, wholeSeries: boolean) {
    const row = await this.find(user, sessionId);
    const group = await this.groups.find(this.db, user, row.group_id);
    this.groups.requireLeader(group, user);

    const cancelled = await this.db.tx(async (client) => {
      const updated = await client.query<{ id: string }>(
        `update prayer_sessions set cancelled_at = now()
         where cancelled_at is null and starts_at > now()
           and (id = $1 or ($2 and series_id = $3 and starts_at >= $4))
         returning id`,
        [sessionId, wholeSeries && row.series_id !== null, row.series_id, row.starts_at],
      );
      if (updated.rowCount === 0) {
        throw new ConflictException(
          'This session already started or was cancelled.',
        );
      }
      await this.audit.record(client, {
        actorId: user.id,
        action: 'prayer_session.cancelled',
        objectType: 'prayer_group',
        objectId: row.group_id,
        newState: `${updated.rowCount} cancelled`,
        reason: row.title,
      });
      return updated.rows.map((s) => s.id);
    });

    const people = await this.db.query<{ email: string; full_name: string }>(
      `select distinct u.email, u.full_name
       from prayer_session_attendees a join users u on u.id = a.user_id
       where a.session_id = any($1) and a.user_id <> $2`,
      [cancelled, user.id],
    );
    for (const person of people.rows) {
      await this.mail.send({
        to: person.email,
        subject: `Cancelled: ${row.title}`,
        paragraphs: [
          `Hello ${person.full_name},`,
          `${row.group_name} cancelled "${row.title}".`,
        ],
        action: {
          label: 'See coming sessions',
          url: `${config.webUrl}/prayer/groups/${row.group_id}`,
        },
      });
    }
    return { cancelled: cancelled.length };
  }

  /** Emails people who said they are coming, about an hour before. */
  async sendReminders() {
    const due = await this.db.query<{
      id: string;
      group_id: string;
      title: string;
      group_name: string;
      starts_at: Date;
      timezone: string;
    }>(
      // Claiming the rows in the same statement keeps two API processes
      // from both sending the same reminder.
      `update prayer_sessions s set reminder_sent_at = now()
       from prayer_groups g
       where g.id = s.group_id and s.reminder_sent_at is null
         and s.cancelled_at is null and s.starts_at > now()
         and s.starts_at <= now() + make_interval(mins => $1)
       returning s.id, s.group_id, s.title, g.name as group_name,
                 s.starts_at, s.timezone`,
      [REMINDER_MINUTES],
    );
    for (const session of due.rows) {
      const when = session.starts_at.toLocaleString('en-US', {
        timeZone: session.timezone,
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
      const people = await this.db.query<{ email: string; full_name: string }>(
        `select u.email, u.full_name from prayer_session_attendees a
         join users u on u.id = a.user_id
         where a.session_id = $1 and u.status = 'active'`,
        [session.id],
      );
      for (const person of people.rows) {
        await this.mail.send({
          to: person.email,
          subject: `Starting soon: ${session.title}`,
          paragraphs: [
            `Hello ${person.full_name},`,
            `${session.group_name} meets to pray ${when}.`,
            'The join link is on the group page. It opens 30 minutes before the start.',
          ],
          action: {
            label: 'Open the group',
            url: `${config.webUrl}/prayer/groups/${session.group_id}`,
          },
          idempotencyKey: `session-reminder-${session.id}-${person.email}`,
        });
      }
    }
    return due.rows.length;
  }

  // A session in a group the viewer does not belong to reads as missing.
  private async find(viewer: SessionUser, sessionId: string) {
    const found = await this.db.query<SessionRow>(
      `${SESSION_SQL} where s.id = $2`,
      [viewer.id, sessionId],
    );
    const row = found.rows[0];
    const missing = new NotFoundException('We could not find that session.');
    if (!row) throw missing;
    if (isPrayerModerator(viewer)) return row;
    try {
      await this.groups.requireMember(this.db, viewer, row.group_id);
    } catch {
      throw missing;
    }
    return row;
  }
}
