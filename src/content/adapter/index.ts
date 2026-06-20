// The DataSource seam. M1 ships the API source; a DOM-fallback and a future
// cloud source implement the same interface so nothing downstream changes.
import type { WishlistSnapshot, WishlistItem, SubList } from '@/shared/types'
import { SCHEMA_VERSION } from '@/shared/types'
import { fetchListIndex, fetchListItems } from './api-adapter'
import { normalizeItem, normalizeListMeta, mergeBySubList } from './normalize'

export interface DataSource {
  readonly kind: 'api' | 'dom' | 'cloud'
  /** Build a complete snapshot across all of the user's lists. `seedIdList`
   *  is any one of their list ids (used to enumerate the rest). */
  buildSnapshot(seedIdList: number | string): Promise<WishlistSnapshot>
}

export const apiDataSource: DataSource = {
  kind: 'api',
  async buildSnapshot(seedIdList) {
    const lists = await fetchListIndex(seedIdList)
    const subLists: SubList[] = lists.map(normalizeListMeta)
    const collected: WishlistItem[] = []
    for (const meta of lists) {
      const raws = await fetchListItems(meta.IdList)
      const sl = subLists.find((s) => s.id === String(meta.IdList))
      if (sl) sl.itemCount = raws.length
      for (const r of raws) collected.push(normalizeItem(r, meta.IdList))
    }
    return {
      capturedAt: Date.now(),
      dataSourceKind: 'api',
      items: mergeBySubList(collected),
      subLists,
      schemaVersion: SCHEMA_VERSION,
    }
  },
}

export { parseHydrate } from './api-adapter'
