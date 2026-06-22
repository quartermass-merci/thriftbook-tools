// Buckets a book's raw ThriftBooks "Related Subjects" (it.genres, up to 5 noisy
// strings) into one curated reading category. The subject strings are too messy
// to filter on directly, so we classify. Used by the Category facet + free-book scan.

export const CATEGORIES = [
  'Literary Fiction',
  'Sci-Fi',
  'Fantasy',
  'Horror/Weird',
  'Crime/Mystery',
  'Poetry',
  'Drama/Plays',
  'Biography/Memoir',
  'History',
  'Philosophy/Theory',
  'Cooking',
  'Art/Design',
  'Kids/YA',
  'Reference/Other',
] as const
export type Category = (typeof CATEGORIES)[number]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Ordered most-specific → most-general; the FIRST matching rule wins. Specific
// fiction genres are tested before the catch-all "Literary Fiction" so e.g. a
// sci-fi novel tagged both "Fiction" and "Science Fiction" lands in Sci-Fi.
// Keywords match on a word boundary (\bart matches "Art"/"Arts" but not "smart").
const RULES: Array<[Category, string[]]> = [
  ['Kids/YA', ['juvenile', 'young adult', 'children', 'middle grade', 'picture book', 'teen', 'board book']],
  ['Poetry', ['poetry', 'poems', 'verse']],
  ['Drama/Plays', ['drama', 'plays', 'playwright', 'theater', 'theatre', 'shakespeare']],
  ['Horror/Weird', ['horror', 'weird', 'gothic', 'supernatural', 'occult', 'ghost', 'vampire']],
  ['Sci-Fi', ['science fiction', 'sci-fi', 'dystopian', 'cyberpunk', 'space opera', 'speculative']],
  ['Fantasy', ['fantasy', 'mythology', 'fairy tale', 'dragons', 'sword']],
  ['Crime/Mystery', ['mystery', 'crime', 'thriller', 'detective', 'noir', 'suspense', 'espionage']],
  ['Literary Fiction', ['literary fiction', 'literary collections', 'fiction', 'literary', 'novel', 'short stories']],
  ['Biography/Memoir', ['biography', 'autobiography', 'memoir', 'diaries', 'correspondence', 'letters']],
  ['History', ['history', 'historical', 'ancient', 'medieval', 'civilization', 'holocaust']],
  ['Philosophy/Theory', ['philosophy', 'political', 'social science', 'cultural studies', 'criticism', 'theory', 'essays', 'sociology', 'psychology', 'economics', 'feminis', 'marx', 'religion', 'spiritual']],
  ['Cooking', ['cooking', 'cookbook', 'food', 'culinary', 'wine', 'baking']],
  ['Art/Design', ['art', 'design', 'photography', 'architecture', 'music', 'painting', 'sculpture', 'comics', 'graphic novel']],
]

const RULES_RE: Array<[Category, RegExp]> = RULES.map(([c, kws]) => [
  c,
  new RegExp('\\b(' + kws.map(escapeRe).join('|') + ')', 'i'),
])

/** Classify an item by its subjects. Returns null when no subject data exists yet
 *  (not enriched), so callers can distinguish "uncategorized" from "Reference/Other". */
const catCache = new WeakMap<object, Category | null>()
export function categorize(it: { genres?: string[]; genre?: string }): Category | null {
  const hit = catCache.get(it)
  if (hit !== undefined) return hit
  const subs = it.genres?.length ? it.genres : it.genre ? [it.genre] : []
  let result: Category | null = null
  if (subs.length) {
    const text = subs.join(' · ')
    result = 'Reference/Other'
    for (const [cat, re] of RULES_RE) {
      if (re.test(text)) { result = cat; break }
    }
  }
  catCache.set(it, result)
  return result
}

/** Index of a category in the curated order (for sorting the facet). */
export function categoryRank(c: string): number {
  const i = (CATEGORIES as readonly string[]).indexOf(c)
  return i < 0 ? CATEGORIES.length : i
}
