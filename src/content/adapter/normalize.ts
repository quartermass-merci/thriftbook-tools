// Converts ThriftBooks' raw shapes into our WishlistItem model. The only place
// that knows about PascalCase fields — everything downstream sees WishlistItem.
import type { WishlistItem, SubList, Format, Condition, Availability } from '@/shared/types'
import type { RawListItem, RawListMeta } from './selectors'
import { workUrl } from './selectors'

const FORMAT_MAP: Record<string, Format> = {
  paperback: 'paperback',
  hardcover: 'hardcover',
  hardback: 'hardcover',
  'mass market paperback': 'mass_market',
  'mass market': 'mass_market',
  'library binding': 'library_binding',
  audio: 'audio',
  'audio cd': 'audio',
  audiobook: 'audio',
  'audio cassette': 'audio',
  ebook: 'ebook',
  kindle: 'ebook',
}

function mapFormat(f?: string): Format | undefined {
  if (!f) return undefined
  return FORMAT_MAP[f.trim().toLowerCase()] ?? 'other'
}

const CONDITION_MAP: Record<string, Condition> = {
  new: 'new',
  'like new': 'like_new',
  'very good': 'very_good',
  good: 'good',
  acceptable: 'acceptable',
  fair: 'acceptable',
}

function mapCondition(c?: string): Condition {
  if (!c) return 'unknown'
  return CONDITION_MAP[c.trim().toLowerCase()] ?? 'unknown'
}

export function normalizeItem(raw: RawListItem, idList: number | string): WishlistItem {
  const inStock = !!raw.HasAddToCart
  const priceCents = inStock && raw.AddToCartPrice > 0 ? Math.round(raw.AddToCartPrice * 100) : undefined
  const condition = mapCondition(raw.AddToCartItemCondition)
  const availability: Availability = inStock ? 'in_stock' : 'out_of_stock'
  const maxPrice = raw.Filters && raw.Filters.MaxPrice != null ? Math.round(raw.Filters.MaxPrice * 100) : undefined

  return {
    id: raw.Isbn13 || String(raw.IdWork),
    productId: String(raw.IdWork),
    isbn13: raw.Isbn13 || undefined,
    isbn10: raw.Isbn || undefined,
    title: raw.Title,
    author: raw.Authors && raw.Authors[0] ? raw.Authors[0].AuthorName : undefined,
    format: mapFormat(raw.Format),
    genres: [],
    coverImageUrl: raw.ImageUrl || undefined,
    productUrl: raw.CleanUrl ? workUrl(raw.CleanUrl, raw.IdWork) : raw.WorkUrl,
    availability,
    lowestPriceCents: priceCents,
    pricesByCondition: priceCents != null ? [{ condition, priceCents, inStock: true }] : [],
    subListIds: [String(idList)],
    dateAdded: raw.DateAdded,
    othersWatching: raw.OthersWatching,
    copiesPerMonth: raw.CopiesPerMonth,
    quantityAvailable: raw.AddToCartQuantityAvailable,
    maxPriceCents: maxPrice,
    wantsInstantEmail: raw.WantsInstantEmail,
    wantsWeeklyEmail: raw.WantsWeeklyEmail,
    idListItem: raw.IdListItem,
    releaseDate: raw.ReleaseDate,
    offerCondition: condition,
    language: raw.AddToCartItemLanguage || undefined,
    isExLibrary: raw.AddToCartItemIsExLib,
    isMissingDustJacket: raw.AddToCartItemIsMissingDustJacket,
    isLargePrint: raw.AddToCartItemIsLP,
  }
}

export function normalizeListMeta(m: RawListMeta): SubList {
  return { id: String(m.IdList), name: m.ListName, itemCount: 0 }
}

/** Merge a work that appears in several sub-lists into one item (union of subListIds). */
export function mergeBySubList(items: WishlistItem[]): WishlistItem[] {
  const byId = new Map<string, WishlistItem>()
  for (const it of items) {
    const existing = byId.get(it.id)
    if (existing) {
      for (const s of it.subListIds) if (!existing.subListIds.includes(s)) existing.subListIds.push(s)
      // prefer an in-stock/priced record when merging duplicates
      if (existing.availability !== 'in_stock' && it.availability === 'in_stock') {
        Object.assign(existing, it, { subListIds: existing.subListIds })
      }
    } else {
      byId.set(it.id, { ...it, subListIds: [...it.subListIds] })
    }
  }
  return [...byId.values()]
}
