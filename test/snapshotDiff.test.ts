import { describe, it, expect } from 'vitest'
import { diffSnapshot } from '@/shared/diff/snapshotDiff'
import type { WishlistItem, WishlistSnapshot, ItemState, Availability } from '@/shared/types'

function item(id: string, availability: Availability, priceCents?: number, dateAdded?: string): WishlistItem {
  return { id, title: `T ${id}`, genres: [], availability, lowestPriceCents: priceCents, pricesByCondition: [], subListIds: ['1'], dateAdded }
}
function snap(items: WishlistItem[]): WishlistSnapshot {
  return { capturedAt: 1000, dataSourceKind: 'dom', items, subLists: [], schemaVersion: 1 }
}
function state(id: string, availability: Availability, extra: Partial<ItemState> = {}): ItemState {
  return { id, firstSeenAt: 1, lastSeenAt: 1, availability, availabilityHistory: [], lastNotified: {}, ...extra }
}

describe('diffSnapshot', () => {
  it('creates state for new items and reports them as additions (firstSeen from dateAdded)', () => {
    const { states, events } = diffSnapshot({}, snap([item('a', 'out_of_stock', undefined, '2026-06-01T00:00:00')]), 5000)
    expect(events.newAdditions).toEqual(['a'])
    expect(states['a'].firstSeenAt).toBe(Date.parse('2026-06-01T00:00:00'))
    expect(states['a'].availability).toBe('out_of_stock')
  })

  it('does not mark a brand-new in-stock item as "back in stock"', () => {
    const { states } = diffSnapshot({}, snap([item('a', 'in_stock', 500)]), 5000)
    expect(states['a'].lastBackInStockAt).toBeUndefined()
    expect(states['a'].firstInStockAt).toBe(5000)
  })

  it('detects a back-in-stock transition', () => {
    const prev = { a: state('a', 'out_of_stock') }
    const { states, events } = diffSnapshot(prev, snap([item('a', 'in_stock', 999)]), 7000)
    expect(events.newlyInStock).toEqual(['a'])
    expect(states['a'].lastBackInStockAt).toBe(7000)
    expect(states['a'].firstInStockAt).toBe(7000)
    expect(states['a'].availabilityHistory.at(-1)).toMatchObject({ from: 'out_of_stock', to: 'in_stock' })
  })

  it('flags a new price low', () => {
    const prev = { a: state('a', 'in_stock', { lowestPriceEverCents: 1500 }) }
    const { states, events } = diffSnapshot(prev, snap([item('a', 'in_stock', 999)]), 8000)
    expect(events.priceDrops).toEqual([{ id: 'a', fromCents: 1500, toCents: 999 }])
    expect(states['a'].lowestPriceEverCents).toBe(999)
  })

  it('emits no events when nothing changed', () => {
    const prev = { a: state('a', 'in_stock', { lowestPriceEverCents: 999 }) }
    const { events } = diffSnapshot(prev, snap([item('a', 'in_stock', 999)]), 9000)
    expect(events.newlyInStock).toEqual([])
    expect(events.newAdditions).toEqual([])
    expect(events.priceDrops).toEqual([])
  })

  it('stamps removedAt for items that dropped off the list', () => {
    const prev = { a: state('a', 'in_stock') }
    const { states } = diffSnapshot(prev, snap([]), 9999)
    expect(states['a'].removedAt).toBe(9999)
  })
})
