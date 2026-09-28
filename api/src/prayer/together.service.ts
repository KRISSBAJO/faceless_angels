import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { MailService } from '../mail/mail.service';
import { PrayerGroupsService } from './groups.service';
import { displayName } from './prayer.shared';

const MAX_CAMPAIGN_DAYS = 100;
const MAX_CHAIN_SLOTS = 7 * 24 * 4;
const SLOT_REMINDER_MINUTES = 15;
const REMINDER_CHECK_MS = 5 * 60 * 1000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export class CampaignDto {
  @IsString()
  @Length(3, 120, { message: 'Enter a title of 3 to 120 characters.' })
  title: string;

  @IsString()
  @Length(10, 1000, { message: 'Say what the group is praying for.' })
  purpose: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  scripture?: string;

  @Matches(DAY, { message: 'Enter the first day.' })
  startsOn: string;

  @IsInt()
  @Min(1, { message: 'A campaign lasts at least 1 day.' })
  @Max(MAX_CAMPAIGN_DAYS, {
    message: `A campaign lasts at most ${MAX_CAMPAIGN_DAYS} days.`,
  })
  days: number;
}

export class ChainDto {
  @IsString()
  @Length(3, 120, { message: 'Enter a title of 3 to 120 characters.' })
  title: string;

  @IsString()
  @Length(10, 1000, { message: 'Say what the group is praying for.' })
  purpose: string;

  @Matches(LOCAL, { message: 'Enter when the chain starts.' })
  startsLocal: string;

  @IsInt()
  @Min(1, { message: 'A chain lasts at least 1 hour.' })
  @Max(168, { message: 'A chain lasts at most 7 days.' })
  hours: number;

  @IsIn([15, 30, 60], { message: 'Choose how long each turn is.' })
  slotMinutes: number;

  @IsTimeZone({ message: 'Choose a time zone.' })
  timezone: string;
}

export class SlotDto {
  @IsString()
  @Length(20, 40, { message: 'Choose a turn.' })
  slotStart: string;
}

interface CampaignRow {
  id: string;
  group_id: string;
  title: string;
  purpose: string;
  scripture: string | null;
  starts_on: string;
  ends_on: string;
  today: string;
  cancelled_at: Date | null;
  taking_part: number;
  i_joined: boolean;
  my_days: string[] | null;
}

// $1 is the viewer. "today" is the day in the group's own time zone.
const CAMPAIGN_SQL = `
  select c.id, c.group_id, c.title, c.purpose, c.scripture,
         to_char(c.starts_on, 'YYYY-MM-DD') as starts_on,
         to_char(c.ends_on, 'YYYY-MM-DD') as ends_on,
         to_char((now() at time zone g.timezone)::date, 'YYYY-MM-DD') as today,
         c.cancelled_at,
         (select count(*)::int from prayer_campaign_members m
          where m.campaign_id = c.id) as taking_part,
         exists(select 1 from prayer_campaign_members m
                where m.campaign_id = c.id and m.user_id = $1) as i_joined,
         (select array_agg(to_char(d.day, 'YYYY-MM-DD') order by d.day)
          from prayer_campaign_days d
          where d.campaign_id = c.id and d.user_id = $1) as my_days
  from prayer_campaigns c join prayer_groups g on g.id = c.group_id`;

function viewCampaign(row: CampaignRow) {
  const days =
    Math.round(
      (Date.parse(row.ends_on) - Date.parse(row.starts_on)) / 86_400_000,
    ) + 1;
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    purpose: row.purpose,
    scripture: row.scripture,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    days,
    today: row.today,
    running: row.today >= row.starts_on && row.today <= row.ends_on,
    ended: row.today > row.ends_on,
    takingPart: row.taking_part,
    iJoined: row.i_joined,
    // A member's own record. Nobody else sees which days they prayed.
    myDays: row.my_days ?? [],
  };
}

interface ChainRow {
  id: string;
  group_id: string;
  group_name: string;
  title: string;
  purpose: string;
  starts_at: Date;
  ends_at: Date;
  slot_minutes: number;
  timezone: string;
  cancelled_at: Date | null;
}

@Injectable()
export class PrayerTogetherService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrayerTogetherService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly groups: PrayerGroupsService,
  ) {}

  onModuleInit() {
    const run = () =>
      this.sendSlotReminders().catch((err) =>
        this.log.error(`Chain reminders failed: ${String(err)}`),
      );
    setTimeout(run, 20_000).unref();
    this.timer = setInterval(run, REMINDER_CHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---- Campaigns

  async campaigns(viewer: SessionUser, groupId: string) {
    await this.groups.assertMember(viewer, groupId);
    const found = await this.db.query<CampaignRow>(
      `${CAMPAIGN_SQL}
       where c.group_id = $2 and c.cancelled_at is null
         and c.ends_on >= (now() at time zone g.timezone)::date - 14
       order by c.starts_on`,
      [viewer.id, groupId],
    );
    return found.rows.map(viewCampaign);
  }

  async createCampaign(user: SessionUser, groupId: string, dto: CampaignDto) {
    const group = await this.groups.find(this.db, user, groupId);
    this.groups.requireLeader(group, user);
    if (group.status !== 'active') {
      throw new ConflictException(
        'Campaigns can start once the group is approved.',
      );
    }
    const inserted = await this.db.tx(async (client) => {
      const row = await client.query<{ id: string; past: boolean }>(
        `insert into prayer_campaigns
           (group_id, title, purpose, scripture, starts_on, ends_on,
            created_by)
         values ($1, $2, $3, $4, $5::date, $5::date + ($6::int - 1), $7)
         returning id,
           ends_on < (now() at time zone $8::text)::date as past`,
        [
          groupId,
          dto.title.trim(),
          dto.purpose.trim(),
          dto.scripture?.trim() || null,
          dto.startsOn,
          dto.days,
          user.id,
          group.timezone,
        ],
      );
      if (row.rows[0].past) {
        throw new BadRequestException('Choose days that have not passed.');
      }
      await this.audit.record(client, {
        actorId: user.id,
        action: 'prayer_campaign.created',
        objectType: 'prayer_group',
        objectId: groupId,
        newState: `${dto.days} days`,
        reason: dto.title.trim(),
      });
      return row.rows[0];
    });
    return { id: inserted.id };
  }

  async joinCampaign(user: SessionUser, campaignId: string, on: boolean) {
    const campaign = await this.campaign(user, campaignId);
    if (on && campaign.ended) {
      throw new ConflictException('This campaign has ended.');
    }
    await this.db.query(
      on
        ? `insert into prayer_campaign_members (campaign_id, user_id)
           values ($1, $2) on conflict do nothing`
        : `delete from prayer_campaign_members
           where campaign_id = $1 and user_id = $2`,
      [campaignId, user.id],
    );
  }

  /** Marks that the member prayed today. It cannot be set for other days. */
  async prayedToday(user: SessionUser, campaignId: string, on: boolean) {
    const campaign = await this.campaign(user, campaignId);
    if (!campaign.running) {
      throw new ConflictException(
        campaign.ended
          ? 'This campaign has ended.'
          : 'This campaign has not started yet.',
      );
    }
    if (!campaign.iJoined) {
      throw new ConflictException('Take part in the campaign first.');
    }
    await this.db.query(
      on
        ? `insert into prayer_campaign_days (campaign_id, user_id, day)
           values ($1, $2, $3::date) on conflict do nothing`
        : `delete from prayer_campaign_days
           where campaign_id = $1 and user_id = $2 and day = $3::date`,
      [campaignId, user.id, campaign.today],
    );
  }

  async cancelCampaign(user: SessionUser, campaignId: string) {
    const campaign = await this.campaign(user, campaignId);
    const group = await this.groups.find(this.db, user, campaign.groupId);
    this.groups.requireLeader(group, user);
    await this.db.query(
      'update prayer_campaigns set cancelled_at = now() where id = $1',
      [campaignId],
    );
    await this.audit.record(this.db, {
      actorId: user.id,
      action: 'prayer_campaign.cancelled',
      objectType: 'prayer_group',
      objectId: campaign.groupId,
      reason: campaign.title,
    });
  }

  private async campaign(viewer: SessionUser, campaignId: string) {
    const found = await this.db.query<CampaignRow>(
      `${CAMPAIGN_SQL} where c.id = $2 and c.cancelled_at is null`,
      [viewer.id, campaignId],
    );
    const row = found.rows[0];
    const missing = new NotFoundException('We could not find that campaign.');
    if (!row) throw missing;
    try {
      await this.groups.assertMember(viewer, row.group_id);
    } catch {
      throw missing;
    }
    return viewCampaign(row);
  }

  // ---- Chains

  async chains(viewer: SessionUser, groupId: string) {
    await this.groups.assertMember(viewer, groupId);
    const found = await this.db.query<ChainRow>(
      `select c.*, g.name as group_name
       from prayer_chains c join prayer_groups g on g.id = c.group_id
       where c.group_id = $1 and c.cancelled_at is null and c.ends_at > now()
       order by c.starts_at`,
      [groupId],
    );
    return Promise.all(found.rows.map((row) => this.viewChain(viewer, row)));
  }

  async createChain(user: SessionUser, groupId: string, dto: ChainDto) {
    const group = await this.groups.find(this.db, user, groupId);
    this.groups.requireLeader(group, user);
    if (group.status !== 'active') {
      throw new ConflictException(
        'Prayer chains can start once the group is approved.',
      );
    }
    if ((dto.hours * 60) / dto.slotMinutes > MAX_CHAIN_SLOTS) {
      throw new BadRequestException(
        'That is too many turns. Choose longer turns or fewer hours.',
      );
    }
    return this.db.tx(async (client) => {
      const inserted = await client.query<{ id: string; ends_at: Date }>(
        `insert into prayer_chains
           (group_id, title, purpose, starts_at, ends_at, slot_minutes,
            timezone, created_by)
         select $1, $2, $3, s, s + make_interval(hours => $5::int), $6,
                $7::text, $8
         from (select $4::timestamp at time zone $7::text as s) t
         returning id, ends_at`,
        [
          groupId,
          dto.title.trim(),
          dto.purpose.trim(),
          dto.startsLocal,
          dto.hours,
          dto.slotMinutes,
          dto.timezone,
          user.id,
        ],
      );
      if (inserted.rows[0].ends_at.getTime() < Date.now()) {
        throw new BadRequestException('Choose a time in the future.');
      }
      await this.audit.record(client, {
        actorId: user.id,
        action: 'prayer_chain.created',
        objectType: 'prayer_group',
        objectId: groupId,
        newState: `${dto.hours} hours`,
        reason: dto.title.trim(),
      });
      return { id: inserted.rows[0].id };
    });
  }

  async takeSlot(
    user: SessionUser,
    chainId: string,
    slotStart: string,
    on: boolean,
  ) {
    const chain = await this.chain(user, chainId);
    const at = Date.parse(slotStart);
    const offset = at - chain.starts_at.getTime();
    const length = chain.slot_minutes * 60_000;
    if (
      Number.isNaN(at) ||
      offset < 0 ||
      at >= chain.ends_at.getTime() ||
      offset % length !== 0
    ) {
      throw new BadRequestException('Choose one of the turns in this chain.');
    }
    if (on && at + length < Date.now()) {
      throw new ConflictException('That turn has already passed.');
    }
    await this.db.query(
      on
        ? `insert into prayer_chain_slots (chain_id, slot_start, user_id)
           values ($1, $2, $3) on conflict do nothing`
        : `delete from prayer_chain_slots
           where chain_id = $1 and slot_start = $2 and user_id = $3`,
      [chainId, new Date(at), user.id],
    );
  }

  async cancelChain(user: SessionUser, chainId: string) {
    const chain = await this.chain(user, chainId);
    const group = await this.groups.find(this.db, user, chain.group_id);
    this.groups.requireLeader(group, user);
    await this.db.query(
      'update prayer_chains set cancelled_at = now() where id = $1',
      [chainId],
    );
    await this.audit.record(this.db, {
      actorId: user.id,
      action: 'prayer_chain.cancelled',
      objectType: 'prayer_group',
      objectId: chain.group_id,
      reason: chain.title,
    });
  }

  private async viewChain(viewer: SessionUser, row: ChainRow) {
    const taken = await this.db.query<{
      slot_start: Date;
      user_id: string;
      full_name: string;
    }>(
      `select s.slot_start, s.user_id, u.full_name
       from prayer_chain_slots s join users u on u.id = s.user_id
       where s.chain_id = $1 order by s.slot_start, s.created_at`,
      [row.id],
    );
    const bySlot = new Map<number, { name: string; isYou: boolean }[]>();
    for (const t of taken.rows) {
      const key = t.slot_start.getTime();
      bySlot.set(key, [
        ...(bySlot.get(key) ?? []),
        { name: displayName(t.full_name), isYou: t.user_id === viewer.id },
      ]);
    }
    const length = row.slot_minutes * 60_000;
    const slots: {
      start: string;
      people: string[];
      mine: boolean;
      past: boolean;
    }[] = [];
    for (let t = row.starts_at.getTime(); t < row.ends_at.getTime(); t += length) {
      const people = bySlot.get(t) ?? [];
      slots.push({
        start: new Date(t).toISOString(),
        people: people.map((p) => (p.isYou ? 'You' : p.name)),
        mine: people.some((p) => p.isYou),
        past: t + length < Date.now(),
      });
    }
    const open = slots.filter((s) => !s.past && s.people.length === 0).length;
    return {
      id: row.id,
      groupId: row.group_id,
      title: row.title,
      purpose: row.purpose,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      slotMinutes: row.slot_minutes,
      timezone: row.timezone,
      slots,
      openTurns: open,
    };
  }

  private async chain(viewer: SessionUser, chainId: string) {
    const found = await this.db.query<ChainRow>(
      `select c.*, g.name as group_name
       from prayer_chains c join prayer_groups g on g.id = c.group_id
       where c.id = $1 and c.cancelled_at is null`,
      [chainId],
    );
    const row = found.rows[0];
    const missing = new NotFoundException('We could not find that prayer chain.');
    if (!row) throw missing;
    try {
      await this.groups.assertMember(viewer, row.group_id);
    } catch {
      throw missing;
    }
    return row;
  }

  /** Emails each person shortly before their turn in a chain. */
  async sendSlotReminders() {
    const due = await this.db.query<{
      slot_start: Date;
      email: string;
      full_name: string;
      title: string;
      purpose: string;
      timezone: string;
      slot_minutes: number;
      group_id: string;
      chain_id: string;
    }>(
      `update prayer_chain_slots s set reminder_sent_at = now()
       from prayer_chains c, users u
       where c.id = s.chain_id and u.id = s.user_id
         and s.reminder_sent_at is null and c.cancelled_at is null
         and u.status = 'active' and s.slot_start > now()
         and s.slot_start <= now() + make_interval(mins => $1)
       returning s.slot_start, u.email, u.full_name, c.title, c.purpose,
                 c.timezone, c.slot_minutes, c.group_id, c.id as chain_id`,
      [SLOT_REMINDER_MINUTES],
    );
    for (const turn of due.rows) {
      const when = turn.slot_start.toLocaleString('en-US', {
        timeZone: turn.timezone,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
      await this.mail.send({
        to: turn.email,
        subject: `Your turn to pray at ${when}`,
        paragraphs: [
          `Hello ${turn.full_name},`,
          `Your ${turn.slot_minutes} minutes in "${turn.title}" start at ${when}.`,
          turn.purpose,
        ],
        action: {
          label: 'Open the group',
          url: `${config.webUrl}/prayer/groups/${turn.group_id}`,
        },
        idempotencyKey: `chain-${turn.chain_id}-${turn.slot_start.getTime()}-${turn.email}`,
      });
    }
    return due.rows.length;
  }
}
