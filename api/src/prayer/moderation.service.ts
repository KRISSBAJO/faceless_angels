import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { GroupDecisionDto, ModerateDto } from './prayer.dto';
import {
  canModerateGroup,
  displayName,
  isPrayerModerator,
  membership,
} from './prayer.shared';
import { REQUEST_SQL, RequestRow, viewRequest } from './requests.service';

interface ReportRow {
  id: string;
  target_type: 'request' | 'response';
  target_id: string;
  group_id: string | null;
  reason: string;
  created_at: Date;
  text: string | null;
  request_id: string | null;
  others: number;
}

const REPORT_SQL = `
  select p.id, p.target_type, p.target_id, p.group_id, p.reason,
         p.created_at,
         coalesce(r.body, s.body) as text,
         coalesce(r.id, s.request_id) as request_id,
         (select count(*)::int from prayer_reports o
          where o.target_type = p.target_type and o.target_id = p.target_id
            and o.resolved_at is null) as others
  from prayer_reports p
  left join prayer_requests r
    on p.target_type = 'request' and r.id = p.target_id
  left join prayer_responses s
    on p.target_type = 'response' and s.id = p.target_id
  where p.resolved_at is null`;

function viewReport(row: ReportRow) {
  return {
    id: row.id,
    kind: row.target_type,
    requestId: row.request_id,
    text: row.text,
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
          leader: string;
          leader_email: string;
          identity_status: string;
          created_at: Date;
        }>(
          `select g.id, g.name, g.description, g.access, g.language,
                  g.church, g.city, g.region, u.full_name as leader,
                  u.email as leader_email, u.identity_status, g.created_at
           from prayer_groups g join users u on u.id = g.created_by
           where g.status = 'pending' and g.created_by <> $1
           order by g.created_at`,
          [viewer.id],
        ),
        this.db.query<ReportRow>(
          // Reports inside a group go to that group's own leaders first.
          `${REPORT_SQL} and p.group_id is null order by p.created_at`,
        ),
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
            `Your prayer group ${group.name} is approved. You can now invite people and schedule sessions.`,
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

  /** Open reports inside one group, for its leaders and moderators. */
  async groupReports(user: SessionUser, groupId: string) {
    await this.requireGroupModerator(user, groupId);
    const found = await this.db.query<ReportRow>(
      `${REPORT_SQL} and p.group_id = $1 order by p.created_at`,
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
      target_type: string;
      target_id: string;
      group_id: string | null;
      author_id: string | null;
    }>(
      `select p.target_type, p.target_id, p.group_id,
              coalesce(r.author_id, s.author_id) as author_id
       from prayer_reports p
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
    if (report.group_id) {
      await this.requireGroupModerator(user, report.group_id);
    } else if (!isPrayerModerator(user)) {
      throw new ForbiddenException('Your account cannot handle reports.');
    }
    if (report.author_id === user.id) {
      throw new ForbiddenException(
        'This report is about your own words. Someone else must handle it.',
      );
    }

    await this.db.tx(async (client) => {
      const table =
        report.target_type === 'request'
          ? 'prayer_requests'
          : 'prayer_responses';
      if (action === 'remove') {
        await client.query(
          `update ${table} set status = 'hidden' where id = $1`,
          [report.target_id],
        );
      } else {
        // Undo an automatic hide when the content turns out to be fine.
        await client.query(
          `update ${table} set status = 'active'
           where id = $1 and status = 'hidden'`,
          [report.target_id],
        );
      }
      await client.query(
        `update prayer_reports
         set resolved_at = now(), resolved_by = $3, outcome = $4
         where target_type = $1 and target_id = $2 and resolved_at is null`,
        [report.target_type, report.target_id, user.id, action],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: `prayer_report.${action}`,
        objectType:
          report.target_type === 'request'
            ? 'prayer_request'
            : 'prayer_response',
        objectId: report.target_id,
      });
    });
  }

  private async requireGroupModerator(user: SessionUser, groupId: string) {
    if (isPrayerModerator(user)) return;
    if (!canModerateGroup(await membership(this.db, groupId, user.id))) {
      throw new ForbiddenException(
        'Only a leader or moderator of the group can do that.',
      );
    }
  }
}
