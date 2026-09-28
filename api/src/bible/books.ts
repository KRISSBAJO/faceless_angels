/** The 66 books, in order, with the other ways people write their names. */
export const BOOKS: { name: string; aliases: string[] }[] = [
  { name: 'Genesis', aliases: ['gen', 'ge', 'gn'] },
  { name: 'Exodus', aliases: ['exod', 'exo', 'ex'] },
  { name: 'Leviticus', aliases: ['lev', 'le', 'lv'] },
  { name: 'Numbers', aliases: ['num', 'nu', 'nm', 'nb'] },
  { name: 'Deuteronomy', aliases: ['deut', 'deu', 'de', 'dt'] },
  { name: 'Joshua', aliases: ['josh', 'jos', 'jsh'] },
  { name: 'Judges', aliases: ['judg', 'jdg', 'jg', 'jdgs'] },
  { name: 'Ruth', aliases: ['rth', 'ru'] },
  { name: '1 Samuel', aliases: ['1 sam', '1 sa', '1sam', '1sa', 'i samuel', '1st samuel', 'first samuel'] },
  { name: '2 Samuel', aliases: ['2 sam', '2 sa', '2sam', '2sa', 'ii samuel', '2nd samuel', 'second samuel'] },
  { name: '1 Kings', aliases: ['1 kgs', '1 ki', '1kgs', '1ki', 'i kings', '1st kings', 'first kings'] },
  { name: '2 Kings', aliases: ['2 kgs', '2 ki', '2kgs', '2ki', 'ii kings', '2nd kings', 'second kings'] },
  { name: '1 Chronicles', aliases: ['1 chron', '1 chr', '1 ch', '1chr', 'i chronicles', 'first chronicles'] },
  { name: '2 Chronicles', aliases: ['2 chron', '2 chr', '2 ch', '2chr', 'ii chronicles', 'second chronicles'] },
  { name: 'Ezra', aliases: ['ezr'] },
  { name: 'Nehemiah', aliases: ['neh', 'ne'] },
  { name: 'Esther', aliases: ['esth', 'est', 'es'] },
  { name: 'Job', aliases: ['jb'] },
  { name: 'Psalms', aliases: ['psalm', 'ps', 'psa', 'pss', 'psm'] },
  { name: 'Proverbs', aliases: ['prov', 'pro', 'prv', 'pr'] },
  { name: 'Ecclesiastes', aliases: ['eccles', 'eccl', 'ecc', 'ec', 'qoh'] },
  { name: 'Song of Solomon', aliases: ['song of songs', 'song', 'sos', 'so', 'canticles', 'song of sol'] },
  { name: 'Isaiah', aliases: ['isa', 'is'] },
  { name: 'Jeremiah', aliases: ['jer', 'je', 'jr'] },
  { name: 'Lamentations', aliases: ['lam', 'la'] },
  { name: 'Ezekiel', aliases: ['ezek', 'eze', 'ezk'] },
  { name: 'Daniel', aliases: ['dan', 'da', 'dn'] },
  { name: 'Hosea', aliases: ['hos', 'ho'] },
  { name: 'Joel', aliases: ['jl'] },
  { name: 'Amos', aliases: ['am'] },
  { name: 'Obadiah', aliases: ['obad', 'ob'] },
  { name: 'Jonah', aliases: ['jnh', 'jon'] },
  { name: 'Micah', aliases: ['mic', 'mc'] },
  { name: 'Nahum', aliases: ['nah', 'na'] },
  { name: 'Habakkuk', aliases: ['hab', 'hb'] },
  { name: 'Zephaniah', aliases: ['zeph', 'zep', 'zp'] },
  { name: 'Haggai', aliases: ['hag', 'hg'] },
  { name: 'Zechariah', aliases: ['zech', 'zec', 'zc'] },
  { name: 'Malachi', aliases: ['mal', 'ml'] },
  { name: 'Matthew', aliases: ['matt', 'mat', 'mt'] },
  { name: 'Mark', aliases: ['mrk', 'mar', 'mk', 'mr'] },
  { name: 'Luke', aliases: ['luk', 'lk'] },
  { name: 'John', aliases: ['joh', 'jhn', 'jn'] },
  { name: 'Acts', aliases: ['act', 'ac', 'acts of the apostles'] },
  { name: 'Romans', aliases: ['rom', 'ro', 'rm'] },
  { name: '1 Corinthians', aliases: ['1 cor', '1 co', '1cor', '1co', 'i corinthians', 'first corinthians'] },
  { name: '2 Corinthians', aliases: ['2 cor', '2 co', '2cor', '2co', 'ii corinthians', 'second corinthians'] },
  { name: 'Galatians', aliases: ['gal', 'ga'] },
  { name: 'Ephesians', aliases: ['eph', 'ephes'] },
  { name: 'Philippians', aliases: ['phil', 'php', 'pp'] },
  { name: 'Colossians', aliases: ['col', 'co'] },
  { name: '1 Thessalonians', aliases: ['1 thess', '1 thes', '1 th', '1thess', 'i thessalonians', 'first thessalonians'] },
  { name: '2 Thessalonians', aliases: ['2 thess', '2 thes', '2 th', '2thess', 'ii thessalonians', 'second thessalonians'] },
  { name: '1 Timothy', aliases: ['1 tim', '1 ti', '1tim', 'i timothy', 'first timothy'] },
  { name: '2 Timothy', aliases: ['2 tim', '2 ti', '2tim', 'ii timothy', 'second timothy'] },
  { name: 'Titus', aliases: ['tit', 'ti'] },
  { name: 'Philemon', aliases: ['philem', 'phm', 'pm'] },
  { name: 'Hebrews', aliases: ['heb'] },
  { name: 'James', aliases: ['jas', 'jm'] },
  { name: '1 Peter', aliases: ['1 pet', '1 pe', '1pet', '1pe', 'i peter', 'first peter'] },
  { name: '2 Peter', aliases: ['2 pet', '2 pe', '2pet', '2pe', 'ii peter', 'second peter'] },
  { name: '1 John', aliases: ['1 jn', '1 jo', '1jn', '1john', 'i john', 'first john'] },
  { name: '2 John', aliases: ['2 jn', '2 jo', '2jn', '2john', 'ii john', 'second john'] },
  { name: '3 John', aliases: ['3 jn', '3 jo', '3jn', '3john', 'iii john', 'third john'] },
  { name: 'Jude', aliases: ['jud', 'jd'] },
  { name: 'Revelation', aliases: ['rev', 're', 'revelations', 'the revelation', 'apocalypse'] },
];

// Names shorter than four letters that are also common English words. They
// count only when written the way a reference is, like "Am 5:24".
export const RISKY = new Set(['am', 'is', 'so', 'ac', 'do', 'ex', 'ge', 'ho', 'la', 'ne', 'ob', 'song', 'job', 'mark', 'acts', 'act']);

const lookup = new Map<string, number>();
BOOKS.forEach((book, i) => {
  for (const name of [book.name, ...book.aliases]) {
    lookup.set(normalise(name), i + 1);
  }
});

function normalise(name: string) {
  return name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

/** The book number (1 to 66) for a name as someone typed it, or null. */
export function bookNumber(name: string) {
  return lookup.get(normalise(name)) ?? null;
}

/** Every way of writing a book name, longest first, for finding them in text. */
export function allNames() {
  return [...lookup.keys()].sort((a, b) => b.length - a.length);
}

export function bookName(number: number) {
  return BOOKS[number - 1]?.name ?? '';
}
