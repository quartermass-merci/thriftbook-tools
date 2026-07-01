// Core data model for the ThriftBooks Wishlist Enhancer.
// Single source of truth shared by every surface (service worker, content
// script, dashboard, popup, options). Keep this free of runtime/Chrome deps.

/** Stable per-book identity. Prefer ISBN13; fall back to the ThriftBooks
 *  product id from /w/{title}/{id}/. Keep both so API + DOM paths reconcile. */
export type ItemId = string

export type Format =
  | 'paperback'
  | 'hardcover'
  | 'mass_market'
  | 'library_binding'
  | 'audio'
  | 'ebook'
  | 'other'

export type Condition =
  | 'new'
  | 'like_new'
  | 'very_good'
  | 'good'
  | 'acceptable'
  | 'unknown'

export type Availability = 'in_stock' | 'out_of_stock' | 'unknown'

export type DataSourceKind = 'api' | 'dom' | 'cloud'

export interface PriceByCondition {
  condition: Condition
  priceCents: number
  inStock: boolean
}

export interface WishlistItem {
  id: ItemId
  productId?: string
  isbn13?: string
  isbn10?: string
  title: string
  author?: string
  format?: Format
  genres: string[]
  publisher?: string
  isDeal?: boolean
  releaseDate?: string // ISO date when known
  coverImageUrl?: string
  productUrl?: string // /w/{title}/{id}/
  availability: Availability
  /** Min price across in-stock conditions, integer cents. */
  lowestPriceCents?: number
  pricesByCondition: PriceByCondition[]
  /** Sub-lists this item belongs to (an item can be in several). */
  subListIds: string[]

  // --- ThriftBooks-native signals (optional; populated by the API adapter) ---
  /** ISO timestamp the item was added to the list (native "recently added"). */
  dateAdded?: string
  /** How many other users are watching this item — competition signal. */
  othersWatching?: number
  /** Copies coming into stock per month (0 = very rare) — rarity/velocity. */
  copiesPerMonth?: number
  /** Current in-stock copies. */
  quantityAvailable?: number
  /** User's native per-item max-price alert threshold, integer cents. */
  maxPriceCents?: number
  wantsInstantEmail?: boolean
  wantsWeeklyEmail?: boolean
  /** Per-(item,list) row id, used for move/delete actions. */
  idListItem?: number

  // --- additional display fields ---
  /** Condition of the buyable (Best Value) offer. */
  offerCondition?: Condition
  /** Language of the buyable offer (e.g. "english"). */
  language?: string
  isExLibrary?: boolean
  isMissingDustJacket?: boolean
  isLargePrint?: boolean
  /** Genre / category — populated via product-page enrichment. */
  genre?: string
}

/** Product-page enrichment, cached per work id (genre + publisher aren't in the list API). */
export interface Enrichment {
  genre?: string
  genres?: string[]
  publisher?: string
  isDeal?: boolean
  fetchedAt: number
}

export interface SubList {
  id: string
  name: string
  itemCount: number
}

export type DiscoverKind = 'author' | 'publisher' | 'category' | 'manual'

/** One thing to search for in Discover: what to search (term) + how to label/credit it. */
export interface DiscoverQuery {
  kind: DiscoverKind
  term: string // the ThriftBooks search string
  label: string // display name + taste-affinity key (e.g. the category bucket)
}

/** A book found via catalog search — used by Discover (may not be on the wishlist). */
export interface SearchCandidate {
  workId: string
  isbn?: string
  title: string
  author?: string
  coverImageUrl?: string
  priceCents?: number
  format?: string
  productUrl: string
  /** The wishlist author/publisher/category this candidate was surfaced under. */
  via?: string
  viaKind?: DiscoverKind
  isDeal?: boolean
}

export interface WishlistSnapshot {
  capturedAt: number // epoch ms
  dataSourceKind: DataSourceKind
  items: WishlistItem[]
  subLists: SubList[]
  schemaVersion: number
}

export interface AvailabilityTransition {
  at: number // epoch ms
  from: Availability
  to: Availability
}

export type NotificationTrigger =
  | 'newlyInStock'
  | 'priceDrop'
  | 'newAddition'
  | 'freeBookEligible'

/** Per-item durable state — the engine behind new-vs-old + notifications. */
export interface ItemState {
  id: ItemId
  firstSeenAt: number
  lastSeenAt: number
  removedAt?: number
  availability: Availability
  /** Most-recent-last, capped at STATE_HISTORY_CAP. */
  availabilityHistory: AvailabilityTransition[]
  /** First time observed in_stock — the competition signal. */
  firstInStockAt?: number
  /** Most recent transition into in_stock — drives the "Back in stock" date. */
  lastBackInStockAt?: number
  /** epoch ms of last notification per trigger (anti-spam cooldown). */
  lastNotified: Partial<Record<NotificationTrigger, number>>
  lowestPriceEverCents?: number
  highestPriceEverCents?: number
}

export type PriceSource = 'list' | 'product' | 'cloud'

/** One row per (item, condition) observation. Stored in IndexedDB. */
export interface PriceSnapshot {
  itemId: ItemId
  capturedAt: number // epoch ms
  condition: Condition
  priceCents: number
  inStock: boolean
  source: PriceSource
}

export interface NotificationPrefs {
  newlyInStock: boolean
  priceDrop: boolean
  newAddition: boolean
  freeBookEligible: boolean
  /** Minimum % below recent baseline to fire a priceDrop alert. */
  priceDropPct: number
}

export interface RewardsState {
  pointsOrCredits?: number
  toNextFreeBookCents?: number
  capturedAt?: number
}

export interface Settings {
  alarmMinutes: number
  /** ReadingRewards free-book ceiling, integer cents (default 700 = $7). */
  freeBookCeilingCents: number
  /** Open a hidden /list/ tab on each alarm so syncs run without a visible tab. */
  backgroundTabSync: boolean
  notif: NotificationPrefs
  rewards?: RewardsState
}

export const DEFAULT_SETTINGS: Settings = {
  alarmMinutes: 5,
  freeBookCeilingCents: 700,
  backgroundTabSync: false,
  notif: {
    newlyInStock: true,
    priceDrop: true,
    newAddition: false,
    freeBookEligible: true,
    priceDropPct: 10,
  },
}

export const SCHEMA_VERSION = 1
export const STATE_HISTORY_CAP = 20

/** Derived: can this item be claimed with the free-book credit right now? */
export function isFreeBookEligible(
  item: Pick<WishlistItem, 'availability' | 'lowestPriceCents'>,
  ceilingCents: number,
): boolean {
  return (
    item.availability === 'in_stock' &&
    typeof item.lowestPriceCents === 'number' &&
    item.lowestPriceCents <= ceilingCents
  )
}
