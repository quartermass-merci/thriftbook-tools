import { describe, it, expect } from 'vitest'
import { pickBestMatch } from '@/content/adapter/search'
import type { SearchCandidate } from '@/shared/types'

const tile = (o: Partial<SearchCandidate>): SearchCandidate => ({ workId: 'w', title: '', productUrl: 'u', ...o })

describe('pickBestMatch', () => {
  it('prefers an ISBN match regardless of title, ignoring ISBN hyphens', () => {
    const tiles = [
      tile({ workId: '1', title: 'Wrong Book', isbn: '0811216993' }),
      tile({ workId: '2', title: 'x', isbn: '9780811216999' }),
    ]
    const m = pickBestMatch(tiles, { title: 'Whatever', authors: ['A'], isbns: ['978-0-8112-1699-9'] })
    expect(m?.workId).toBe('2')
    expect(m?.matchedBy).toBe('isbn')
  })

  it('falls back to a normalized title + author match (drops leading article)', () => {
    const tiles = [tile({ workId: '3', title: 'The Complete Stories', author: 'Clarice Lispector' })]
    const m = pickBestMatch(tiles, { title: 'Complete Stories', authors: ['Clarice Lispector'], isbns: [] })
    expect(m?.workId).toBe('3')
    expect(m?.matchedBy).toBe('title')
  })

  it('rejects a same-title different-author tile', () => {
    const tiles = [tile({ workId: '5', title: 'Nadja', author: 'Someone Else' })]
    expect(pickBestMatch(tiles, { title: 'Nadja', authors: ['André Breton'], isbns: [] })).toBeNull()
  })

  it('returns null when nothing matches and for no tiles', () => {
    const tiles = [tile({ workId: '4', title: 'Unrelated Book', author: 'Nobody' })]
    expect(pickBestMatch(tiles, { title: 'New Directions Reader', authors: ['Someone'], isbns: ['123'] })).toBeNull()
    expect(pickBestMatch([], { title: 'x', authors: [], isbns: [] })).toBeNull()
  })
})
