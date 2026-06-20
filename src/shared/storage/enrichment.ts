// Cache of per-book product-page enrichment (genre + publisher), keyed by work id.
// Each book is fetched at most once; this map persists across syncs.
import type { Enrichment } from '@/shared/types'
import { kvGet, kvSet } from './kv'

const KEY = 'enrichment'

export async function getEnrichmentMap(): Promise<Record<string, Enrichment>> {
  return (await kvGet<Record<string, Enrichment>>(KEY)) ?? {}
}

export async function setEnrichmentMap(map: Record<string, Enrichment>): Promise<void> {
  await kvSet(KEY, map)
}
