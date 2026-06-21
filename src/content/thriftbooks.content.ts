// Runs on thriftbooks.com/list/* as the logged-in user. Builds a complete
// snapshot across all sub-lists via the API adapter, persists it, and notifies
// open UI. Auto-syncs on load (throttled); also responds to SYNC_NOW.
import { apiDataSource, parseHydrate } from './adapter'
import { putSnapshot, updateSnapshot, getSnapshot, getLastSyncAt, getItemStates, putItemStates, getSettings, getPriceHistory, setPriceHistory } from '@/shared/storage/repo'
import { diffSnapshot } from '@/shared/diff/snapshotDiff'
import type { DiffEvents } from '@/shared/diff/snapshotDiff'
import { broadcast } from '@/shared/messaging/bus'
import { isFreeBookEligible } from '@/shared/types'
import type { WishlistSnapshot, WishlistItem, ItemState, Settings, NotificationTrigger, Enrichment, SearchCandidate, DiscoverQuery } from '@/shared/types'
import { getEnrichmentMap, setEnrichmentMap } from '@/shared/storage/enrichment'
import { fetchEnrichment } from './adapter/enrich'
import { fetchSearch, findEditionId } from './adapter/search'
import { formatCents } from '@/shared/util/money'
import type { Msg, SyncAck, DeleteAck, EnrichAck, DiscoverAck, AddAck, NotifyItem } from '@/shared/messaging/protocol'

const SYNC_THROTTLE_MS = 90_000

/** Any one of the user's list ids — used to enumerate the rest. */
function seedListId(): number | string | null {
  const m = location.pathname.match(/\/list\/view\/(\d+)\//)
  if (m) return m[1]
  const h = parseHydrate(document.documentElement.outerHTML)
  if (h?.idList) return h.idList
  if (h?.otherLists && h.otherLists.length) return h.otherLists[0].IdList
  const link = document.querySelector('a[href*="/list/view/"]')
  const mm = link?.getAttribute('href')?.match(/\/list\/view\/(\d+)\//)
  return mm ? mm[1] : null
}

/** Turn diff events into deduped, cooldown-gated notification candidates (mutates lastNotified on states). */
function computeNotifications(
  snapshot: WishlistSnapshot,
  states: Record<string, ItemState>,
  events: DiffEvents,
  settings: Settings,
  now: number,
): NotifyItem[] {
  const COOLDOWN = 12 * 60 * 60 * 1000
  const itemById = new Map(snapshot.items.map((i) => [i.id, i]))
  const out: NotifyItem[] = []
  const done = new Set<string>()
  const add = (id: string, trigger: NotificationTrigger, kind: string, detail: string) => {
    if (done.has(id)) return
    const st = states[id]
    const item = itemById.get(id)
    if (!st || !item) return
    const last = st.lastNotified[trigger]
    if (last && now - last < COOLDOWN) return
    st.lastNotified = { ...st.lastNotified, [trigger]: now }
    done.add(id)
    out.push({ id, title: item.title, url: item.productUrl ?? '', kind, detail })
  }
  if (settings.notif.newlyInStock) {
    for (const id of events.newlyInStock) {
      const item = itemById.get(id)
      const free = !!item && settings.notif.freeBookEligible && isFreeBookEligible(item, settings.freeBookCeilingCents)
      add(
        id,
        free ? 'freeBookEligible' : 'newlyInStock',
        free ? 'Back in stock — free-book pick!' : 'Back in stock',
        item ? formatCents(item.lowestPriceCents) : '',
      )
    }
  }
  if (settings.notif.priceDrop) {
    for (const d of events.priceDrops) {
      const pct = d.fromCents > 0 ? ((d.fromCents - d.toCents) / d.fromCents) * 100 : 0
      if (pct >= settings.notif.priceDropPct) {
        add(d.id, 'priceDrop', 'Price drop', `${formatCents(d.toCents)} (was ${formatCents(d.fromCents)})`)
      }
    }
  }
  return out
}

const ENRICH_BATCH = 25
const ENRICH_DELAY = 350

function mergeEnrichment(items: WishlistItem[], map: Record<string, Enrichment>): void {
  for (const it of items) {
    const e = it.productId ? map[it.productId] : undefined
    if (!e) continue
    if (e.genre) it.genre = e.genre
    if (e.genres) it.genres = e.genres
    if (e.publisher) it.publisher = e.publisher
  }
}

/** Fetch + cache enrichment for a batch of not-yet-enriched items, then re-merge into the snapshot. */
async function enrichBatch(items: WishlistItem[], map: Record<string, Enrichment>): Promise<void> {
  const todo = items.filter((it) => it.productId && it.productUrl && !map[it.productId]).slice(0, ENRICH_BATCH)
  if (!todo.length) return
  let changed = false
  for (const it of todo) {
    const e = await fetchEnrichment(it.productUrl as string)
    if (e) {
      map[it.productId as string] = e
      changed = true
    }
    await new Promise((r) => setTimeout(r, ENRICH_DELAY))
  }
  if (!changed) return
  await setEnrichmentMap(map)
  const snap = await getSnapshot()
  if (snap) {
    mergeEnrichment(snap.items, map)
    await updateSnapshot(snap)
    broadcast({ type: 'SNAPSHOT_UPDATED', capturedAt: snap.capturedAt, itemCount: snap.items.length })
  }
}

let enriching = false
/** Enrich EVERY not-yet-enriched item (not just a batch), persisting + re-merging
 *  every 10 so the dashboard's progress bar climbs live. */
async function enrichAll(): Promise<EnrichAck> {
  if (enriching) return { ok: false, error: 'already enriching' }
  const snap0 = await getSnapshot()
  if (!snap0) return { ok: false, error: 'Sync your wishlist first.' }
  enriching = true
  try {
    const map = await getEnrichmentMap()
    const todo = snap0.items.filter((it) => it.productId && it.productUrl && !map[it.productId])
    const flush = async () => {
      await setEnrichmentMap(map)
      const s = await getSnapshot()
      if (s) {
        mergeEnrichment(s.items, map)
        await updateSnapshot(s)
        broadcast({ type: 'SNAPSHOT_UPDATED', capturedAt: s.capturedAt, itemCount: s.items.length })
      }
    }
    let done = 0
    for (const it of todo) {
      const e = await fetchEnrichment(it.productUrl as string)
      if (e) map[it.productId as string] = e
      done++
      if (done % 10 === 0) {
        await flush()
        setMarker(`Enriching… ${done}/${todo.length}`)
      }
      await new Promise((r) => setTimeout(r, ENRICH_DELAY))
    }
    await flush()
    setMarker(`✓ Enriched ${done} books`)
    return { ok: true, enriched: done }
  } catch (e) {
    return { ok: false, error: String(e) }
  } finally {
    enriching = false
  }
}

/** Append a price point per in-stock item whenever its lowest price changed (capped). */
async function capturePrices(snapshot: WishlistSnapshot, now: number): Promise<void> {
  const hist = await getPriceHistory()
  let changed = false
  for (const it of snapshot.items) {
    if (it.availability !== 'in_stock' || it.lowestPriceCents == null) continue
    const arr = hist[it.id] ?? []
    const last = arr[arr.length - 1]
    if (!last || last[1] !== it.lowestPriceCents) {
      arr.push([now, it.lowestPriceCents])
      if (arr.length > 200) arr.shift()
      hist[it.id] = arr
      changed = true
    }
  }
  if (changed) await setPriceHistory(hist)
}

let syncing = false

async function sync(): Promise<SyncAck> {
  if (syncing) return { ok: false, error: 'already syncing' }
  const seed = seedListId()
  if (seed == null) {
    setMarker('Open a wishlist to sync')
    return { ok: false, error: 'no list id on this page' }
  }
  syncing = true
  setMarker('Syncing…')
  try {
    const now = Date.now()
    const snapshot = await apiDataSource.buildSnapshot(seed)
    const prevStates = await getItemStates()
    const { states, events } = diffSnapshot(prevStates, snapshot, now)
    const enrMap = await getEnrichmentMap()
    mergeEnrichment(snapshot.items, enrMap)
    await capturePrices(snapshot, now)
    const candidates = computeNotifications(snapshot, states, events, await getSettings(), now)
    await putItemStates(states)
    await putSnapshot(snapshot)
    broadcast({ type: 'SNAPSHOT_UPDATED', capturedAt: snapshot.capturedAt, itemCount: snapshot.items.length })
    if (candidates.length) broadcast({ type: 'NOTIFY', items: candidates })
    setMarker(`✓ ${snapshot.items.length} books · ${snapshot.subLists.length} lists`)
    void enrichBatch(snapshot.items, enrMap)
    return { ok: true, itemCount: snapshot.items.length }
  } catch (e) {
    setMarker('Sync failed')
    return { ok: false, error: String(e) }
  } finally {
    syncing = false
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (msg?.type === 'SYNC_NOW') {
    void sync().then(sendResponse)
    return true
  }
  if (msg?.type === 'DELETE_ITEM') {
    void deleteItem(msg.idListItem, msg.id).then(sendResponse)
    return true
  }
  if (msg?.type === 'ENRICH_NOW') {
    void enrichAll().then(sendResponse)
    return true
  }
  if (msg?.type === 'DISCOVER') {
    void discover(msg.queries).then(sendResponse)
    return true
  }
  if (msg?.type === 'ADD_TO_WISHLIST') {
    void addToWishlist(msg.productUrl, msg.wishlistId).then(sendResponse)
    return true
  }
  return undefined
})

/** Remove an item from the wishlist via ThriftBooks' own endpoint (same-origin, cookie-auth). */
async function deleteItem(idListItem: number, id: string): Promise<DeleteAck> {
  try {
    const res = await fetch('https://www.thriftbooks.com/api/listitem/deletefromwishlist', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `idListItem=${encodeURIComponent(String(idListItem))}`,
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const snap = await getSnapshot()
    if (snap) {
      const items = snap.items.filter((it) => it.id !== id)
      await updateSnapshot({ ...snap, items })
      broadcast({ type: 'SNAPSHOT_UPDATED', capturedAt: snap.capturedAt, itemCount: items.length })
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Discover: fetch + parse browse results for a set of taste queries (authors), deduped. */
async function discover(queries: DiscoverQuery[]): Promise<DiscoverAck> {
  try {
    const seen = new Set<string>()
    const all: SearchCandidate[] = []
    for (const q of queries.slice(0, 20)) {
      let cands: SearchCandidate[] = []
      try { cands = await fetchSearch(q.term) } catch { cands = [] }
      for (const c of cands.slice(0, 25)) {
        if (seen.has(c.workId)) continue
        seen.add(c.workId)
        all.push({ ...c, via: q.label, viaKind: q.kind })
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    return { ok: true, candidates: all }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Add a book to a wishlist: fetch its work page to resolve the edition id, then POST. */
async function addToWishlist(productUrl: string, wishlistId: string): Promise<AddAck> {
  try {
    const wres = await fetch(productUrl, { credentials: 'include' })
    if (!wres.ok) return { ok: false, error: `book page HTTP ${wres.status}` }
    const idEdition = findEditionId(await wres.text())
    if (!idEdition) return { ok: false, error: 'Could not find an edition id on that book page.' }
    const res = await fetch('https://www.thriftbooks.com/api/ListItem/AddToWishlist', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `idEdition=${encodeURIComponent(idEdition)}&wishlistId=${encodeURIComponent(wishlistId)}`,
    })
    if (!res.ok) return { ok: false, error: `add HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function maybeAutoSync(): Promise<void> {
  const last = await getLastSyncAt()
  if (!last || Date.now() - last > SYNC_THROTTLE_MS) void sync()
  else setMarker('Wishlist Enhancer active')
}

// --- in-page status marker (Shadow DOM, style-isolated) ---
let markerEl: HTMLElement | null = null
function setMarker(text: string): void {
  if (!document.body) return
  if (!markerEl) {
    const host = document.createElement('div')
    host.id = 'tbw-marker-host'
    host.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;'
    const shadow = host.attachShadow({ mode: 'open' })
    const box = document.createElement('div')
    box.style.cssText =
      'font:600 12px/1.2 system-ui,-apple-system,sans-serif;background:#088778;color:#ffffff;' +
      'padding:8px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);user-select:none;'
    shadow.appendChild(box)
    document.body.appendChild(host)
    markerEl = box
  }
  markerEl.textContent = `📚 ${text}`
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void maybeAutoSync())
} else {
  void maybeAutoSync()
}

export {}
