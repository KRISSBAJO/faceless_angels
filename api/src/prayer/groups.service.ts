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
import { DbService, Queryable } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { CreateGroupDto, GroupDto, MemberActionDto } from './prayer.dto';
import {
  canModerateGroup,
  displayName,
  isActiveMember,
  isLeader,
  isPrayerModerator,
  membership,
  codeOfConduct,
} from './prayer.shared';

interface GroupRow {
  id: string;
  name: string;
  description: string;
  theme: string | null;
  language: string;
  church: string | null;
  city: string | null;
  region: string | null;
  meets_online: boolean;
  timezone: string;
  schedule: string | null;
  access: string;
  status: string;
  group_rules: string | null;
  status_note: string | null;
  membership_rules: string | null;
  decline_note: string | null;
  created_by: string;
  created_at: Date;
  member_count: number;
  leaders: string[] | null;
  my_role: string | null;
  my_status: string | null;
}

// $1 is always the viewer's id.
const GROUP_SQL = `
  select g.*,
         (select count(*)::int from prayer_group_members m
          where m.group_id = g.id and m.status = 'active') as member_count,
         (select array_agg(u.full_name order by m.joined_at)
          from prayer_group_members m join users u on u.id = m.user_id
          where m.group_id = g.id and m.status = 'active'
            and m.role = 'leader') as leaders,
         me.role as my_role, me.status as my_status
  from prayer_groups g
  left join prayer_group_members me
    on me.group_id = g.id and me.user_id = $1`;

function summary(row: GroupRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    theme: row.theme,
    language: row.language,
    church: row.church,
    city: row.city,
    region: row.region,
    meetsOnline: row.meets_online,
    timezone: row.timezone,
    schedule: row.schedule,
    access: row.access,
    status: row.status,
    memberCount: row.member_count,
    // Leaders are named in full: they are accountable for the group.
    leaders: row.leaders ?? [],
    myRole: row.my_status === 'active' ? row.my_role : null,
    myStatus: row.my_status,
  };
}

@Injectable()
export class PrayerGroupsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async directory(
    viewer: SessionUser,
    filters: {
      q?: string;
      language?: string;
      region?: string;
      theme?: string;
      church?: string;
      online?: string;
    },
  ) {
    const like = (value?: string) => value?.trim() || null;
    const found = await this.db.query<GroupRow>(
      `${GROUP_SQL}
       where g.status = 'active' and g.access <> 'private'
         and ($2::text is null or g.name ilike '%' || $2 || '%'
              or g.description ilike '%' || $2 || '%'
              or g.city ilike '%' || $2 || '%'
              or g.theme ilike '%' || $2 || '%'
              or g.church ilike '%' || $2 || '%')
         and ($3::text is null or g.language ilike $3)
         and ($4::text is null or g.region ilike $4)
         and ($5::text is null or g.theme ilike '%' || $5 || '%')
         and ($6::text is null or g.church ilike '%' || $6 || '%')
         and ($7::boolean is null or g.meets_online = $7)
       order by g.name limit 200`,
      [
        viewer.id,
        like(filters.q),
        like(filters.language),
        like(filters.region),
        like(filters.theme),
        like(filters.church),
        filters.online === 'yes' ? true : filters.online === 'no' ? false : null,
      ],
    );
    const facets = await this.db.query<{
      languages: string[] | null;
      regions: string[] | null;
    }>(
      `select array_agg(distinct language order by language) as languages,
              array_agg(distinct region order by region)
                filter (where region is not null) as regions
       from prayer_groups where status = 'active' and access <> 'private'`,
    );
    return {
      groups: found.rows.map(summary),
      languages: facets.rows[0].languages ?? [],
      regions: facets.rows[0].regions ?? [],
    };
  }

  /**
   * What a visitor may see before they sign in: that groups exist and what
   * they are about. No leaders, members, or links.
   */
  async publicList() {
    const found = await this.db.query<{
      name: string;
      theme: string | null;
      language: string;
      city: string | null;
      region: string | null;
      meets_online: boolean;
      schedule: string | null;
      total: number;
    }>(
      `select name, theme, language, city, region, meets_online, schedule,
              count(*) over ()::int as total
       from prayer_groups
       where status = 'active' and access in ('open', 'apply')
       order by created_at desc limit 6`,
    );
    return {
      total: found.rows[0]?.total ?? 0,
      groups: found.rows.map((g) => ({
        name: g.name,
        theme: g.theme,
        language: g.language,
        city: g.city,
        region: g.region,
        meetsOnline: g.meets_online,
        schedule: g.schedule,
      })),
    };
  }

  /** Groups I belong to, lead, applied to, was invited to, or proposed. */
  async mine(viewer: SessionUser) {
    const found = await this.db.query<GroupRow>(
      `${GROUP_SQL}
       where g.status <> 'closed'
         and me.status in ('active', 'applied', 'invited')
       order by g.name`,
      [viewer.id],
    );
    return found.rows.map((row) => ({
      ...summary(row),
      declineNote: row.decline_note,
    }));
  }

  async create(user: SessionUser, dto: CreateGroupDto) {
    if (!user.emailVerified) {
      throw new ForbiddenException({
        message: 'Confirm your email before you start a group.',
        code: 'email_not_verified',
      });
    }
    // Groups started by the people who approve groups need no second look.
    const status = isPrayerModerator(user) ? 'active' : 'pending';
    const id = await this.db.tx(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into prayer_groups
           (name, description, theme, language, church, city, region,
            meets_online, timezone, schedule, access, status,
            group_rules, membership_rules, created_by, approved_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16)
         returning id`,
        [
          ...this.fields(dto),
          status,
          this.code(dto),
          dto.membershipRules?.trim() || null,
          user.id,
          status === 'active' ? user.id : null,
        ],
      );
      const groupId = inserted.rows[0].id;
      await client.query(
        `insert into prayer_group_members
           (group_id, user_id, role, status, accepted_code_at)
         values ($1, $2, 'leader', 'active', now())`,
        [groupId, user.id],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: 'prayer_group.created',
        objectType: 'prayer_group',
        objectId: groupId,
        newState: status,
        reason: dto.name.trim(),
      });
      return groupId;
    });
    return { id, status };
  }

  async get(viewer: SessionUser, groupId: string) {
    const row = await this.find(this.db, viewer, groupId);
    const me = { role: row.my_role ?? '', status: row.my_status ?? '' };
    const inside = isActiveMember(me);
    const base = {
      ...summary(row),
      codeOfConduct: codeOfConduct(row.group_rules),
      groupRules: row.group_rules ?? '',
      // Members are told why their group is suspended.
      statusNote: row.status === 'suspended' ? row.status_note : null,
      membershipRules: row.membership_rules,
      declineNote: row.created_by === viewer.id ? row.decline_note : null,
      canModerate: canModerateGroup(me),
      canLead: isLeader(me),
    };
    if (!inside) return { ...base, members: null, waiting: null };

    const members = await this.db.query<{
      user_id: string;
      full_name: string;
      role: string;
      status: string;
      joined_at: Date;
    }>(
      `select m.user_id, u.full_name, m.role, m.status, m.joined_at
       from prayer_group_members m join users u on u.id = m.user_id
       where m.group_id = $1 and m.status in ('active', 'applied', 'invited')
       order by (m.role = 'leader') desc, (m.role = 'moderator') desc,
                m.joined_at`,
      [groupId],
    );
    const shape = (m: (typeof members.rows)[number]) => ({
      userId: m.user_id,
      // Leaders and moderators are accountable, so they are named in full.
      name: m.role === 'member' ? displayName(m.full_name) : m.full_name,
      role: m.role,
      isYou: m.user_id === viewer.id,
      since: m.joined_at,
    });
    return {
      ...base,
      members: members.rows.filter((m) => m.status === 'active').map(shape),
      // Only leaders see who is waiting to get in.
      waiting: isLeader(me)
        ? members.rows
            .filter((m) => m.status !== 'active')
            .map((m) => ({ ...shape(m), status: m.status }))
        : null,
    };
  }

  async update(user: SessionUser, groupId: string, dto: GroupDto) {
    const row = await this.find(this.db, user, groupId);
    this.requireLeader(row, user);
    await this.db.tx(async (client) => {
      await client.query(
        `update prayer_groups
         set name = $2, description = $3, theme = $4, language = $5,
             church = $6, city = $7, region = $8, meets_online = $9,
             timezone = $10, schedule = $11, access = $12,
             group_rules = $13, membership_rules = $14,
             updated_at = now()
         where id = $1`,
        [
          groupId,
          ...this.fields(dto),
          this.code(dto),
          dto.membershipRules?.trim() || null,
        ],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: 'prayer_group.updated',
        objectType: 'prayer_group',
        objectId: groupId,
      });
    });
  }

  async join(user: SessionUser, groupId: string) {
    if (!user.emailVerified) {
      throw new ForbiddenException({
        message: 'Confirm your email before you join a group.',
        code: 'email_not_verified',
      });
    }
    const row = await this.find(this.db, user, groupId);
    if (row.status !== 'active') {
      throw new ConflictException('This group is not open yet.');
    }
    if (row.my_status === 'active') return { status: 'active' };
    if (row.my_status === 'removed') {
      throw new ForbiddenException(
        'You were removed from this group. Contact the prayer team if you think this is a mistake.',
      );
    }
    const invited = row.my_status === 'invited';
    if (!invited && (row.access === 'invite' || row.access === 'private')) {
      throw new ForbiddenException('This group is joined by invitation.');
    }
    const status = invited || row.access === 'open' ? 'active' : 'applied';
    await this.db.query(
      `insert into prayer_group_members
         (group_id, user_id, role, status, accepted_code_at, joined_at)
       values ($1, $2, 'member', $3, now(), now())
       on conflict (group_id, user_id) do update
         set status = $3, role = 'member', accepted_code_at = now(),
             joined_at = now()`,
      [groupId, user.id, status],
    );
    if (status === 'applied') {
      await this.tellLeaders(
        groupId,
        `Someone asked to join ${row.name}`,
        `${displayName(user.fullName)} asked to join ${row.name}.`,
      );
    }
    return { status };
  }

  async leave(user: SessionUser, groupId: string) {
    const row = await this.find(this.db, user, groupId);
    await this.db.tx(async (client) => {
      if (row.my_status === 'active' && row.my_role === 'leader') {
        const others = await client.query(
          `select 1 from prayer_group_members
           where group_id = $1 and user_id <> $2 and role = 'leader'
             and status = 'active' limit 1`,
          [groupId, user.id],
        );
        if (others.rowCount === 0) {
          throw new ConflictException(
            'You are the only admin of this group. Make someone else an admin before you leave.',
          );
        }
      }
      await client.query(
        `update prayer_group_members set status = 'left', role = 'member'
         where group_id = $1 and user_id = $2
           and status in ('active', 'applied', 'invited')`,
        [groupId, user.id],
      );
      // Leaving takes your requests off the group's wall.
      await client.query(
        `update prayer_requests set status = 'hidden',
           moderation_note = 'Hidden because you left the group.'
         where group_id = $1 and author_id = $2 and status = 'active'`,
        [groupId, user.id],
      );
    });
  }

  async memberAction(
    user: SessionUser,
    groupId: string,
    memberId: string,
    dto: MemberActionDto,
  ) {
    const row = await this.find(this.db, user, groupId);
    this.requireLeader(row, user);
    if (memberId === user.id) {
      throw new BadRequestException(
        'You cannot change your own place in the group. Ask another admin of the group.',
      );
    }
    const target = await membership(this.db, groupId, memberId);
    if (!target) throw new NotFoundException('That person is not in the group.');

    const person = await this.db.query<{ email: string; full_name: string }>(
      'select email, full_name from users where id = $1',
      [memberId],
    );
    let note: string | null = null;

    await this.db.tx(async (client) => {
      const set = (role: string, status: string) =>
        client.query(
          `update prayer_group_members set role = $3, status = $4
           where group_id = $1 and user_id = $2`,
          [groupId, memberId, role, status],
        );
      if (dto.action === 'approve') {
        if (target.status !== 'applied') {
          throw new ConflictException('That person is not waiting to join.');
        }
        await set('member', 'active');
        note = `You are now a member of ${row.name}.`;
      } else if (dto.action === 'remove') {
        // Turning down an application or an invitation does not bar the
        // person. Removing a member does.
        await set('member', target.status === 'active' ? 'removed' : 'left');
        await client.query(
          `update prayer_requests set status = 'hidden',
             moderation_note = 'Hidden because you are no longer in the group.'
           where group_id = $1 and author_id = $2 and status = 'active'`,
          [groupId, memberId],
        );
      } else {
        if (target.status !== 'active') {
          throw new ConflictException('That person is not an active member.');
        }
        await set(dto.action.replace('make_', ''), 'active');
      }
      await this.audit.record(client, {
        actorId: user.id,
        action: `prayer_group.member_${dto.action}`,
        objectType: 'prayer_group',
        objectId: groupId,
        priorState: `${target.role}/${target.status}`,
        reason: memberId,
      });
    });

    if (note) {
      await this.mail.send({
        to: person.rows[0].email,
        subject: `Welcome to ${row.name}`,
        paragraphs: [`Hello ${person.rows[0].full_name},`, note],
        action: {
          label: 'Open the group',
          url: `${config.webUrl}/prayer/groups/${groupId}`,
        },
      });
    }
  }

  /** Answers the same way whether or not the email has an account. */
  async invite(user: SessionUser, groupId: string, emailInput: string) {
    const row = await this.find(this.db, user, groupId);
    this.requireLeader(row, user);
    if (row.status !== 'active') {
      throw new ConflictException('This group is not open yet.');
    }
    const email = emailInput.toLowerCase();
    const found = await this.db.query<{ id: string; full_name: string }>(
      `select id, full_name from users where email = $1 and status = 'active'`,
      [email],
    );
    const person = found.rows[0];
    if (person) {
      const current = await membership(this.db, groupId, person.id);
      if (current?.status !== 'active') {
        await this.db.query(
          `insert into prayer_group_members (group_id, user_id, role, status)
           values ($1, $2, 'member', 'invited')
           on conflict (group_id, user_id) do update
             set status = 'invited', role = 'member'`,
          [groupId, person.id],
        );
      }
    }
    await this.mail.send({
      to: email,
      subject: `You are invited to pray with ${row.name}`,
      paragraphs: [
        `${user.fullName} invited you to join the prayer group ${row.name} on Faceless Angels.`,
        person
          ? 'Sign in to read the group’s code of conduct and accept.'
          : 'Create an account with this email address, then open the link again to accept.',
      ],
      action: {
        label: 'See the invitation',
        url: `${config.webUrl}/prayer/groups/${groupId}`,
      },
    });
    await this.audit.record(this.db, {
      actorId: user.id,
      action: 'prayer_group.invited',
      objectType: 'prayer_group',
      objectId: groupId,
    });
  }

  assertMember(user: SessionUser, groupId: string) {
    return this.requireMember(this.db, user, groupId);
  }

  async requireMember(client: Queryable, user: SessionUser, groupId: string) {
    const row = await this.find(client, user, groupId);
    if (row.my_status !== 'active' || row.status !== 'active') {
      throw new ForbiddenException('Join the group to see this.');
    }
    return row;
  }

  requireLeader(row: GroupRow, user: SessionUser) {
    const leads = row.my_status === 'active' && row.my_role === 'leader';
    // Moderators for the whole network can step in when a group has trouble.
    if (!leads && !isPrayerModerator(user)) {
      throw new ForbiddenException('Only an admin of the group can do that.');
    }
  }

  async tellLeaders(groupId: string, subject: string, line: string) {
    const leaders = await this.db.query<{ email: string; full_name: string }>(
      `select u.email, u.full_name from prayer_group_members m
       join users u on u.id = m.user_id
       where m.group_id = $1 and m.role = 'leader' and m.status = 'active'`,
      [groupId],
    );
    for (const leader of leaders.rows) {
      await this.mail.send({
        to: leader.email,
        subject,
        paragraphs: [`Hello ${leader.full_name},`, line],
        action: {
          label: 'Open the group',
          url: `${config.webUrl}/prayer/groups/${groupId}`,
        },
      });
    }
  }

  // A private or unapproved group reads as missing to people outside it.
  async find(client: Queryable, viewer: SessionUser, groupId: string) {
    const found = await client.query<GroupRow>(
      `${GROUP_SQL} where g.id = $2`,
      [viewer.id, groupId],
    );
    const row = found.rows[0];
    const missing = new NotFoundException('We could not find that group.');
    if (!row || row.status === 'closed') throw missing;
    if (isPrayerModerator(viewer)) return row;
    const connected = ['active', 'applied', 'invited'].includes(
      row.my_status ?? '',
    );
    // A suspended group stays visible to its own members, with the reason.
    if (row.status !== 'active' && !connected) throw missing;
    if (row.access === 'private' && !connected) throw missing;
    return row;
  }

  private fields(dto: GroupDto) {
    return [
      dto.name.trim(),
      dto.description.trim(),
      dto.theme?.trim() || null,
      dto.language.trim(),
      dto.church?.trim() || null,
      dto.city?.trim() || null,
      dto.region?.trim() || null,
      dto.meetsOnline,
      dto.timezone,
      dto.schedule?.trim() || null,
      dto.access,
    ];
  }

  private code(dto: GroupDto) {
    return dto.groupRules?.trim() || null;
  }
}
