// Typed message contracts between the content script, service worker, and UI surfaces.
import type { SearchCandidate, DiscoverQuery } from '@/shared/types'
import type { OlDoc, CollectionKind } from '@/shared/openlibrary'

export interface NotifyItem {
  id: string
  title: string
  url: string
  kind: string
  detail: string
}

export type Msg =
  | { type: 'SYNC_NOW' }
  | { type: 'SNAPSHOT_UPDATED'; capturedAt: number; itemCount: number }
  | { type: 'GET_SYNC_STATE' }
  | { type: 'DELETE_ITEM'; idListItem: number; id: string }
  | { type: 'NOTIFY'; items: NotifyItem[] }
  | { type: 'TEST_NOTIFY' }
  | { type: 'ENRICH_NOW' }
  | { type: 'DISCOVER'; queries: DiscoverQuery[]; dealsOnly?: boolean; pages?: number }
  | { type: 'OL_SEARCH'; kind: CollectionKind; name: string; offset: number; limit: number }
  | { type: 'COLLECT'; kind: CollectionKind; name: string; offset: number; limit: number; maxCents?: number }
  | { type: 'ADD_TO_WISHLIST'; productUrl: string; wishlistId: string }

export interface SyncAck {
  ok: boolean
  itemCount?: number
  error?: string
}

export interface DeleteAck {
  ok: boolean
  error?: string
}

export interface EnrichAck {
  ok: boolean
  enriched?: number
  error?: string
}

export interface DiscoverAck {
  ok: boolean
  candidates?: SearchCandidate[]
  error?: string
}

/** Service-worker → UI/content: raw Open Library catalog docs for a publisher/author. */
export interface OlAck {
  ok: boolean
  docs?: OlDoc[]
  total?: number
  error?: string
}

/** Content script → UI: Open Library docs matched to buyable ThriftBooks listings. */
export interface CollectAck {
  ok: boolean
  candidates?: SearchCandidate[]
  total?: number // size of the full Open Library catalog for this query
  unmatched?: number // docs in this page with no ThriftBooks match
  error?: string
}

export interface AddAck {
  ok: boolean
  error?: string
}
