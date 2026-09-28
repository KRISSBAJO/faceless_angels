import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { SessionUser } from '../auth/auth.service';
import { BibleService } from '../bible/bible.service';
import { DbService } from '../db/db.service';
import { sniffImageType, VaultService } from '../storage/vault.service';

/** The parts of a page element the converter hands to our rules. */
interface Element {
  nodeName: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelector(selector: string): unknown;
  querySelectorAll(selector: string): ArrayLike<Element>;
}

const MAX_UNPACKED_BYTES = 80 * 1024 * 1024;
const MAX_PICTURES = 20;
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
const MAX_SCRIPTURE = 12;

// Word's own paragraph styles, mapped to what the Journal shows.
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  'u => em',
];

export interface ImportedArticle {
  title: string;
  summary: string;
  body: string;
  scripture: { ref: string; text: string; translation: 'kjv' }[];
  pictures: number;
  /** Things the writer should check, in plain words. */
  notes: string[];
}

@Injectable()
export class WordImportService {
  private readonly log = new Logger(WordImportService.name);

  constructor(
    private readonly db: DbService,
    private readonly vault: VaultService,
    private readonly bible: BibleService,
  ) {}

  /**
   * Reads a Word file into a draft. Nothing is saved as an article: the
   * writer checks it in the editor first. Pictures are stored, because the
   * draft points at them.
   */
  async fromWord(
    viewer: SessionUser,
    file: { originalname: string; buffer: Buffer } | undefined,
  ): Promise<ImportedArticle> {
    if (!file) throw new BadRequestException('Choose a Word file to import.');
    await this.checkFile(file);

    const notes: string[] = [];
    let pictures = 0;
    let skipped = 0;

    const converted = await mammoth.convertToHtml(
      { buffer: file.buffer },
      {
        styleMap: STYLE_MAP,
        convertImage: mammoth.images.imgElement(async (image) => {
          const bytes = Buffer.from(await image.readAsArrayBuffer());
          if (
            pictures >= MAX_PICTURES ||
            bytes.length > MAX_PICTURE_BYTES ||
            !sniffImageType(bytes)
          ) {
            skipped += 1;
            return { src: '' };
          }
          pictures += 1;
          return { src: await this.storePicture(viewer, bytes) };
        }),
      },
    );

    if (skipped > 0) {
      notes.push(
        `${skipped} picture${skipped === 1 ? " was" : "s were"} left out. Pictures must be JPG, PNG, or WebP, up to 5 MB, and no more than ${MAX_PICTURES} per article.`,
      );
    }
    if (converted.messages.some((m) => m.type === 'warning')) {
      notes.push(
        'Some formatting in the Word file has no match in the Journal, like colours or fonts. The words are all here.',
      );
    }

    const { title, summary, html } = this.takeTitle(converted.value);
    const body = this.toMarkdown(html);
    if (!body.trim()) {
      throw new BadRequestException('The Word file has no text in it.');
    }
    if (!title) {
      notes.push('The file has no title. Add one above the article.');
    }
    if (pictures > 0) {
      notes.push(
        `${pictures} picture${pictures === 1 ? " is" : "s are"} in the article. Replace “Describe the picture” where you see it.`,
      );
    }

    const scripture = await this.scripture(body);
    if (scripture.length > 0) {
      notes.push(
        `We found ${scripture.length} Bible reference${scripture.length === 1 ? '' : 's'} and filled in the King James words. Check them, or switch to the World English Bible.`,
      );
    }

    return {
      title,
      summary,
      body,
      scripture,
      pictures,
      notes,
    };
  }

  /** Refuses anything that is not a real Word file, including zip bombs. */
  private async checkFile(file: { originalname: string; buffer: Buffer }) {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.doc')) {
      throw new BadRequestException(
        'That is an older Word file (.doc). Open it in Word, choose Save As, and pick Word Document (.docx).',
      );
    }
    // A .docx file is a zip, and every zip starts with these bytes.
    if (!file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new BadRequestException('Upload a Word document (.docx).');
    }
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file.buffer);
    } catch {
      throw new BadRequestException('The Word file is damaged. Save it again and retry.');
    }
    if (!zip.file('word/document.xml')) {
      throw new BadRequestException('Upload a Word document (.docx).');
    }
    // The sizes the zip claims for its contents, before anything is unpacked.
    let unpacked = 0;
    zip.forEach((_path, entry) => {
      const size = (entry as unknown as { _data?: { uncompressedSize?: number } })
        ._data?.uncompressedSize;
      unpacked += size ?? 0;
    });
    if (unpacked > MAX_UNPACKED_BYTES) {
      throw new BadRequestException(
        'The Word file is too large once opened. Split it into smaller articles.',
      );
    }
  }

  private async storePicture(viewer: SessionUser, bytes: Buffer) {
    const stored = await this.vault.put('journal', bytes, { published: true });
    const inserted = await this.db.query<{ id: string }>(
      `insert into journal_media
         (storage, storage_key, mime_type, size_bytes, uploaded_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [stored.storage, stored.key, sniffImageType(bytes), bytes.length, viewer.id],
    );
    return `/api/journal/media/${inserted.rows[0].id}`;
  }

  /** The first heading is the title. A Subtitle paragraph is the summary. */
  private takeTitle(html: string) {
    let title = '';
    let summary = '';
    let rest = html.replace(/^\s*<h1>([\s\S]*?)<\/h1>/, (_m, text: string) => {
      title = this.plain(text);
      return '';
    });
    if (!title) {
      rest = rest.replace(/^\s*<h2>([\s\S]*?)<\/h2>/, (_m, text: string) => {
        title = this.plain(text);
        return '';
      });
    }
    rest = rest.replace(/<p class="subtitle">([\s\S]*?)<\/p>/, (_m, text: string) => {
      summary = this.plain(text).slice(0, 400);
      return '';
    });
    return { title: title.slice(0, 160), summary, html: rest };
  }

  private toMarkdown(html: string) {
    const turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      emDelimiter: '_',
      codeBlockStyle: 'fenced',
    });
    turndown.use(gfm);
    // Word's empty paragraphs and page breaks add nothing.
    turndown.addRule('emptyParagraph', {
      filter: (node) => {
        const el = node as unknown as Element;
        return el.nodeName === 'P' && !el.textContent?.trim() && !el.querySelector('img');
      },
      replacement: () => '',
    });
    // Word tables rarely mark a header row, so the first row is used as one.
    turndown.addRule('table', {
      filter: 'table',
      replacement: (_content, node) => {
        const cell = (el: Element) =>
          (el.textContent ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
        const rows = Array.from((node as unknown as Element).querySelectorAll('tr'))
          .map((tr) => Array.from(tr.querySelectorAll('th, td')).map(cell))
          .filter((row) => row.some(Boolean));
        if (rows.length === 0) return '';
        const width = Math.max(...rows.map((r) => r.length));
        const line = (r: string[]) =>
          `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
        return `\n\n${[
          line(rows[0]),
          `| ${Array(width).fill('---').join(' | ')} |`,
          ...rows.slice(1).map(line),
        ].join('\n')}\n\n`;
      },
    });
    turndown.addRule('picture', {
      filter: 'img',
      replacement: (_content, node) => {
        const el = node as unknown as Element;
        const src = el.getAttribute('src') ?? '';
        if (!src) return '';
        const alt = el.getAttribute('alt')?.trim() || 'Describe the picture';
        return `\n\n![${alt.replace(/[[\]]/g, '')}](${src})\n\n`;
      },
    });
    return (
      turndown
        .turndown(html)
        // One heading level for the whole page is the article title.
        .replace(/^# /gm, '## ')
        .replace(/^(\s*)([-*]|\d+\.)\s{2,}/gm, '$1$2 ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  private async scripture(body: string) {
    const found = this.bible.find(body).slice(0, MAX_SCRIPTURE);
    const out: ImportedArticle['scripture'] = [];
    for (const item of found) {
      try {
        const passage = await this.bible.passage(item.reference, 'kjv');
        out.push({ ref: passage.reference, text: passage.text, translation: 'kjv' });
      } catch (err) {
        // A reference that is not in the Bible, like John 99:1, is skipped.
        this.log.debug(`Skipped ${item.reference}: ${String(err)}`);
      }
    }
    return out;
  }

  private plain(html: string) {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
