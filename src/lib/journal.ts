export interface ArticleCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  kind: string;
  category: { key: string; label: string };
  tags: string[];
  cover: { id: string; alt: string } | null;
  publishedAt: string | null;
  readingMinutes: number;
  featured: boolean;
  series: { slug: string; title: string; position: number | null } | null;
  author: {
    id: string;
    name: string;
    title: string | null;
    photo: string | null;
  };
  snippet: string | null;
}

export interface AuthorProfile {
  id: string;
  name: string;
  title: string | null;
  bio: string | null;
  photo: string | null;
  articles: number;
}

export interface JournalCategory {
  key: string;
  label: string;
  description: string;
  articles: number;
}

export interface JournalSeries {
  slug: string;
  title: string;
  description: string;
  articles: number;
}

export interface JournalHome {
  featured: ArticleCard | null;
  dailyBread: ArticleCard | null;
  latest: ArticleCard[];
  categories: JournalCategory[];
  series: JournalSeries[];
}

export interface ArticleList {
  articles: ArticleCard[];
  total: number;
  page: number;
  pages: number;
}

export interface Article extends Omit<ArticleCard, "author"> {
  body: string;
  scripture: { ref: string; text?: string }[];
  reflection: string[];
  action: string;
  allowComments: boolean;
  live: boolean;
  status: string;
  updatedAt: string;
  reviewedBy: string | null;
  author: ArticleCard["author"] & { bio: string | null };
  corrections: { body: string; at: string }[];
  reactions: Record<string, number>;
  comments: number;
  seriesArticles: {
    slug: string;
    title: string;
    position: number | null;
    current: boolean;
  }[];
  previous: ArticleCard | null;
  next: ArticleCard | null;
  related: ArticleCard[];
  mine: {
    reactions: string[];
    saved: boolean;
    finished: boolean;
    note: string;
    followsCategory: boolean;
  } | null;
}

export interface Comment {
  id: string;
  by: string;
  staff: boolean;
  mine: boolean;
  body: string;
  waiting: boolean;
  at: string;
  replies?: Comment[];
}

export interface Library {
  saved: ArticleCard[];
  reading: ArticleCard[];
  notes: { article: ArticleCard; note: string; at: string }[];
  follows: { key: string; label: string }[];
}

export interface StudioArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  kind: string;
  category: { key: string; label: string };
  tags: string[];
  cover: { id: string; alt: string } | null;
  scripture: { ref: string; text?: string }[];
  reflection: string[];
  action: string;
  seriesId: string | null;
  seriesPosition: number | null;
  author: { id: string; name: string };
  reviewer: { id: string; name: string } | null;
  stage: string;
  reviewNote: string | null;
  publishedAt: string | null;
  featured: boolean;
  allowComments: boolean;
  readingMinutes: number;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  can: { edit: boolean; review: boolean; publish: boolean; manage: boolean };
}

export interface StudioArticleDetail extends StudioArticle {
  revisions: {
    id: string;
    title: string;
    note: string | null;
    by: string;
    words: number;
    at: string;
  }[];
  corrections: { id: string; body: string; at: string }[];
}

export interface ArticleStats {
  views: number;
  last30Days: { day: string; views: number }[];
  readersStarted: number;
  readersFinished: number;
  reactions: Record<string, number>;
  comments: number;
  saved: number;
  notes: number;
}

export interface Desk {
  stages: Record<string, number>;
  waitingForYou: number;
  commentsToCheck: number;
  mostRead: { slug: string; title: string; views: number }[];
}

export interface StudioCategory {
  key: string;
  label: string;
  description: string;
  sort: number;
  enabled: boolean;
  articles: number;
}

export interface StudioSeries {
  id: string;
  slug: string;
  title: string;
  description: string;
  articles: number;
}

export interface QueuedComment {
  id: string;
  body: string;
  waiting: boolean;
  hidden: boolean;
  by: string;
  article: { title: string; slug: string };
  reports: string[];
  at: string;
}

export const KIND_LABELS: Record<string, string> = {
  teaching: "Teaching",
  devotional: "Devotional",
  testimony: "Testimony",
  story: "True story",
};

export const KIND_NOTES: Record<string, string> = {
  teaching: "Explains scripture or Christian living. Needs a scripture reference.",
  devotional: "A short reading for the day. Needs a scripture reference.",
  testimony: "What God did, told by the person it happened to, with their consent.",
  story: "A true account of help given. Details are changed so no one can be identified.",
};

export const ACTION_LABELS: Record<string, string> = {
  none: "Nothing",
  pray: "Invite the reader to ask for prayer",
  group: "Invite the reader to join a prayer group",
  give: "Show needs the reader can help with",
  ask: "Invite the reader to ask for help",
};

export const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "Waiting for review",
  changes_requested: "Changes asked for",
  approved: "Approved, not published",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

export const REACTION_LABELS: Record<string, string> = {
  amen: "Amen",
  encouraged: "This encouraged me",
  praying: "Praying about this",
};

export function mediaUrl(id: string) {
  return `/api/journal/media/${id}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function minutes(n: number) {
  return n === 1 ? "1 minute" : `${n} minutes`;
}
