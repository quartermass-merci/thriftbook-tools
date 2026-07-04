// Open Library (Internet Archive) catalog search — used to enumerate a publisher's
// or author's titles, which ThriftBooks' own search can't do (it has no publisher
// facet). Fetched from the SERVICE WORKER: Open Library sends no CORS headers, so a
// content script on thriftbooks.com can't read it, but the SW bypasses CORS via the
// openlibrary.org host permission. Keep this file free of Chrome/runtime deps.

export type CollectionKind = 'publisher' | 'author'

/** A normalized Open Library work — just the fields we need to match to ThriftBooks. */
export interface OlDoc {
  title: string
  authors: string[]
  isbns: string[]
  publishers: string[]
  year?: number
  coverId?: number
}

export interface OlResult {
  docs: OlDoc[]
  total: number
}

// Ask Open Library for only the fields we use — keeps the response small.
const FIELDS = 'title,author_name,isbn,publisher,first_publish_year,cover_i'

/** Build a search.json URL. Publisher/author map to Open Library's fielded params. */
export function buildOlSearchUrl(kind: CollectionKind, name: string, offset = 0, limit = 50): string {
  const p = new URLSearchParams()
  p.set(kind === 'author' ? 'author' : 'publisher', name)
  p.set('fields', FIELDS)
  p.set('limit', String(Math.min(100, Math.max(1, limit))))
  p.set('offset', String(Math.max(0, offset)))
  // No sort — Open Library's default relevance ranks a publisher's own titles first.
  // (sort=editions wrongly surfaced mega-republished classics like Hamlet that merely
  // have a single edition from this publisher.)
  return `https://openlibrary.org/search.json?${p.toString()}`
}

interface RawDoc {
  title?: string
  author_name?: string[]
  isbn?: string[]
  publisher?: string[]
  first_publish_year?: number
  cover_i?: number
}

export function normalizeOlResponse(json: unknown): OlResult {
  const j = json as { docs?: RawDoc[]; numFound?: number } | null
  const docs: OlDoc[] = (j?.docs ?? [])
    .filter((d): d is RawDoc & { title: string } => typeof d?.title === 'string' && d.title.length > 0)
    .map((d) => ({
      title: d.title,
      authors: d.author_name ?? [],
      isbns: d.isbn ?? [],
      publishers: d.publisher ?? [],
      year: d.first_publish_year,
      coverId: d.cover_i,
    }))
  return { docs, total: j?.numFound ?? docs.length }
}
