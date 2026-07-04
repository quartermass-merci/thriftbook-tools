// MV3 service worker — periodic sync alarm + desktop notifications.
// The content script does the actual fetching/diffing (same-origin) and sends
// us NOTIFY with the alert-worthy items; we just fire chrome.notifications.
import { getSettings } from '@/shared/storage/repo'
import type { Msg, NotifyItem, OlAck } from '@/shared/messaging/protocol'
import { buildOlSearchUrl, normalizeOlResponse, type CollectionKind } from '@/shared/openlibrary'

const SYNC_ALARM = 'wishlist-sync'
const LIST_TAB_MATCH = 'https://www.thriftbooks.com/list/*'

async function registerAlarm(): Promise<void> {
  const s = await getSettings()
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: Math.max(1, s.alarmMinutes) })
}

chrome.runtime.onInstalled.addListener(() => void registerAlarm())
chrome.runtime.onStartup.addListener(() => void registerAlarm())

// On each alarm, kick a sync via an open ThriftBooks tab — its content script
// recomputes diffs and sends NOTIFY for anything alert-worthy.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SYNC_ALARM) return
  const tabs = await chrome.tabs.query({ url: LIST_TAB_MATCH })
  let synced = false
  for (const t of tabs) {
    if (t.id == null) continue
    try {
      await chrome.tabs.sendMessage(t.id, { type: 'SYNC_NOW' } as Msg)
      synced = true
      break
    } catch {
      /* no live content script in this tab — try the next */
    }
  }
  if (synced) return
  // No open ThriftBooks tab — optionally open a hidden one so alerts still fire.
  const s = await getSettings()
  if (s.backgroundTabSync) {
    const tab = await chrome.tabs.create({ url: 'https://www.thriftbooks.com/list/', active: false })
    if (tab.id != null) {
      const id = tab.id
      setTimeout(() => void chrome.tabs.remove(id).catch(() => {}), 45000)
    }
  }
})

// notifId -> destination URL (best-effort; a hard SW eviction can clear this).
const notifTargets = new Map<string, string>()

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (msg?.type === 'OL_SEARCH') {
    void handleOlSearch(msg.kind, msg.name, msg.offset, msg.limit).then(sendResponse)
    return true // keep the channel open for the async response
  }
  if (msg?.type === 'NOTIFY') fireNotifications(msg.items)
  if (msg?.type === 'TEST_NOTIFY') {
    fireNotifications([{ id: 'test', title: 'Test notification', url: chrome.runtime.getURL('src/dashboard/index.html'), kind: 'Thriftbook Tools', detail: 'Notifications are working ✓' }])
  }
  return undefined
})

// Open Library catalog lookup. The SW is the only runtime that can read openlibrary.org:
// Open Library sends no CORS headers, but the SW bypasses CORS via the host permission.
// The content script asks us for this, then checks each title on ThriftBooks itself.
async function handleOlSearch(kind: CollectionKind, name: string, offset: number, limit: number): Promise<OlAck> {
  try {
    const res = await fetch(buildOlSearchUrl(kind, name, offset, limit), { headers: { accept: 'application/json' } })
    if (!res.ok) return { ok: false, error: `Open Library HTTP ${res.status}` }
    const { docs, total } = normalizeOlResponse(await res.json())
    return { ok: true, docs, total }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// Re-register the alarm whenever the sync cadence changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) void registerAlarm()
})

function fireNotifications(items: NotifyItem[]): void {
  if (!items?.length) return
  const iconUrl = chrome.runtime.getURL('icons/icon-128.png')
  const dashboard = chrome.runtime.getURL('src/dashboard/index.html')
  if (items.length <= 3) {
    for (const it of items) {
      const id = `tbw:${it.id}:${Date.now()}`
      notifTargets.set(id, it.url || dashboard)
      chrome.notifications.create(id, {
        type: 'basic',
        iconUrl,
        title: `${it.kind}: ${it.title}`.slice(0, 110),
        message: it.detail || '',
      })
    }
  } else {
    const id = `tbw:batch:${Date.now()}`
    notifTargets.set(id, dashboard)
    const names = items.slice(0, 4).map((i) => i.title).join(', ')
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl,
      title: `${items.length} wishlist updates`,
      message: names + (items.length > 4 ? '…' : ''),
    })
  }
}

chrome.notifications.onClicked.addListener((id) => {
  const url = notifTargets.get(id)
  if (url) void chrome.tabs.create({ url })
  void chrome.notifications.clear(id)
})

export {}
