// Canonicalizes noisy ThriftBooks publisher strings so variants of the same
// house collapse together — e.g. "New Directions Publishing Corporation",
// "New Directions Books", and "  New Directions" all become "New Directions".
// Used by the Publisher facet/column and the free-credit scan's affinity.

// Trailing corporate words to peel off (one at a time, repeatedly). "Press" is
// intentionally NOT here — it's part of an identity (MIT Press, Graywolf Press).
const SUFFIXES = new Set([
  'publishing', 'publishers', 'publications', 'publisher',
  'corporation', 'company', 'incorporated', 'limited',
  'group', 'house', 'books', 'inc', 'llc', 'ltd', 'co',
])

const cache = new Map<string, string | undefined>()
export function normalizePublisher(raw?: string | null): string | undefined {
  if (!raw) return undefined
  if (cache.has(raw)) return cache.get(raw)
  let s = raw.replace(/\s+/g, ' ').trim()
  if (!s) { cache.set(raw, undefined); return undefined }
  const original = s
  let changed = true
  while (changed && s) {
    changed = false
    s = s.replace(/[.,&\s]+$/, '')
    const lastSpace = s.lastIndexOf(' ')
    if (lastSpace <= 0) break // never strip the only word
    const lastWord = s.slice(lastSpace + 1).toLowerCase().replace(/[.,]/g, '')
    if (SUFFIXES.has(lastWord)) {
      s = s.slice(0, lastSpace)
      changed = true
    }
  }
  s = s.replace(/[.,&\s]+$/, '').trim()
  const result = s || original
  cache.set(raw, result)
  return result
}
