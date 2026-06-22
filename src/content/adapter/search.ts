// Catalog search for Discover. Browse pages are server-rendered and public
// (the WAF only blocks the JSON API), so we fetch the HTML and parse the result
// tiles. Real result tiles carry `resultid=` in their link — that filters out
// recommendation carousels. See the captured tile markup in DISCOVERY.md.
import type { SearchCandidate } from '@/shared/types'
import { fetchWithTimeout } from './http'

const BASE = 'https://www.thriftbooks.com'

export function parseSearchResults(html: string): SearchCandidate[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: SearchCandidate[] = []
  const seen = new Set<string>()
  for (const tile of doc.querySelectorAll('.AllEditionsItem-tile')) {
    const link = tile.querySelector('.AllEditionsItem-tileTitle a') as HTMLAnchorElement | null
    const href = link?.getAttribute('href') ?? ''
    const workMatch = href.match(/\/w\/[^/]*\/(\d+)\//)
    if (!link || !workMatch) continue
    const workId = workMatch[1]
    if (seen.has(workId)) continue
    seen.add(workId)
    const amount = tile.querySelector('.SearchResultListItem-dollarAmount')?.textContent?.trim()
    const priceNum = amount ? parseFloat(amount.replace(/[^\d.]/g, '')) : NaN
    out.push({
      workId,
      isbn: href.match(/#isbn=([\w-]+)/)?.[1],
      title: link.textContent?.trim() ?? '',
      author: tile.querySelector('a[itemprop="author"]')?.textContent?.trim() || undefined,
      coverImageUrl: tile.querySelector('.SearchResultTileItem-photo img')?.getAttribute('src') || undefined,
      priceCents: Number.isFinite(priceNum) ? Math.round(priceNum * 100) : undefined,
      format: tile.querySelector('.SearchResultTileItem-format strong')?.textContent?.trim() || undefined,
      productUrl: BASE + href.split('?')[0].split('#')[0],
    })
  }
  return out
}

/** Fetch one browse/search page (logged-in, same-origin) and parse its results. */
export async function fetchSearch(query: string): Promise<SearchCandidate[]> {
  const res = await fetchWithTimeout(`${BASE}/browse/?b.search=${encodeURIComponent(query)}`, { credentials: 'include' }, 9000)
  if (!res.ok) return []
  return parseSearchResults(await res.text())
}

/** Pull the default edition id out of a work page's HTML — needed to add to a wishlist. */
export function findEditionId(workHtml: string): string | undefined {
  return (
    workHtml.match(/["']?idEdition["']?\s*[:=]\s*["']?(\d+)/i)?.[1] ??
    workHtml.match(/(?:id-?edition|edition-?id)\W{1,4}(\d{4,})/i)?.[1]
  )
}
