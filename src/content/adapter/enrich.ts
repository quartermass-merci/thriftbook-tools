// Parses genre + publisher from a ThriftBooks product page. Runs in the content
// script (same-origin), since neither field is in the list API. See DISCOVERY.md.
import type { Enrichment } from '@/shared/types'

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

export function parseEnrichment(html: string): Enrichment {
  const e: Enrichment = { fetchedAt: Date.now() }

  // Publisher lives in the embedded edition JSON: "Publisher":"Verso"
  const pm = html.match(/"Publisher"\s*:\s*"([^"]+)"/)
  if (pm) {
    const p = decodeEntities(pm[1]).trim()
    if (p) e.publisher = p
  }

  // Genre = the "Related Subjects" section's category links.
  const rs = html.indexOf('Related Subjects')
  if (rs >= 0) {
    const stop = html.indexOf('Customer Reviews', rs)
    const seg = html.slice(rs, stop > rs ? stop : rs + 2500)
    const genres: string[] = []
    const re = /<a[^>]+href="(?:\/b\/[^"#]+|\/browse\/[^"]+)"[^>]*>([^<]+)<\/a>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(seg))) {
      const t = decodeEntities(m[1]).trim()
      if (t && t.toLowerCase() !== 'related subjects' && !genres.includes(t)) genres.push(t)
    }
    if (genres.length) {
      e.genres = genres.slice(0, 5)
      e.genre = genres[0]
    }
  }

  return e
}

export async function fetchEnrichment(productUrl: string): Promise<Enrichment | null> {
  try {
    const res = await fetch(productUrl, { credentials: 'include' })
    if (!res.ok) return null
    return parseEnrichment(await res.text())
  } catch {
    return null
  }
}
