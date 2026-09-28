import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DbService } from '../db/db.service';
import { allNames, bookName, bookNumber, RISKY } from './books';

export const TRANSLATIONS = {
  kjv: 'King James Version',
  web: 'World English Bible',
} as const;

export type Translation = keyof typeof TRANSLATIONS;

const DATA_DIR = join(__dirname, '..', '..', 'data', 'bible');
const MAX_VERSES = 60;
const MAX_FOUND = 40;

/** A stretch of verses in one book. "to" of null means to the end of a chapter. */
interface Span {
  chapter: number;
  from: number | null;
  toChapter: number;
  to: number | null;
}

export interface Reference {
  book: number;
  spans: Span[];
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "3:16", "3:16-18", "3:16-4:2", "23", "3:16, 18, 20-22"
const PLACE = /^(\d{1,3})(?::(\d{1,3})(?:\s*[-â€“â€”]\s*(?:(\d{1,3}):)?(\d{1,3}))?)?((?:\s*,\s*\d{1,3}(?:\s*[-â€“â€”]\s*\d{1,3})?)*)$/;

/** Reads the part after the book name. Returns null when it is not a place in the Bible. */
function parsePlace(text: string): Span[] | null {
  const m = PLACE.exec(text.trim());
  if (!m) return null;
  const chapter = Number(m[1]);
  if (!m[2]) return [{ chapter, from: null, toChapter: chapter, to: null }];
  const first: Span = {
    chapter,
    from: Number(m[2]),
    toChapter: m[3] ? Number(m[3]) : chapter,
    to: m[4] ? Number(m[4]) : Number(m[2]),
  };
  const spans = [first];
  // Anything after a comma is more verses in the same chapter.
  for (const part of (m[5] ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const [a, b] = part.split(/\s*[-â€“â€”]\s*/).map(Number);
    spans.push({ chapter: first.toChapter, from: a, toChapter: first.toChapter, to: b ?? a });
  }
  return spans;
}

/** "john 3:16-18" becomes { book: 43, spans: [...] }. */
export function parseReference(text: string): Reference | null {
  const m = /^\s*(.+?)\.?\s+(\d.*)$/.exec(text.replace(/\s+/g, ' '));
  if (!m) return null;
  const book = bookNumber(m[1]);
  const spans = book ? parsePlace(m[2]) : null;
  return book && spans ? { book, spans } : null;
}

/** Writes a reference the standard way: "John 3:16-18". */
export function formatReference(ref: Reference) {
  const parts = ref.spans.map((s, i) => {
    if (s.from === null) return `${s.chapter}`;
    const start = i === 0 ? `${s.chapter}:${s.from}` : `${s.from}`;
    if (s.toChapter !== s.chapter) return `${start}-${s.toChapter}:${s.to}`;
    return s.to !== null && s.to !== s.from ? `${start}-${s.to}` : start;
  });
  // One psalm is a "Psalm". The book is "Psalms".
  const single = ref.spans.every((s) => s.chapter === ref.spans[0].chapter && s.toChapter === s.chapter);
  const name = ref.book === 19 && single ? 'Psalm' : bookName(ref.book);
  return `${name} ${parts.join(', ')}`;
}

@Injectable()
export class BibleService implements OnApplicationBootstrap {
  private readonly log = new Logger(BibleService.name);
  private finder: RegExp | null = null;

  constructor(private readonly db: DbService) {}

  // After start-up, so the tables exist: migrations run in DbService.onModuleInit.
  async onApplicationBootstrap() {
    for (const translation of Object.keys(TRANSLATIONS) as Translation[]) {
      await this.load(translation);
    }
  }

  /** Loads a translation from its file the first time the API starts. */
  private async load(translation: Translation) {
    const have = await this.db.query<{ n: number }>(
      'select count(*)::int as n from bible_verses where translation = $1',
      [translation],
    );
    if (have.rows[0].n > 30_000) return;

    const file = join(DATA_DIR, `${translation}.tsv.gz`);
    const lines = gunzipSync(await readFile(file))
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    await this.db.tx(async (client) => {
      await client.query('delete from bible_verses where translation = $1', [
        translation,
      ]);
      for (let i = 0; i < lines.length; i += 1000) {
        const batch = lines.slice(i, i + 1000).map((line) => line.split('\t'));
        const values: unknown[] = [];
        const rows = batch.map((cols, n) => {
          values.push(translation, ...cols);
          const at = n * 5;
          return `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5})`;
        });
        await client.query(
          `insert into bible_verses (translation, book, chapter, verse, text)
           values ${rows.join(', ')}`,
          values,
        );
      }
    });
    this.log.log(`Loaded ${lines.length} verses of ${TRANSLATIONS[translation]}.`);
  }

  /** The exact words of a passage, like "John 3:16-18" or "Psalm 23". */
  async passage(text: string, translation: Translation) {
    const ref = parseReference(text);
    if (!ref) {
      throw new BadRequestException(
        'Write the reference like John 3:16, Psalm 23, or 1 Cor 13:4-7.',
      );
    }
    const verses: { chapter: number; verse: number; text: string }[] = [];
    for (const span of ref.spans) {
      const found = await this.db.query<{ chapter: number; verse: number; text: string }>(
        `select chapter, verse, text from bible_verses
         where translation = $1 and book = $2
           and (chapter, verse) >= ($3::smallint, $4::smallint)
           and (chapter, verse) <= ($5::smallint, $6::smallint)
         order by chapter, verse
         limit $7`,
        [
          translation,
          ref.book,
          span.chapter,
          span.from ?? 1,
          span.toChapter,
          span.to ?? 999,
          MAX_VERSES + 1 - verses.length,
        ],
      );
      verses.push(...found.rows);
    }
    if (verses.length === 0) {
      throw new NotFoundException(
        `${formatReference(ref)} is not in the Bible. Check the chapter and verse.`,
      );
    }
    if (verses.length > MAX_VERSES) {
      throw new BadRequestException(
        `That is more than ${MAX_VERSES} verses. Quote a shorter passage.`,
      );
    }
    const many = new Set(verses.map((v) => v.chapter)).size > 1;
    return {
      reference: formatReference(ref),
      translation,
      translationName: TRANSLATIONS[translation],
      verses,
      // Verse numbers are added only when there is more than one verse.
      text:
        verses.length === 1
          ? verses[0].text
          : verses
              .map((v) => `${many ? `${v.chapter}:` : ''}${v.verse} ${v.text}`)
              .join(' '),
    };
  }

  /** Finds references written in a piece of text, like "as John 3:16 says". */
  find(text: string) {
    if (!this.finder) {
      const names = allNames().map((n) => escape(n).replace(/ /g, '\\s+'));
      this.finder = new RegExp(
        `(?<![A-Za-z])(${names.join('|')})\\.?\\s+(\\d{1,3}(?::\\d{1,3}(?:\\s*[-â€“â€”]\\s*(?:\\d{1,3}:)?\\d{1,3})?(?:\\s*,\\s*\\d{1,3}(?:\\s*[-â€“â€”]\\s*\\d{1,3})?)*)?)(?![\\d:])`,
        'gi',
      );
    }
    const found = new Map<string, { reference: string; at: number }>();
    for (const m of text.matchAll(this.finder)) {
      const name = m[1];
      const place = m[2];
      // "am 5" is usually English, "Am 5:24" is Amos. Short names need a verse
      // and a capital letter.
      if (RISKY.has(name.toLowerCase()) && (!place.includes(':') || name[0] === name[0].toLowerCase())) {
        continue;
      }
      // A chapter alone counts only for a full book name, like "Psalm 23".
      if (!place.includes(':') && name.length < 4) continue;
      const ref = parseReference(`${name} ${place}`);
      if (!ref) continue;
      const reference = formatReference(ref);
      if (!found.has(reference)) found.set(reference, { reference, at: m.index ?? 0 });
      if (found.size >= MAX_FOUND) break;
    }
    return [...found.values()];
  }
}
