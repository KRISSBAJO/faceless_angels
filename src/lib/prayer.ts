export interface PrayerRequest {
  id: string;
  body: string;
  audience: string;
  groupId: string | null;
  groupName: string | null;
  by: string | null;
  mine: boolean;
  status: string;
  at: string;
  editedAt: string | null;
  expiresAt: string;
  ended: boolean;
  allowResponses: boolean;
  allowFollow: boolean;
  iPrayed: boolean;
  iFollow: boolean;
  answeredAt: string | null;
  testimony: string | null;
  // Staff only
  needsCare?: boolean;
  forwarded?: boolean;
  // Author only
  showName?: boolean;
  allowForward?: boolean;
  prayedCount?: number;
  testimonyStatus?: string | null;
  moderationNote?: string | null;
  help?: string | null;
}

export interface PrayerResponse {
  id: string;
  by: string;
  mine: boolean;
  fromAuthor: boolean;
  body: string;
  waiting: boolean;
  at: string;
}

export interface PrayerRequestDetail extends PrayerRequest {
  canForward: boolean;
  responses: PrayerResponse[];
}

export interface Testimony {
  id: string;
  request: string;
  testimony: string;
  at: string;
}

export interface PrayerGroup {
  id: string;
  name: string;
  description: string;
  theme: string | null;
  language: string;
  church: string | null;
  city: string | null;
  region: string | null;
  meetsOnline: boolean;
  timezone: string;
  schedule: string | null;
  access: string;
  status: string;
  memberCount: number;
  leaders: string[];
  myRole: string | null;
  myStatus: string | null;
  declineNote?: string | null;
}

export interface GroupMember {
  userId: string;
  name: string;
  role: string;
  isYou: boolean;
  since: string;
  status?: string;
}

export interface PrayerGroupDetail extends PrayerGroup {
  codeOfConduct: string;
  groupRules: string;
  membershipRules: string | null;
  statusNote: string | null;
  canModerate: boolean;
  canLead: boolean;
  members: GroupMember[] | null;
  waiting: GroupMember[] | null;
}

export interface PrayerSession {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  startsAt: string;
  timezone: string;
  durationMinutes: number;
  host: string;
  isHost: boolean;
  inSeries: boolean;
  capacity: number | null;
  attending: number;
  full: boolean;
  iAttend: boolean;
  online: boolean;
  providerName: string | null;
  place: string | null;
  notes: string | null;
  cancelled: boolean;
}

export interface PrayerReport {
  id: string;
  kind: string;
  groupId: string | null;
  groupName: string | null;
  requestId: string | null;
  memberName: string | null;
  text: string | null;
  category: string;
  reason: string;
  reports: number;
  at: string;
}

export interface PrayerAbout {
  codeOfConduct: string;
  crisisResources: string;
  providers: { key: string; name: string }[];
}

export interface ModerationQueue {
  requests: PrayerRequest[];
  responses: {
    id: string;
    requestId: string;
    body: string;
    replyingTo: string;
    by: string;
    at: string;
  }[];
  testimonies: Testimony[];
  groups: {
    id: string;
    name: string;
    description: string;
    access: string;
    language: string;
    church: string | null;
    city: string | null;
    region: string | null;
    membershipRules: string | null;
    groupRules: string | null;
    leader: string;
    leaderEmail: string;
    leaderIdentity: string;
    at: string;
  }[];
  reports: PrayerReport[];
  mayNeedCare: PrayerRequest[];
}

export const AUDIENCE_LABELS: Record<string, string> = {
  personal: "Only me",
  group: "One of my groups",
  team: "The prayer team",
  network: "The whole network",
};

export const AUDIENCE_NOTES: Record<string, string> = {
  personal: "A private list for your own prayers. No one else can read it.",
  team: "A small trained team reads it and prays. They see your first name.",
  group: "Members of one group you belong to.",
  network:
    "Every member can read it. A moderator looks at it first. Your name is hidden unless you choose to show it.",
};

export const ACCESS_LABELS: Record<string, string> = {
  open: "Open to all",
  apply: "Ask to join",
  invite: "By invitation",
  private: "Private",
};

export const ACCESS_NOTES: Record<string, string> = {
  open: "Anyone can join straight away.",
  apply: "People ask to join and a group admin approves each one.",
  invite:
    "The group is listed, but people join only when a group admin invites them.",
  private: "The group is not listed. People join only by invitation.",
};

export interface ManagedGroup {
  id: string;
  name: string;
  access: string;
  status: string;
  statusNote: string | null;
  city: string | null;
  region: string | null;
  members: number;
  admins: string[];
  openReports: number;
  since: string;
}

export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  harassment: "Harassment, threats, or hateful speech",
  discrimination: "Shutting people out by race, color, or origin",
  money: "Asking for money or selling",
  pressure: "Pressure to share, attend, or believe",
  confidence: "Breaking confidence",
  danger: "Someone may be in danger",
  spam: "Spam or not about prayer",
  other: "Something else",
};

export const REPORT_KIND_LABELS: Record<string, string> = {
  request: "A prayer request",
  response: "A reply",
  member: "A member",
  group: "A group",
};

// "leader" is the stored name for a group's admin.
export const GROUP_ROLE_LABELS: Record<string, string> = {
  leader: "Group admin",
  moderator: "Moderator",
  member: "Member",
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for a moderator",
  active: "Open",
  hidden: "Not shown",
  answered: "Answered",
};

export const TIMEZONES: [string, string][] = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["Europe/London", "London"],
  ["Africa/Lagos", "West Africa"],
  ["Africa/Nairobi", "East Africa"],
  ["Asia/Kolkata", "India"],
  ["Asia/Manila", "Philippines"],
];

/** When a session starts, in its own time zone, with the zone named. */
export function formatSessionTime(session: {
  startsAt: string;
  timezone: string;
}) {
  return new Date(session.startsAt).toLocaleString("en-US", {
    timeZone: session.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** The same moment on the viewer's own clock, when that differs. */
export function formatLocalTime(session: { startsAt: string; timezone: string }) {
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (mine === session.timezone) return null;
  return new Date(session.startsAt).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
