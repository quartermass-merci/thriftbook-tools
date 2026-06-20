// Single source of truth for ThriftBooks endpoints, the raw data shapes, and
// DOM fallback selectors. Derived from live discovery (see DISCOVERY.md).
// If ThriftBooks changes their site, fixes go HERE (and can be overridden at
// runtime via options — see shared/selectors-config.ts, added in M6).

export const ORIGIN = 'https://www.thriftbooks.com'

/** JSON API for a list's items. PascalCase .NET payload. Cap: 25 items/page. */
export const LIST_ITEMS_PER_PAGE = 25
/** Observed default sort (Date Added, newest). We re-sort client-side anyway. */
export const DEFAULT_SORTING = 3

export function listItemsUrl(idList: number | string, pageNum: number, sorting = DEFAULT_SORTING): string {
  return `${ORIGIN}/api/list/get/${idList}/?sorting=${sorting}&pageNum=${pageNum}&itemsPerPage=${LIST_ITEMS_PER_PAGE}`
}

/** A list-view HTML page; its embedded hydrate script carries list enumeration. */
export function listViewUrl(idList: number | string): string {
  return `${ORIGIN}/list/view/${idList}/`
}

/** Product page (for later genre / per-condition price enrichment). */
export function workUrl(cleanUrl: string, idWork: number | string): string {
  return `${ORIGIN}/w/${cleanUrl}/${idWork}/`
}

/** Anchor for the embedded hydration object in a list-view page's HTML. */
export const HYDRATE_ANCHOR = 'DesktopWishList.Index'

// ---- Raw shapes (exactly as ThriftBooks returns; do not leak past normalize) ----

export interface RawAuthor {
  IdAuthor: number
  AuthorName: string
  AuthorCleanUrl?: string
  AuthorSalesRank?: number
}

export interface RawListItem {
  IdListItem: number
  IdWork: number
  Isbn?: string
  Isbn13?: string
  CleanUrl?: string
  WorkUrl?: string
  Title: string
  Format?: string
  ImageUrl?: string
  HasAddToCart: boolean
  AddToCartPrice: number // dollars; 0 when out of stock
  AddToCartQuantityAvailable?: number
  AddToCartItemCondition?: string
  AddToCartItemQuality?: string
  AddToCartItemLanguage?: string
  AddToCartItemIsLP?: boolean
  AddToCartItemIsExLib?: boolean
  AddToCartItemIsMissingDustJacket?: boolean
  BestValue?: boolean
  DateAdded?: string
  OthersWatching?: number
  CopiesPerMonth?: number
  ReleaseDate?: string
  OnSaleDate?: string
  IsBackorder?: boolean
  IsUnreleased?: boolean
  WantsInstantEmail?: boolean
  WantsWeeklyEmail?: boolean
  Filters?: { Isbn?: string; Formats?: string[]; Conditions?: string[]; IsLargePrint?: boolean; MaxPrice?: number | null }
  Authors?: RawAuthor[]
}

/** Response of GET /api/list/get/{id}/ */
export interface RawListResponse {
  ListItems: RawListItem[]
  PageNum: number
}

export interface RawListMeta {
  IdList: number
  ListName: string
  IsDefault: boolean
  IdPrivacy?: number
  CreatedDate?: string
}

/** Shape of the object embedded in a list-view page (subset we use). */
export interface RawHydrate {
  idList: number
  listItems?: RawListItem[]
  otherLists?: RawListMeta[]
  sharedWithMeLists?: RawListMeta[]
  totalItems?: number
  totalPages?: number
  currentPage?: number
  itemsPerPage?: number
  listSettings?: { ListName?: string; IsDefault?: boolean }
}

// ---- DOM fallback selectors (used only if API/hydrate parsing fails) ----

export const DOM = {
  /** Wishlist items container (excludes the recommendations slider). */
  listContainer: '.WishList-List',
  /** Recommendations carousel to EXCLUDE — not wishlist data. */
  recommendationsSlider: '.BookSliderDesktop',
  /** A product link inside an item card. */
  workLink: 'a[href*="/w/"]',
  itemImage: 'img.WishList-ItemImage',
  priceValue: 'div.price', // preceded by a "$" span; text like "11.39"
  outOfStockBadge: '.tb-BreadCrumbs', // text "Out of Stock"
  notifyToggle: 'div.Checkbox-label.bold', // "Weekly" / "Instant"
  pagerNext: '.Pagination-link.is-right.is-link',
} as const

/** /w/{slug}/{id}/ → product id. */
export const WORK_ID_RE = /\/w\/[^/]+\/(\d+)\//
/** /a/{slug}/{id}/ → author id. */
export const AUTHOR_ID_RE = /\/a\/[^/]+\/(\d+)\//
