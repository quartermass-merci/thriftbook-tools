// Runs on thriftbooks.com/list/* as the logged-in user. Builds a complete
// snapshot across all sub-lists via the API adapter, persists it, and notifies
// open UI. Auto-syncs on load (throttled); also responds to SYNC_NOW.
import { apiDataSource, parseHydrate } from './adapter'
import { putSnapshot, updateSnapshot, getSnapshot, getLastSyncAt, getItemStates, putItemStates } from '@/shared/storage/repo'
import { diffSnapshot } from '@/shared/diff/snapshotDiff'
import { broadcast } from '@/shared/messaging/bus'
import type { Msg, SyncAck, DeleteAck } from '@/shared/messaging/protocol'

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
    const snapshot = await apiDataSource.buildSnapshot(seed)
    const prevStates = await getItemStates()
    const { states } = diffSnapshot(prevStates, snapshot, Date.now())
    await putItemStates(states)
    await putSnapshot(snapshot)
    broadcast({ type: 'SNAPSHOT_UPDATED', capturedAt: snapshot.capturedAt, itemCount: snapshot.items.length })
    setMarker(`✓ ${snapshot.items.length} books · ${snapshot.subLists.length} lists`)
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
      'font:600 12px/1.2 system-ui,-apple-system,sans-serif;background:#212b4f;color:#f2e9d8;' +
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
