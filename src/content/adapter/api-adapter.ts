// API-first data acquisition. Runs in the content script (same-origin to
// thriftbooks.com, so credentialed fetches just work). See DISCOVERY.md.
import { listItemsUrl, listViewUrl, HYDRATE_ANCHOR, LIST_ITEMS_PER_PAGE } from './selectors'
import type { RawListItem, RawListResponse, RawHydrate, RawListMeta } from './selectors'

/** Extract the embedded hydrate object from a list-view page's HTML. */
export function parseHydrate(html: string): RawHydrate | null {
  const a = html.indexOf(HYDRATE_ANCHOR)
  if (a < 0) return null
  const start = html.indexOf('{', a)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let p = start; p < html.length; p++) {
    const c = html[p]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = p + 1
        break
      }
    }
  }
  if (end < 0) return null
  try {
    return JSON.parse(html.slice(start, end)) as RawHydrate
  } catch {
    return null
  }
}

async function getListPage(idList: number | string, pageNum: number): Promise<RawListResponse | null> {
  const res = await fetch(listItemsUrl(idList, pageNum), {
    credentials: 'include',
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return null
  try {
    return (await res.json()) as RawListResponse
  } catch {
    return null
  }
}

/** Fetch every item of a list, paging until a short page (server caps at 25/page). */
export async function fetchListItems(idList: number | string): Promise<RawListItem[]> {
  const all: RawListItem[] = []
  for (let page = 1; page <= 200; page++) {
    const resp = await getListPage(idList, page)
    const items = resp?.ListItems ?? []
    all.push(...items)
    if (items.length < LIST_ITEMS_PER_PAGE) break
  }
  return all
}

/** Enumerate the user's lists by reading any list-view page's embedded hydrate. */
export async function fetchListIndex(seedIdList: number | string): Promise<RawListMeta[]> {
  const res = await fetch(listViewUrl(seedIdList), { credentials: 'include' })
  if (!res.ok) return []
  const hydrate = parseHydrate(await res.text())
  const lists = [...(hydrate?.otherLists ?? []), ...(hydrate?.sharedWithMeLists ?? [])]
  const seen = new Set<number>()
  return lists.filter((l) => (seen.has(l.IdList) ? false : (seen.add(l.IdList), true)))
}
