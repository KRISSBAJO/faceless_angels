import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SessionUser } from '../auth/auth.service';
import { config, JOURNAL_STAFF_ROLES, type Role } from '../config';

export const KINDS = ['teaching', 'devotional', 'testimony', 'story'] as const;
export const ACTIONS = ['none', 'pray', 'group', 'give', 'ask'] as const;
export const REACTIONS = ['amen', 'encouraged', 'praying'] as const;
export const SHARE_CHANNELS = [
  'device',
  'whatsapp',
  'facebook',
  'x',
  'linkedin',
  'email',
  'link',
] as const;

const WORDS_PER_MINUTE = 220;

export function isJournalStaff(user: SessionUser | undefined) {
  return !!user && JOURNAL_STAFF_ROLES.includes(user.role as Role);
}

const RESERVED = [
  'studio',
  'library',
  'search',
  'category',
  'series',
  'unsubscribe',
  'article',
];

/**
 * "Giving in Secret: Matthew 6" becomes "giving-in-secret-matthew-6".
 * A title that would take the address of a Journal page gets a suffix.
 */
export function slugify(text: string) {
  const slug =
    text
      .toLowerCase()
      // Split accented letters, then drop the accents.
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['\u2019]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'article';
  return RESERVED.includes(slug) ? `${slug}-article` : slug;
}

export function readingMinutes(body: string) {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Strips Markdown marks, for search results and email previews. */
export function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/^[>#\-*+]+\s*/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Unsubscribe links must work without sign-in and must not be guessable.
// The signature is tied to one person and one category.
function sign(userId: string, category: string) {
  return createHmac('sha256', `journal-unsubscribe:${config.storage.encryptionKey}`)
    .update(`${userId}:${category}`)
    .digest('base64url');
}

export function unsubscribeToken(userId: string, category: string) {
  return `${userId}.${category}.${sign(userId, category)}`;
}

export function readUnsubscribeToken(token: string) {
  const [userId, category, signature] = token.split('.');
  if (!userId || !category || !signature) return null;
  const expected = Buffer.from(sign(userId, category));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  return { userId, category };
}
