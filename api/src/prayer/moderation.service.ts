import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { PrayerGroupsService } from './groups.service';
import {
  GroupDecisionDto,
  GroupStatusDto,
  ModerateDto,
  ReportDto,
} from './prayer.dto';
import {
  canModerateGroup,
  displayName,
  isPrayerModerator,
  membership,
} from './prayer.shared';
import { REQUEST_SQL, RequestRow, viewRequest } from './requests.service';

type TargetType = 'request' | 'response' | 'member' | 'group';

interface ReportRow {
  id: string;
  target_type: TargetType;
  target_id: string;
  group_id: string | null;
  group_name: string | null;
  category: string;
  reason: string;
  created_at: Date;
  text: string | null;
  member_name: string | null;
  request_id: string | null;
  others: number;
}

const REPORT_SQL = `
  select p.id, p.target_type, p.target_id, p.group_id, g.name as group_name,
         p.category, p.reason, p.created_at,
         coalesce(r.body, s.body, g.description) as text,
         m.full_name as member_name,
         coalesce(r.id, s.request_id) as request_id,
         (select count(*)::int from prayer_reports o
          where o.target_type = p.target_type and o.target_id = p.target_id
            and o.resolved_at is null) as others
  from prayer_reports p
  left join prayer_groups g on g.id = p.group_id
  left join prayer_requests r
    on p.target_type = 'request' and r.id = p.target_id
  left join prayer_responses s
    on p.target_type = 'response' and s.id = p.target_id
  left join users m on p.target_type = 'member' and m.id = p.target_id
  where p.resolved_at is null`;

function viewReport(row: ReportRow) {
  return {
    id: row.id,
    kind: row.target_type,
    groupId: row.group_id,
    groupName: row.group_name,
    requestId: row.request_id,
    // A reported member is named in full, so the right person is dealt with.
    memberName: row.member_name,
    text: row.target_type === 'member' ? null : row.text,
    category: row.category,
    reason: row.reason,
    reports: row.others,
    at: row.created_at,
  };
}

@Injectable()
export class PrayerModerationService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly groups: PrayerGroupsService,
  ) {}

  /** Requests written to the prayer team, and group requests passed on to it. */
  async inbox(viewer: SessionUser) {
    const found = await this.db.query<RequestRow>(
      `${REQUEST_SQL}
       where (r.audience = 'team' or r.forwarded_at is not null)
         and r.status = 'active' and r.expires_at > now()
         and r.author_id <> $1
       order by r.needs_care desc, r.created_at desc limit 100`,
      [viewer.id],
    );
    return found.rows.map((row) => viewRequest(row, viewer, { staff: true }));
  }

  async queue(viewer: SessionUser) {
    const [requests, responses, testimonies, groups, reports, care] =
      await Promise.all([
        this.db.query<RequestRow>(
          `${REQUEST_SQL}
           where r.audience = 'network' and r.status = 'pending'
             and r.author_id <> $1
           order by r.needs_care desc, r.created_at limit 100`,
          [viewer.id],
        ),
        this.db.query<{
          id: string;
          request_id: string;
          body: string;
          request_body: string;
          author_name: string;
          created_at: Date;
        }>(
          `select p.id, p.request_id, p.body, r.body as request_body,
                  u.full_name as author_name, p.created_at
           from prayer_responses p
           join prayer_requests r on r.id = p.request_id
           join users u on u.id = p.author_id
           where p.status = 'pending' and p.author_id <> $1
           order by p.created_at limit 100`,
          [viewer.id],
        ),
        this.db.query<{
          id: string;
          body: string;
          testimony: string;
          answered_at: Date;
        }>(
          `select id, body, testimony, answered_at from prayer_requests
           where testimony_status = 'pending' and author_id <> $1
           order by answered_at limit 100`,
          [viewer.id],
        ),
        this.db.query<{
          id: string;
          name: string;
          description: string;
          access: string;
          language: string;
          church: string | null;
          city: string | null;
          region: string | null;
          membership_rules: string | null;
          group_rules: string | null;
          leader: string;
          leader_email: string;
          identity_status: string;
          created_at: Date;
        }>(
          `select g.id, g.name, g.description, g.access, g.language,
                  g.church, g.city, g.region, g.membership_rules,
                  g.group_rules, u.full_name as leader,
                  u.email as leader_email, u.identity_status, g.created_at
           from prayer_groups g join users u on u.id = g.created_by
           where g.status = 'pending' and g.created_by <> $1
           order by g.created_at`,
          [viewer.id],
        ),
        // Site moderators see every open report, whichever group it is in.
        this.db.query<ReportRow>(`${REPORT_SQL} order by p.created_at`),
        this.db.query<RequestRow>(
          `${REQUEST_SQL}
           where r.needs_care and r.audience in ('group', 'network')
             and r.status in ('active', 'pending')
             and r.expires_at > now() and r.author_id <> $1
           order by r.created_at desc limit 50`,
          [viewer.id],
        ),
      ]);
    return {
      requests: requests.rows.map((r) =>
        viewRequest(r, viewer, { staff: true }),
      ),
      responses: responses.rows.map((p) => ({
        id: p.id,
        requestId: p.request_id,
        body: p.body,
        replyingTo: p.request_body,
        by: displayName(p.author_name),
        at: p.created_at,
      })),
      testimonies: testimonies.rows.map((t) => ({
        id: t.id,
        request: t.body,
        testimony: t.testimony,
        at: t.answered_at,
      })),
      groups: groups.rows.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        access: g.access,
        language: g.language,
        church: g.church,
        city: g.city,
        region: g.region,
        membershipRules: g.membership_rules,
        groupRules: g.group_rules,
        leader: g.leader,
        leaderEmail: g.leader_email,
        leaderIdentity: g.identity_status,
        at: g.created_at,
      })),
      reports: reports.rows.map(viewReport),
      mayNeedCare: care.rows.map((r) =>
        viewRequest(r, viewer, { staff: true }),
      ),
    };
  }

  async moderateRequest(user: SessionUser, id: string, dto: ModerateDto) {
    const hide = dto.action === 'hide';
    if (hide && !dto.note?.trim()) {
      throw new BadRequestException(
        'Say why, so the person knows what to change.',
      );
    }
    const updated = await this.db.query<{
      author_id: string;
      email: string;
      full_name: string;
    }>(
      `update prayer_requests r
       set status = $2, moderation_note = $3, moderated_by = $4,
           moderated_at = now()
       from users u
       where r.id = $1 and u.id = r.author_id
         and r.status in ('pending', 'active', 'hidden')
         and r.author_id <> $4
       returning r.author_id, u.email, u.full_name`,
      [id, hide ? 'hidden' : 'active', hide ? dto.note!.trim() : null, user.id],
    );
    const author = updated.rows[0];
    if (!author) {
      throw new NotFoundException('We could not find that prayer request.');
    }
    await this.audit.record(this.db, {
      actorId: user.id,
      action: hide ? 'prayer.hidden' : 'prayer.approved',
      objectType: 'prayer_request',
      objectId: id,
    });
    if (hide) {
      await this.mail.send({
        to: author.email,
        subject: 'Your prayer request was not shared',
        paragraphs: [
          `Hello ${author.full_name},`,
          'A moderator did not share your prayer request with the network.',
          dto.note!.trim(),
          'You can change it and it will be looked at again. The prayer team can still pray for you.',
        ],
        action: {
          label: 'Open my prayer requests',
          url: `${config.webUrl}/prayer/mine`,
        },
      });
    }
  }

  async moderateResponse(user: SessionUser, id: string, dto: ModerateDto) {
    const updated = await this.db.query(
      `update prayer_responses
       set status = $2, moderated_by = $3, moderated_at = now()
       where id = $1 and author_id <> $3`,
      [id, dto.action === 'hide' ? 'hidden' : 'active', user.id],
    );
    if (updated.rowCount === 0) {
      throw new NotFoundException('We could not find that reply.');
    }
  }

  async moderateTestimony(user: SessionUser, id: string, dto: ModerateDto) {
    const updated = await this.db.query(
      `update prayer_requests
       set testimony_status = $2, moderated_by = $3, moderated_at = now()
       where id = $1 and testimony_status = 'pending' and author_id <> $3`,
      [id, dto.action === 'hide' ? 'declined' : 'approved', user.id],
    );
    if (updated.rowCount === 0) {
      throw new ConflictException('This testimony was already looked at.');
    }
    await this.audit.record(this.db, {
      actorId: user.id,
      action:
        dto.action === 'hide' ? 'testimony.declined' : 'testimony.published',
      objectType: 'prayer_request',
      objectId: id,
    });
  }

  async decideGroup(user: SessionUser, id: string, dto: GroupDecisionDto) {
    const approve = dto.action === 'approve';
    if (!approve && !dto.note?.trim()) {
      throw new BadRequestException(
        'Say why, so the person knows what to change.',
      );
    }
    const updated = await this.db.query<{
      name: string;
      email: string;
      full_name: string;
    }>(
      `update prayer_groups g
       set status = $2, approved_by = $3, decline_note = $4,
           updated_at = now()
       from users u
       where g.id = $1 and u.id = g.created_by and g.status = 'pending'
         and g.created_by <> $3
       returning g.name, u.email, u.full_name`,
      [
        id,
        approve ? 'active' : 'closed',
        user.id,
        approve ? null : dto.note!.trim(),
      ],
    );
    const group = updated.rows[0];
    if (!group) {
      throw new ConflictException('This group was already looked at.');
    }
    await this.audit.record(this.db, {
      actorId: user.id,
      action: approve ? 'prayer_group.approved' : 'prayer_group.declined',
      objectType: 'prayer_group',
      objectId: id,
      reason: dto.note?.trim(),
    });
    await this.mail.send({
      to: group.email,
      subject: approve
        ? `${group.name} is approved`
        : `${group.name} was not approved`,
      paragraphs: approve
        ? [
            `Hello ${group.full_name},`,
            `Your prayer group ${group.name} is approved, and you are its admin. You can now invite people, appoint other admins and moderators, and schedule sessions.`,
          ]
        : [
            `Hello ${group.full_name},`,
            `Your prayer group ${group.name} was not approved.`,
            dto.note!.trim(),
          ],
      action: approve
        ? {
            label: 'Open the group',
            url: `${config.webUrl}/prayer/groups/${id}`,
          }
        : undefined,
    });
  }

  // ---- Every group, for site moderators

  async allGroups() {
    const found = await this.db.query<{
      id: string;
      name: string;
      access: string;
      status: string;
      status_note: string | null;
      city: string | null;
      region: string | null;
      created_at: Date;
      members: number;
      admins: string[] | null;
      open_reports: number;
    }>(
      `select g.id, g.name, g.access, g.status, g.status_note, g.city,
              g.region, g.created_at,
              (select count(*)::int from prayer_group_members m
               where m.group_id = g.id and m.status = 'active') as members,
              (select array_agg(u.full_name order by m.joined_at)
               from prayer_group_members m join users u on u.id = m.user_id
               where m.group_id = g.id and m.status = 'active'
                 and m.role = 'leader') as admins,
              (select count(*)::int from prayer_reports p
               where p.group_id = g.id and p.resolved_at is null)
                as open_reports
       from prayer_groups g
       where g.status in ('active', 'suspended')
       order by (g.status = 'suspended') desc, open_reports desc, g.name`,
    );
    return found.rows.map((g) => ({
      id: g.id,
      name: g.name,
      access: g.access,
      status: g.status,
      statusNote: g.status_note,
      city: g.city,
      region: g.region,
      members: g.members,
      admins: g.admins ?? [],
      openReports: g.open_reports,
      since: g.created_at,
    }));
  }

  async setGroupStatus(user: SessionUser, id: string, dto: GroupStatusDto) {
    if (dto.action !== 'reinstate' && !dto.note?.trim()) {
      throw new BadRequestException(
        'Say why. The group’s admins are told the reason.',
      );
    }
    const group = await this.db.tx((client) =>
      this.changeStatus(client, user, id, dto.action, dto.note?.trim()),
    );
    await this.tellAdmins(id, group.name, dto.action, dto.note?.trim());
  }

  private async changeStatus(
    client: PoolClient,
    user: SessionUser,
    id: string,
    action: 'suspend' | 'reinstate' | 'close',
    note: string | undefined,
  ) {
    const from = action === 'reinstate' ? ['suspended'] : ['active', 'suspended'];
    const to =
      action === 'suspend'
        ? 'suspended'
        : action === 'close'
          ? 'closed'
          : 'active';
    const updated = await client.query<{ name: string; was: string }>(
      `update prayer_groups g
       set status = $2, status_note = $3, status_changed_by = $4,
           status_changed_at = now(), updated_at = now()
       from (select id, status as was from prayer_groups
             where id = $1 for update) old
       where g.id = old.id and old.was = any($5) and old.was <> $2
       returning g.name, old.was`,
      [id, to, action === 'reinstate' ? null : note, user.id, from],
    );
    const group = updated.rows[0];
    if (!group) {
      throw new ConflictException('The group is not in a state to do that.');
    }
    await this.audit.record(client, {
      actorId: user.id,
      action: `prayer_group.${action}`,
      objectType: 'prayer_group',
      objectId: id,
      priorState: group.was,
      newState: to,
      reason: note,
    });
    return group;
  }

  private async tellAdmins(
    groupId: string,
    name: string,
    action: 'suspend' | 'reinstate' | 'close',
    note: string | undefined,
  ) {
    const subject =
      action === 'suspend'
        ? `${name} is suspended`
        : action === 'close'
          ? `${name} is closed`
          : `${name} is open again`;
    const line =
      action === 'suspend'
        ? `A site moderator suspended ${name} while a complaint is looked at. Members cannot post or meet until it is open again.`
        : action === 'close'
          ? `A site moderator closed ${name}.`
          : `${name} is open again. Thank you for your patience.`;
    await this.groups.tellLeaders(
      groupId,
      subject,
      note ? `${line} Reason: ${note}` : line,
    );
  }

  // ---- Reports

  /**
   * A report about a member or about the group itself. These go to site
   * moderators only, because the group's own admins may be the problem.
   */
  async reportGroup(
    user: SessionUser,
    groupId: string,
    memberId: string | null,
    dto: ReportDto,
  ) {
    // Anyone who can see a group may report it. Only members report members.
    const group = await this.groups.find(this.db, user, groupId);
    if (memberId) {
      if (memberId === user.id) {
        throw new BadRequestException('You cannot report yourself.');
      }
      if (group.my_status !== 'active') {
        throw new ForbiddenException('Only members can report a member.');
      }
      const target = await membership(this.db, groupId, memberId);
      if (target?.status !== 'active') {
        throw new NotFoundException('That person is not in the group.');
      }
    }
    const inserted = await this.db.query(
      `insert into prayer_reports
         (target_type, target_id, group_id, reporter_id, category, reason)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (target_type, target_id, reporter_id) do nothing`,
      [
        memberId ? 'member' : 'group',
        memberId ?? groupId,
        groupId,
        user.id,
        dto.category,
        dto.reason.trim(),
      ],
    );
    if (inserted.rowCount === 0) {
      throw new ConflictException('You already reported this.');
    }
  }

  /** Open reports on what was written in one group, for its admins and moderators. */
  async groupReports(user: SessionUser, groupId: string) {
    await this.requireGroupModerator(user, groupId);
    const found = await this.db.query<ReportRow>(
      `${REPORT_SQL} and p.group_id = $1
         and p.target_type in ('request', 'response')
       order by p.created_at`,
      [groupId],
    );
    return found.rows.map(viewReport);
  }

  async resolveReport(
    user: SessionUser,
    reportId: string,
    action: 'keep' | 'remove',
  ) {
    const found = await this.db.query<{
      target_type: TargetType;
      target_id: string;
      group_id: string | null;
      group_name: string | null;
      author_id: string | null;
      reason: string;
    }>(
      `select p.target_type, p.target_id, p.group_id, g.name as group_name,
              p.reason,
              case when p.target_type = 'member' then p.target_id
                   else coalesce(r.author_id, s.author_id) end as author_id
       from prayer_reports p
       left join prayer_groups g on g.id = p.group_id
       left join prayer_requests r
         on p.target_type = 'request' and r.id = p.target_id
       left join prayer_responses s
         on p.target_type = 'response' and s.id = p.target_id
       where p.id = $1 and p.resolved_at is null`,
      [reportId],
    );
    const report = found.rows[0];
    if (!report) {
      throw new ConflictException('This report was already handled.');
    }
    const aboutPeople =
      report.target_type === 'member' || report.target_type === 'group';
    if (aboutPeople || !report.group_id) {
      if (!isPrayerModerator(user)) {
        throw new ForbiddenException('Your account cannot handle this report.');
      }
    } else {
      await this.requireGroupModerator(user, report.group_id);
    }
    if (report.author_id === user.id) {
      throw new ForbiddenException(
        'This report is about you. Someone else must handle it.',
      );
    }

    await this.db.tx(async (client) => {
      if (report.target_type === 'group') {
        if (action === 'remove') {
          await this.changeStatus(
            client,
            user,
            report.target_id,
            'suspend',
            `Suspended after a report: ${report.reason}`.slice(0, 500),
          );
        }
      } else if (report.target_type === 'member') {
        if (action === 'remove') {
          await client.query(
            `update prayer_group_members set status = 'removed', role = 'member'
             where group_id = $1 and user_id = $2`,
            [report.group_id, report.target_id],
          );
          await client.query(
            `update prayer_requests set status = 'hidden',
               moderation_note = 'Hidden because you are no longer in the group.'
             where group_id = $1 and author_id = $2 and status = 'active'`,
            [report.group_id, report.target_id],
          );
        }
      } else {
        const table =
          report.target_type === 'request'
            ? 'prayer_requests'
            : 'prayer_responses';
        await client.query(
          action === 'remove'
            ? `update ${table} set status = 'hidden' where id = $1`
            : // Undo an automatic hide when the content turns out to be fine.
              `update ${table} set status = 'active'
               where id = $1 and status = 'hidden'`,
          [report.target_id],
        );
      }
      await client.query(
        `update prayer_reports
         set resolved_at = now(), resolved_by = $3, outcome = $4
         where target_type = $1 and target_id = $2 and resolved_at is null
           and (group_id is not distinct from $5)`,
        [
          report.target_type,
          report.target_id,
          user.id,
          action,
          report.group_id,
        ],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: `prayer_report.${action}`,
        objectType: `prayer_${report.target_type}`,
        objectId: report.target_id,
        reason: report.group_name,
      });
    });

    if (report.target_type === 'group' && action === 'remove') {
      await this.tellAdmins(
        report.target_id,
        report.group_name ?? 'Your group',
        'suspend',
        report.reason,
      );
    }
  }

  private async requireGroupModerator(user: SessionUser, groupId: string) {
    if (isPrayerModerator(user)) return;
    if (!canModerateGroup(await membership(this.db, groupId, user.id))) {
      throw new ForbiddenException(
        'Only an admin or moderator of the group can do that.',
      );
    }
  }
}
