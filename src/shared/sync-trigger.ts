// Robust "sync now" used by the popup and dashboard. The content script is the
// only thing that can fetch the API (same-origin), so we message a thriftbooks
// list tab — trying each match, reloading a stale one, or opening a fresh tab.
import type { SyncAck, DeleteAck, EnrichAck, DiscoverAck, AddAck, Msg } from '@/shared/messaging/protocol'
import type { DiscoverQuery } from '@/shared/types'

const LIST_TAB_MATCH = 'https://www.thriftbooks.com/list/*'

/** sendMessage with a timeout, so a hung or context-invalidated content script
 *  can't leave the UI spinning forever — it rejects and we fall through to the
 *  "open your wishlist tab" guidance instead. */
function sendWithTimeout<T>(tabId: number, msg: Msg, ms: number): Promise<T> {
  return Promise.race([
    chrome.tabs.sendMessage(tabId, msg) as Promise<T>,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('No response (timed out)')), ms)),
  ])
}

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
      const ack = await sendWithTimeout<SyncAck>(t.id, { type: 'SYNC_NOW' }, 60_000)
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
      const ack = await sendWithTimeout<DeleteAck>(t.id, { type: 'DELETE_ITEM', idListItem, id }, 20_000)
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
      const ack = await sendWithTimeout<EnrichAck>(t.id, { type: 'ENRICH_NOW' }, 600_000)
      if (ack) return ack
    } catch {
      /* no content script here — try the next */
    }
  }
  return { ok: false, error: 'Open your ThriftBooks wishlist in a tab, then click Enrich again.' }
}

/** Run a Discover catalog scan (search those queries) via a list tab's content script. */
export async function triggerDiscoverFromUI(queries: DiscoverQuery[]): Promise<DiscoverAck> {
  let tabs: chrome.tabs.Tab[] = []
  try {
    tabs = await chrome.tabs.query({ url: LIST_TAB_MATCH })
  } catch {
    tabs = []
  }
  for (const t of tabs) {
    if (t.id == null) continue
    try {
      const ack = await sendWithTimeout<DiscoverAck>(t.id, { type: 'DISCOVER', queries }, 180_000)
      if (ack) return ack
    } catch {
      /* no content script here — try the next */
    }
  }
  return { ok: false, error: 'Open your ThriftBooks wishlist in a tab, then run Discover again.' }
}

/** Add a found book to one of your wishlists via a list tab's content script. */
export async function addToWishlistViaUI(productUrl: string, wishlistId: string): Promise<AddAck> {
  let tabs: chrome.tabs.Tab[] = []
  try {
    tabs = await chrome.tabs.query({ url: LIST_TAB_MATCH })
  } catch {
    tabs = []
  }
  for (const t of tabs) {
    if (t.id == null) continue
    try {
      const ack = await sendWithTimeout<AddAck>(t.id, { type: 'ADD_TO_WISHLIST', productUrl, wishlistId }, 30_000)
      if (ack) return ack
    } catch {
      /* no content script here — try the next */
    }
  }
  return { ok: false, error: 'Open your ThriftBooks wishlist in a tab, then try Add again.' }
}
