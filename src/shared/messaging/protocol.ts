// Typed message contracts between the content script, service worker, and UI surfaces.

export type Msg =
  | { type: 'SYNC_NOW' }
  | { type: 'SNAPSHOT_UPDATED'; capturedAt: number; itemCount: number }
  | { type: 'GET_SYNC_STATE' }
  | { type: 'DELETE_ITEM'; idListItem: number; id: string }

export interface SyncAck {
  ok: boolean
  itemCount?: number
  error?: string
}

export interface DeleteAck {
  ok: boolean
  error?: string
}
