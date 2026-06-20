/** Parse a ThriftBooks date string ("4/10/2014 12:00:00 AM" or ISO) to epoch ms.
 *  Returns undefined for missing or sentinel ("0001-01-01") dates. */
export function parseDate(s?: string): number | undefined {
  if (!s) return undefined
  const t = Date.parse(s)
  if (Number.isNaN(t)) return undefined
  const d = new Date(t)
  return d.getFullYear() < 1900 ? undefined : t
}

export function fmtDate(s?: string | number): string {
  if (s == null) return '—'
  const ms = typeof s === 'number' ? s : parseDate(s)
  if (ms == null) return '—'
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "J.G. Ballard" -> "Ballard, J.G."; single-token names pass through. */
export function authorSortName(name?: string): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name.trim()
  const last = parts[parts.length - 1]
  return `${last}, ${parts.slice(0, -1).join(' ')}`
}
