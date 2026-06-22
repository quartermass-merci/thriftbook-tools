// Typed message contracts between the content script, service worker, and UI surfaces.
import type { SearchCandidate, DiscoverQuery } from '@/shared/types'

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
  | { type: 'DISCOVER'; queries: DiscoverQuery[]; dealsOnly?: boolean }
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

export interface AddAck {
  ok: boolean
  error?: string
}
