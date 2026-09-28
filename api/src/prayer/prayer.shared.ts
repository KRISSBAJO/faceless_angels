import type { SessionUser } from '../auth/auth.service';
import { PRAYER_MODERATOR_ROLES, PRAYER_TEAM_ROLES, type Role } from '../config';
import type { Queryable } from '../db/db.service';

/** Every group starts from this. Leaders may add to it, never remove it. */
export const PLATFORM_CODE_OF_CONDUCT = [
  'Keep what is shared here in confidence.',
  'Pray for people, never about them.',
  'Do not ask members for money or sell anything.',
  'Do not pressure anyone to share, to attend, or to believe as you do.',
  'Treat every person with respect. No harassment, threats, or hateful speech.',
  'If someone may be in danger, tell a leader and point them to emergency help.',
].join('\n');

export const CRISIS_RESOURCES =
  'If you are in immediate danger, call 911. If you are thinking about harming yourself, call or text 988 to reach the Suicide and Crisis Lifeline. For domestic violence, call 1-800-799-7233.';

/** "Lydia Lawson" becomes "Lydia L." so members are known without a full name. */
export function displayName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts.at(-1)![0].toUpperCase()}.`;
}

// Words that suggest someone may be in danger. A match shows the author
// where to get help and moves the request up the moderators' list.
const CARE_PATTERN =
  /\b(suicid\w*|kill(ing)? myself|end(ing)? my life|want to die|self[- ]harm|hurt(ing)? myself|overdos\w*|abus(e|ed|ing|ive)|beat(s|ing)? me|hits? me|unsafe at home|traffick\w*)\b/i;

export function mayNeedCare(text: string) {
  return CARE_PATTERN.test(text);
}

export function isPrayerTeam(user: SessionUser) {
  return PRAYER_TEAM_ROLES.includes(user.role as Role);
}

export function isPrayerModerator(user: SessionUser) {
  return PRAYER_MODERATOR_ROLES.includes(user.role as Role);
}

export interface Membership {
  role: string;
  status: string;
}

export async function membership(
  client: Queryable,
  groupId: string,
  userId: string,
): Promise<Membership | null> {
  const found = await client.query<Membership>(
    `select role, status from prayer_group_members
     where group_id = $1 and user_id = $2`,
    [groupId, userId],
  );
  return found.rows[0] ?? null;
}

export function isActiveMember(m: Membership | null) {
  return m?.status === 'active';
}

/** Leaders and moderators keep a group's space safe. */
export function canModerateGroup(m: Membership | null) {
  return (
    m?.status === 'active' && (m.role === 'leader' || m.role === 'moderator')
  );
}

export function isLeader(m: Membership | null) {
  return m?.status === 'active' && m.role === 'leader';
}
