// The single read/write API over storage. UI surfaces, the content script, and
// the service worker all go through this — never chrome.storage directly.
import type { WishlistSnapshot, Settings, ItemState } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { kvGet, kvSet } from './kv'

export const STORAGE_KEYS = {
  snapshot: 'snapshot',
  prevSnapshot: 'prevSnapshot',
  settings: 'settings',
  lastSyncAt: 'lastSyncAt',
  itemStates: 'itemStates',
  priceHistory: 'priceHistory',
} as const

export async function getSnapshot(): Promise<WishlistSnapshot | undefined> {
  return kvGet<WishlistSnapshot>(STORAGE_KEYS.snapshot)
}

export async function getPrevSnapshot(): Promise<WishlistSnapshot | undefined> {
  return kvGet<WishlistSnapshot>(STORAGE_KEYS.prevSnapshot)
}

/** Persist a new snapshot, rolling the previous one into prevSnapshot (for diffing in M2). */
export async function putSnapshot(snapshot: WishlistSnapshot): Promise<void> {
  const prev = await kvGet<WishlistSnapshot>(STORAGE_KEYS.snapshot)
  if (prev) await kvSet(STORAGE_KEYS.prevSnapshot, prev)
  await kvSet(STORAGE_KEYS.snapshot, snapshot)
  await kvSet(STORAGE_KEYS.lastSyncAt, snapshot.capturedAt)
}

export async function getLastSyncAt(): Promise<number | undefined> {
  return kvGet<number>(STORAGE_KEYS.lastSyncAt)
}

/** Overwrite the current snapshot in place (no prev-roll) — for local edits like delete. */
export async function updateSnapshot(snapshot: WishlistSnapshot): Promise<void> {
  await kvSet(STORAGE_KEYS.snapshot, snapshot)
}

/** Per-item durable state, keyed by ItemId (the new-vs-old engine's memory). */
export async function getItemStates(): Promise<Record<string, ItemState>> {
  return (await kvGet<Record<string, ItemState>>(STORAGE_KEYS.itemStates)) ?? {}
}

export async function putItemStates(states: Record<string, ItemState>): Promise<void> {
  await kvSet(STORAGE_KEYS.itemStates, states)
}

/** Per-item price time-series as [epochMs, cents] tuples (dedup-on-change, capped). */
export async function getPriceHistory(): Promise<Record<string, Array<[number, number]>>> {
  return (await kvGet<Record<string, Array<[number, number]>>>(STORAGE_KEYS.priceHistory)) ?? {}
}

export async function setPriceHistory(map: Record<string, Array<[number, number]>>): Promise<void> {
  await kvSet(STORAGE_KEYS.priceHistory, map)
}

export async function getSettings(): Promise<Settings> {
  const s = await kvGet<Settings>(STORAGE_KEYS.settings)
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    notif: { ...DEFAULT_SETTINGS.notif, ...(s?.notif ?? {}) },
  }
}

export async function putSettings(settings: Settings): Promise<void> {
  await kvSet(STORAGE_KEYS.settings, settings)
}
