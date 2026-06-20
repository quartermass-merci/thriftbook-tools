// Robust "sync now" used by the popup and dashboard. The content script is the
// only thing that can fetch the API (same-origin), so we message a thriftbooks
// list tab — trying each match, reloading a stale one, or opening a fresh tab.
import type { SyncAck, DeleteAck, EnrichAck, Msg } from '@/shared/messaging/protocol'

const LIST_TAB_MATCH = 'https://www.thriftbooks.com/list/*'

export async function triggerSyncFromUI(): Promise<SyncAck> {
  let tabs: chrome.tabs.Tab[] = []
  try {
    tabs = await chrome.tabs.query({ url: LIST_TAB_MATCH })
  } catch {
    tabs = []
  }

  // Try each matching tab — the first that has a live content script wins.
  for (const t of tabs) {
    if (t.id == null) continue
    try {
      const ack = (await chrome.tabs.sendMessage(t.id, { type: 'SYNC_NOW' } as Msg)) as SyncAck
      if (ack?.ok) return ack
    } catch {
      /* no content script in this tab — try the next */
    }
  }

  // A list tab exists but none responded (loaded before install): reload to inject.
  if (tabs[0]?.id != null) {
    await chrome.tabs.reload(tabs[0].id)
    return { ok: false, error: 'Reloading your wishlist tab to sync — it updates here automatically in a few seconds.' }
  }

  // No list tab open — open one; the content script auto-syncs on load.
  await chrome.tabs.create({ url: 'https://www.thriftbooks.com/list/' })
  return { ok: false, error: 'Opened your wishlist in a new tab — it will sync automatically.' }
}

/** Route a delete to a thriftbooks list tab's content script (which does the same-origin POST). */
export async function deleteItemViaUI(idListItem: number, id: string): Promise<DeleteAck> {
  let tabs: chrome.tabs.Tab[] = []
  try {
    tabs = await chrome.tabs.query({ url: LIST_TAB_MATCH })
  } catch {
    tabs = []
  }
  for (const t of tabs) {
    if (t.id == null) continue
    try {
      const ack = (await chrome.tabs.sendMessage(t.id, { type: 'DELETE_ITEM', idListItem, id } as Msg)) as DeleteAck
      if (ack) return ack
    } catch {
      /* no content script in this tab — try the next */
    }
  }
  return { ok: false, error: 'Open your ThriftBooks wishlist in a tab, then try delete again.' }
}

/** Route an "enrich everything" request to a list tab's content script. */
export async function triggerEnrichFromUI(): Promise<EnrichAck> {
  let tabs: chrome.tabs.Tab[] = []
  try {
    tabs = await chrome.tabs.query({ url: LIST_TAB_MATCH })
  } catch {
    tabs = []
  }
  for (const t of tabs) {
    if (t.id == null) continue
    try {
      const ack = (await chrome.tabs.sendMessage(t.id, { type: 'ENRICH_NOW' } as Msg)) as EnrichAck
      if (ack) return ack
    } catch {
      /* no content script here — try the next */
    }
  }
  return { ok: false, error: 'Open your ThriftBooks wishlist in a tab, then click Enrich again.' }
}
