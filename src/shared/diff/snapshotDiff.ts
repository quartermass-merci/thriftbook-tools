// New-vs-old engine. Given the previous per-item state and a fresh snapshot,
// produce updated state + the events that drive badges and (in M3) notifications.
// Pure + deterministic — easy to unit test.
import type { WishlistSnapshot, ItemState, AvailabilityTransition } from '@/shared/types'
import { STATE_HISTORY_CAP } from '@/shared/types'
import { parseDate } from '@/shared/util/date'

export interface DiffEvents {
  /** Ids that transitioned into in_stock this run (out/unknown -> in_stock). */
  newlyInStock: string[]
  /** Ids first seen this run. */
  newAdditions: string[]
  /** Ids whose price hit a new low this run. */
  priceDrops: { id: string; fromCents: number; toCents: number }[]
}

export function diffSnapshot(
  prev: Record<string, ItemState>,
  snapshot: WishlistSnapshot,
  now: number,
): { states: Record<string, ItemState>; events: DiffEvents } {
  const states: Record<string, ItemState> = {}
  const events: DiffEvents = { newlyInStock: [], newAdditions: [], priceDrops: [] }
  const seen = new Set<string>()

  for (const item of snapshot.items) {
    seen.add(item.id)
    const old = prev[item.id]
    const price = item.lowestPriceCents

    if (!old) {
      states[item.id] = {
        id: item.id,
        firstSeenAt: parseDate(item.dateAdded) ?? now,
        lastSeenAt: now,
        availability: item.availability,
        availabilityHistory: [],
        firstInStockAt: item.availability === 'in_stock' ? now : undefined,
        // No "back in stock" on first sight — we have no prior state to call it a return.
        lastBackInStockAt: undefined,
        lastNotified: {},
        lowestPriceEverCents: price,
        highestPriceEverCents: price,
      }
      events.newAdditions.push(item.id)
      continue
    }

    const next: ItemState = { ...old, lastSeenAt: now, availability: item.availability, removedAt: undefined }

    if (old.availability !== item.availability) {
      const tr: AvailabilityTransition = { at: now, from: old.availability, to: item.availability }
      next.availabilityHistory = [...old.availabilityHistory, tr].slice(-STATE_HISTORY_CAP)
      if (item.availability === 'in_stock') {
        next.lastBackInStockAt = now
        if (next.firstInStockAt == null) next.firstInStockAt = now
        events.newlyInStock.push(item.id)
      }
    }

    if (price != null) {
      if (old.lowestPriceEverCents != null && price < old.lowestPriceEverCents) {
        events.priceDrops.push({ id: item.id, fromCents: old.lowestPriceEverCents, toCents: price })
      }
      next.lowestPriceEverCents = old.lowestPriceEverCents == null ? price : Math.min(old.lowestPriceEverCents, price)
      next.highestPriceEverCents = old.highestPriceEverCents == null ? price : Math.max(old.highestPriceEverCents, price)
    }

    states[item.id] = next
  }

  // Items that dropped off the wishlist — keep their state, stamp removedAt once.
  for (const id in prev) {
    if (!seen.has(id)) states[id] = { ...prev[id], removedAt: prev[id].removedAt ?? now }
  }

  return { states, events }
}
