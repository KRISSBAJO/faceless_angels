import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PROVIDER_KEYS } from './meeting-providers';
import { REPORT_CATEGORIES } from './prayer.shared';

export const AUDIENCES = ['personal', 'group', 'team', 'network'] as const;
export const LIFETIMES = [7, 30, 90] as const;
export const GROUP_ACCESS = ['open', 'apply', 'invite', 'private'] as const;

const PLACE = { message: 'Choose where the session is held.' };

export class CreatePrayerDto {
  @IsString()
  @Length(10, 1500, {
    message: 'Write your prayer request in 10 to 1,500 characters.',
  })
  body: string;

  @IsIn(AUDIENCES, { message: 'Choose who may see your request.' })
  audience: (typeof AUDIENCES)[number];

  @ValidateIf((dto: CreatePrayerDto) => dto.audience === 'group')
  @IsUUID('4', { message: 'Choose one of your groups.' })
  groupId?: string;

  @IsOptional()
  @IsBoolean()
  showName?: boolean;

  @IsOptional()
  @IsBoolean()
  allowResponses?: boolean;

  @IsOptional()
  @IsBoolean()
  allowForward?: boolean;

  @IsOptional()
  @IsBoolean()
  allowFollow?: boolean;

  @IsOptional()
  @IsIn(LIFETIMES, { message: 'Choose how long to keep the request open.' })
  days?: (typeof LIFETIMES)[number];
}

export class EditPrayerDto {
  @IsOptional()
  @IsString()
  @Length(10, 1500, {
    message: 'Write your prayer request in 10 to 1,500 characters.',
  })
  body?: string;

  @IsOptional()
  @IsBoolean()
  showName?: boolean;

  @IsOptional()
  @IsBoolean()
  allowResponses?: boolean;

  @IsOptional()
  @IsBoolean()
  allowForward?: boolean;

  @IsOptional()
  @IsBoolean()
  allowFollow?: boolean;
}

export class AnsweredDto {
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  testimony?: string;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class ResponseDto {
  @IsString()
  @Length(2, 600, { message: 'Write 2 to 600 characters.' })
  body: string;
}

export class ReportDto {
  @IsIn(REPORT_CATEGORIES, { message: 'Choose what kind of problem it is.' })
  category: (typeof REPORT_CATEGORIES)[number];

  @IsString()
  @Length(5, 500, { message: 'Tell us what is wrong in a few words.' })
  reason: string;
}

export class GroupStatusDto {
  @IsIn(['suspend', 'reinstate', 'close'], { message: 'Choose what to do.' })
  action: 'suspend' | 'reinstate' | 'close';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BlockDto {
  @IsIn(['request', 'response'])
  type: 'request' | 'response';

  @IsUUID('4')
  id: string;
}

export class ModerateDto {
  @IsIn(['approve', 'hide'], { message: 'Choose share or hide.' })
  action: 'approve' | 'hide';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ResolveReportDto {
  @IsIn(['keep', 'remove'], { message: 'Choose keep or remove.' })
  action: 'keep' | 'remove';
}

export class GroupDto {
  @IsString()
  @Length(3, 80, { message: 'Enter a group name of 3 to 80 characters.' })
  name: string;

  @IsString()
  @Length(20, 1000, {
    message: 'Describe the group in 20 to 1,000 characters.',
  })
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  theme?: string;

  @IsString()
  @Length(2, 40, { message: 'Enter the language the group prays in.' })
  language: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  church?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  region?: string;

  @IsBoolean()
  meetsOnline: boolean;

  @IsTimeZone({ message: 'Choose a time zone.' })
  timezone: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  schedule?: string;

  @IsIn(GROUP_ACCESS, { message: 'Choose who may join.' })
  access: (typeof GROUP_ACCESS)[number];

  // Added beneath the platform's own code of conduct.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  groupRules?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  membershipRules?: string;
}

export class CreateGroupDto extends GroupDto {
  @Equals(true, {
    message: 'Agree to lead the group by the code of conduct.',
  })
  acceptLeaderDuties: boolean;
}

export class JoinDto {
  @Equals(true, { message: 'Agree to the code of conduct to join.' })
  acceptCode: boolean;
}

export class MemberActionDto {
  @IsIn(['approve', 'remove', 'make_leader', 'make_moderator', 'make_member'], {
    message: 'Choose what to do.',
  })
  action:
    | 'approve'
    | 'remove'
    | 'make_leader'
    | 'make_moderator'
    | 'make_member';
}

export class InviteMemberDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;
}

export class SessionDto {
  @IsString()
  @Length(3, 120, { message: 'Enter a title of 3 to 120 characters.' })
  title: string;

  // Local date and time in the session's time zone, like 2026-10-07T19:00
  @IsString()
  @Length(16, 16, { message: 'Enter the date and time.' })
  startsLocal: string;

  @IsTimeZone({ message: 'Choose a time zone.' })
  timezone: string;

  @IsInt()
  @Min(5, { message: 'A session lasts at least 5 minutes.' })
  @Max(600, { message: 'A session lasts at most 10 hours.' })
  durationMinutes: number;

  @IsOptional()
  @IsInt()
  @Min(2, { message: 'Set room for at least 2 people.' })
  @Max(5000)
  capacity?: number;

  @IsOptional()
  @IsIn(PROVIDER_KEYS, PLACE)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Makes the same session weekly for this many weeks, this one included.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(26, { message: 'Schedule up to 26 weeks at a time.' })
  weeks?: number;
}

export class AttendDto {
  @Equals(true, {
    message: 'Agree that the host may see you plan to attend.',
  })
  consent: boolean;
}

export class GroupDecisionDto {
  @IsIn(['approve', 'decline'], { message: 'Choose approve or decline.' })
  action: 'approve' | 'decline';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
