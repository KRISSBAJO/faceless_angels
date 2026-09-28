import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService, Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import {
  AnsweredDto,
  CreatePrayerDto,
  EditPrayerDto,
} from './prayer.dto';
import {
  canModerateGroup,
  CRISIS_RESOURCES,
  displayName,
  isActiveMember,
  isPrayerModerator,
  isPrayerTeam,
  mayNeedCare,
  membership,
} from './prayer.shared';

const AUTO_HIDE_AFTER_REPORTS = 3;

export interface RequestRow {
  id: string;
  author_id: string;
  author_name: string;
  author_email: string;
  body: string;
  audience: string;
  group_id: string | null;
  group_name: string | null;
  show_name: boolean;
  allow_responses: boolean;
  allow_forward: boolean;
  allow_follow: boolean;
  status: string;
  needs_care: boolean;
  expires_at: Date;
  forwarded_at: Date | null;
  testimony: string | null;
  testimony_status: string | null;
  moderation_note: string | null;
  answered_at: Date | null;
  edited_at: Date | null;
  created_at: Date;
  i_prayed: boolean;
  i_follow: boolean;
  prayed_count: number;
}

// $1 is always the viewer's id.
export const REQUEST_SQL = `
  select r.*, u.full_name as author_name, u.email as author_email,
         g.name as group_name,
         exists(select 1 from prayer_supports s
                where s.request_id = r.id and s.user_id = $1) as i_prayed,
         exists(select 1 from prayer_follows f
                where f.request_id = r.id and f.user_id = $1) as i_follow,
         (select count(*)::int from prayer_supports s
          where s.request_id = r.id) as prayed_count
  from prayer_requests r
  join users u on u.id = r.author_id
  left join prayer_groups g on g.id = r.group_id`;

const NOT_BLOCKED = `not exists (select 1 from prayer_blocks b
  where b.blocker_id = $1 and b.blocked_id = r.author_id)`;

/** What one person may see of a request. The count of prayers is the author's alone. */
export function viewRequest(
  row: RequestRow,
  viewer: SessionUser,
  options: { staff?: boolean } = {},
) {
  const mine = row.author_id === viewer.id;
  return {
    id: row.id,
    body: row.body,
    audience: row.audience,
    groupId: row.group_id,
    groupName: row.group_name,
    // The prayer team sees a first name so they can pray for a person.
    by:
      row.show_name || options.staff || mine
        ? displayName(row.author_name)
        : null,
    mine,
    status: row.status,
    at: row.created_at,
    editedAt: row.edited_at,
    expiresAt: row.expires_at,
    ended: row.expires_at.getTime() < Date.now(),
    allowResponses: row.allow_responses,
    allowFollow: row.allow_follow,
    iPrayed: row.i_prayed,
    iFollow: row.i_follow,
    answeredAt: row.answered_at,
    testimony:
      mine || row.testimony_status === 'approved' ? row.testimony : null,
    ...(options.staff
      ? { needsCare: row.needs_care, forwarded: row.forwarded_at !== null }
      : {}),
    ...(mine
      ? {
          showName: row.show_name,
          allowForward: row.allow_forward,
          prayedCount: row.prayed_count,
          testimonyStatus: row.testimony_status,
          moderationNote: row.moderation_note,
          help: row.needs_care ? CRISIS_RESOURCES : null,
        }
      : {}),
  };
}

@Injectable()
export class PrayerRequestsService {
  constructor(
    private readonly db: DbService,
    private readonly mail: MailService,
  ) {}

  async network(viewer: SessionUser) {
    const found = await this.db.query<RequestRow>(
      `${REQUEST_SQL}
       where r.audience = 'network' and r.status = 'active'
         and r.expires_at > now() and ${NOT_BLOCKED}
       order by r.created_at desc limit 60`,
      [viewer.id],
    );
    return found.rows.map((row) => viewRequest(row, viewer));
  }

  async groupWall(viewer: SessionUser, groupId: string) {
    const found = await this.db.query<RequestRow>(
      `${REQUEST_SQL}
       where r.audience = 'group' and r.group_id = $2
         and r.status in ('active', 'answered')
         and r.expires_at > now() and ${NOT_BLOCKED}
       order by r.created_at desc limit 60`,
      [viewer.id, groupId],
    );
    return found.rows.map((row) => viewRequest(row, viewer));
  }

  /** Published only after the author asked and a moderator agreed. */
  async testimonies() {
    const found = await this.db.query<{
      id: string;
      body: string;
      testimony: string;
      answered_at: Date;
    }>(
      `select id, body, testimony, answered_at from prayer_requests
       where testimony_status = 'approved' and status = 'answered'
       order by answered_at desc limit 30`,
    );
    return found.rows.map((t) => ({
      id: t.id,
      request: t.body,
      testimony: t.testimony,
      at: t.answered_at,
    }));
  }

  async mine(viewer: SessionUser) {
    const found = await this.db.query<RequestRow>(
      `${REQUEST_SQL}
       where r.author_id = $1 and r.status <> 'withdrawn'
       order by r.created_at desc limit 100`,
      [viewer.id],
    );
    return found.rows.map((row) => viewRequest(row, viewer));
  }

  async create(user: SessionUser, dto: CreatePrayerDto) {
    const shared = dto.audience === 'group' || dto.audience === 'network';
    if (shared && !user.emailVerified) {
      throw new ForbiddenException({
        message: 'Confirm your email before you share a request with others.',
        code: 'email_not_verified',
      });
    }
    if (dto.audience === 'group') {
      const group = await this.db.query(
        `select 1 from prayer_groups where id = $1 and status = 'active'`,
        [dto.groupId],
      );
      const member = await membership(this.db, dto.groupId!, user.id);
      if (group.rowCount === 0 || !isActiveMember(member)) {
        throw new ForbiddenException('Choose a group you belong to.');
      }
    }

    const body = dto.body.trim();
    const inserted = await this.db.query<{ id: string }>(
      `insert into prayer_requests
         (author_id, body, audience, group_id, show_name, allow_responses,
          allow_forward, allow_follow, status, needs_care, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               now() + make_interval(days => $11))
       returning id`,
      [
        user.id,
        body,
        dto.audience,
        dto.audience === 'group' ? dto.groupId : null,
        dto.showName ?? false,
        dto.audience === 'personal' ? false : (dto.allowResponses ?? true),
        dto.allowForward ?? false,
        dto.audience === 'personal' ? false : (dto.allowFollow ?? true),
        // Anything the whole network can read waits for a moderator.
        dto.audience === 'network' ? 'pending' : 'active',
        mayNeedCare(body),
        dto.days ?? 30,
      ],
    );
    return this.get(user, inserted.rows[0].id);
  }

  async get(viewer: SessionUser, id: string) {
    const row = await this.visible(this.db, viewer, id);
    const staff = row.author_id !== viewer.id && (await this.isStaffFor(row, viewer));
    const responses = await this.db.query<{
      id: string;
      author_id: string;
      author_name: string;
      body: string;
      status: string;
      created_at: Date;
    }>(
      `select p.id, p.author_id, u.full_name as author_name, p.body,
              p.status, p.created_at
       from prayer_responses p join users u on u.id = p.author_id
       where p.request_id = $2
         and (p.status = 'active' or (p.status = 'pending' and p.author_id = $1))
         and not exists (select 1 from prayer_blocks b
                         where b.blocker_id = $1 and b.blocked_id = p.author_id)
       order by p.created_at`,
      [viewer.id, id],
    );
    return {
      ...viewRequest(row, viewer, { staff }),
      canForward:
        row.audience === 'group' &&
        row.allow_forward &&
        row.forwarded_at === null &&
        row.author_id !== viewer.id &&
        canModerateGroup(await membership(this.db, row.group_id!, viewer.id)),
      responses: responses.rows.map((p) => ({
        id: p.id,
        by: displayName(p.author_name),
        mine: p.author_id === viewer.id,
        fromAuthor: p.author_id === row.author_id,
        body: p.body,
        waiting: p.status === 'pending',
        at: p.created_at,
      })),
    };
  }

  async edit(user: SessionUser, id: string, dto: EditPrayerDto) {
    const row = await this.own(this.db, user, id);
    if (!['active', 'pending', 'hidden'].includes(row.status)) {
      throw new ConflictException('This request can no longer be changed.');
    }
    const body = dto.body?.trim();
    const changedText = body !== undefined && body !== row.body;
    // New words on the network wall go back to a moderator first.
    const status =
      changedText && row.audience === 'network' ? 'pending' : row.status;
    await this.db.query(
      `update prayer_requests
       set body = $2, show_name = $3, allow_responses = $4,
           allow_forward = $5, allow_follow = $6, status = $7,
           needs_care = $8,
           edited_at = case when $9 then now() else edited_at end
       where id = $1`,
      [
        id,
        body ?? row.body,
        dto.showName ?? row.show_name,
        dto.allowResponses ?? row.allow_responses,
        dto.allowForward ?? row.allow_forward,
        dto.allowFollow ?? row.allow_follow,
        status,
        mayNeedCare(body ?? row.body),
        changedText,
      ],
    );
    return this.get(user, id);
  }

  /** Withdrawing removes the words themselves, not only the listing. */
  async withdraw(user: SessionUser, id: string) {
    await this.own(this.db, user, id);
    await this.db.tx(async (client) => {
      await client.query(
        `update prayer_requests
         set status = 'withdrawn', body = '', testimony = null,
             testimony_status = null
         where id = $1`,
        [id],
      );
      await client.query(
        `update prayer_responses set status = 'hidden', body = ''
         where request_id = $1`,
        [id],
      );
      await client.query('delete from prayer_follows where request_id = $1', [
        id,
      ]);
    });
  }

  async prayed(user: SessionUser, id: string, on: boolean) {
    const row = await this.visible(this.db, user, id);
    if (row.author_id === user.id) return;
    await this.db.query(
      on
        ? `insert into prayer_supports (request_id, user_id) values ($1, $2)
           on conflict do nothing`
        : 'delete from prayer_supports where request_id = $1 and user_id = $2',
      [id, user.id],
    );
  }

  async follow(user: SessionUser, id: string, on: boolean) {
    const row = await this.visible(this.db, user, id);
    if (row.author_id === user.id) return;
    if (on && !row.allow_follow) {
      throw new ForbiddenException(
        'The person who wrote this asked not to be followed.',
      );
    }
    await this.db.query(
      on
        ? `insert into prayer_follows (request_id, user_id) values ($1, $2)
           on conflict do nothing`
        : 'delete from prayer_follows where request_id = $1 and user_id = $2',
      [id, user.id],
    );
  }

  async respond(user: SessionUser, id: string, body: string) {
    const row = await this.visible(this.db, user, id);
    const mine = row.author_id === user.id;
    if (!row.allow_responses && !mine) {
      throw new ForbiddenException(
        'The person who wrote this asked for prayer only, without replies.',
      );
    }
    if (row.status !== 'active') {
      throw new ConflictException('This request is closed to new replies.');
    }
    if (!user.emailVerified) {
      throw new ForbiddenException({
        message: 'Confirm your email before you reply.',
        code: 'email_not_verified',
      });
    }
    const blocked = await this.db.query(
      `select 1 from prayer_blocks
       where blocker_id = $1 and blocked_id = $2`,
      [row.author_id, user.id],
    );
    if (blocked.rowCount !== 0) {
      // Says nothing about the block, so the author is not exposed.
      throw new ForbiddenException('You cannot reply to this request.');
    }
    const waits = row.audience === 'network' && !mine;
    await this.db.query(
      `insert into prayer_responses (request_id, author_id, body, status)
       values ($1, $2, $3, $4)`,
      [id, user.id, body.trim(), waits ? 'pending' : 'active'],
    );
    return { waiting: waits };
  }

  async answered(user: SessionUser, id: string, dto: AnsweredDto) {
    const row = await this.own(this.db, user, id);
    if (row.status !== 'active' && row.status !== 'pending') {
      throw new ConflictException('This request is already closed.');
    }
    const testimony = dto.testimony?.trim() || null;
    await this.db.query(
      `update prayer_requests
       set status = 'answered', answered_at = now(), testimony = $2,
           testimony_status = $3
       where id = $1`,
      [id, testimony, testimony && dto.publish ? 'pending' : null],
    );

    const followers = await this.db.query<{ email: string; full_name: string }>(
      `select u.email, u.full_name from prayer_follows f
       join users u on u.id = f.user_id
       where f.request_id = $1 and u.status = 'active'`,
      [id],
    );
    for (const follower of followers.rows) {
      await this.mail.send({
        to: follower.email,
        subject: 'A prayer you follow was answered',
        paragraphs: [
          `Hello ${follower.full_name},`,
          'Someone you prayed for has marked their request as answered. Thank you for praying.',
        ],
        action: {
          label: 'Open the request',
          url: `${config.webUrl}/prayer/requests/${id}`,
        },
      });
    }
    return this.get(user, id);
  }

  async forward(user: SessionUser, id: string) {
    const row = await this.visible(this.db, user, id);
    const member = row.group_id
      ? await membership(this.db, row.group_id, user.id)
      : null;
    if (row.audience !== 'group' || !canModerateGroup(member)) {
      throw new ForbiddenException(
        'Only an admin or moderator of the group can pass a request on.',
      );
    }
    if (!row.allow_forward) {
      throw new ForbiddenException(
        'The person who wrote this did not allow it to be passed on.',
      );
    }
    const updated = await this.db.query(
      `update prayer_requests set forwarded_at = now(), forwarded_by = $2
       where id = $1 and forwarded_at is null`,
      [id, user.id],
    );
    if (updated.rowCount === 0) {
      throw new ConflictException('This request was already passed on.');
    }
  }

  async report(
    user: SessionUser,
    type: 'request' | 'response',
    id: string,
    category: string,
    reason: string,
  ) {
    const target = await this.target(user, type, id);
    if (target.authorId === user.id) {
      throw new BadRequestException('You cannot report your own words.');
    }
    await this.db.tx(async (client) => {
      const inserted = await client.query(
        `insert into prayer_reports
           (target_type, target_id, group_id, reporter_id, category, reason)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (target_type, target_id, reporter_id) do nothing`,
        [type, id, target.groupId, user.id, category, reason.trim()],
      );
      if (inserted.rowCount === 0) {
        throw new ConflictException('You already reported this.');
      }
      const open = await client.query<{ n: number }>(
        `select count(*)::int as n from prayer_reports
         where target_type = $1 and target_id = $2 and resolved_at is null`,
        [type, id],
      );
      // Several people reporting the same thing hides it until someone looks.
      if (open.rows[0].n >= AUTO_HIDE_AFTER_REPORTS) {
        await client.query(
          type === 'request'
            ? `update prayer_requests set status = 'hidden',
                 moderation_note = 'Hidden while we look at reports.'
               where id = $1 and status = 'active'`
            : `update prayer_responses set status = 'hidden'
               where id = $1 and status = 'active'`,
          [id],
        );
      }
    });
  }

  async block(user: SessionUser, type: 'request' | 'response', id: string) {
    const target = await this.target(user, type, id);
    if (target.authorId === user.id) {
      throw new BadRequestException('You cannot block yourself.');
    }
    await this.db.query(
      `insert into prayer_blocks (blocker_id, blocked_id) values ($1, $2)
       on conflict do nothing`,
      [user.id, target.authorId],
    );
  }

  async blocks(user: SessionUser) {
    const found = await this.db.query<{ n: number }>(
      'select count(*)::int as n from prayer_blocks where blocker_id = $1',
      [user.id],
    );
    return { blocked: found.rows[0].n };
  }

  async clearBlocks(user: SessionUser) {
    await this.db.query('delete from prayer_blocks where blocker_id = $1', [
      user.id,
    ]);
  }

  /** The author and group of something the viewer is allowed to see. */
  private async target(
    user: SessionUser,
    type: 'request' | 'response',
    id: string,
  ) {
    if (type === 'request') {
      const row = await this.visible(this.db, user, id);
      return { authorId: row.author_id, groupId: row.group_id };
    }
    const found = await this.db.query<{
      request_id: string;
      author_id: string;
    }>('select request_id, author_id from prayer_responses where id = $1', [
      id,
    ]);
    if (!found.rows[0]) throw new NotFoundException('We could not find that.');
    const request = await this.visible(this.db, user, found.rows[0].request_id);
    return { authorId: found.rows[0].author_id, groupId: request.group_id };
  }

  // A personal request is never open to staff, whatever their role.
  private async isStaffFor(row: RequestRow, viewer: SessionUser) {
    if (row.audience === 'personal') return false;
    if (row.audience === 'team' || row.forwarded_at !== null) {
      return isPrayerTeam(viewer);
    }
    if (!isPrayerModerator(viewer)) return false;
    // Moderators approve what goes on the network wall. Inside a group they
    // see only a request that suggests someone may be in danger.
    return row.audience === 'network' || row.needs_care;
  }

  private async own(client: Queryable, user: SessionUser, id: string) {
    const found = await client.query<RequestRow>(
      `${REQUEST_SQL} where r.id = $2 and r.author_id = $1
         and r.status <> 'withdrawn'`,
      [user.id, id],
    );
    if (!found.rows[0]) {
      throw new NotFoundException('We could not find that prayer request.');
    }
    return found.rows[0];
  }

  // A request the viewer may not see reads as missing.
  async visible(client: Queryable, viewer: SessionUser, id: string) {
    const found = await client.query<RequestRow>(
      `${REQUEST_SQL} where r.id = $2 and r.status <> 'withdrawn'`,
      [viewer.id, id],
    );
    const row = found.rows[0];
    const missing = new NotFoundException(
      'We could not find that prayer request.',
    );
    if (!row) throw missing;
    if (row.author_id === viewer.id) return row;
    if (await this.isStaffFor(row, viewer)) return row;

    const shown = row.status === 'active' || row.status === 'answered';
    if (!shown) throw missing;
    if (row.audience === 'network') return row;
    if (
      row.audience === 'group' &&
      isActiveMember(await membership(client, row.group_id!, viewer.id))
    ) {
      return row;
    }
    throw missing;
  }
}
