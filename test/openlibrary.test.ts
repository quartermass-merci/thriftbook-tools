import { describe, it, expect } from 'vitest'
import { buildOlSearchUrl, normalizeOlResponse } from '@/shared/openlibrary'

describe('buildOlSearchUrl', () => {
  it('uses the publisher param for publisher kind', () => {
    const u = buildOlSearchUrl('publisher', 'New Directions', 0, 30)
    expect(u).toContain('publisher=New+Directions')
    expect(u).toContain('limit=30')
    expect(u).toContain('offset=0')
  })
  it('uses the author param and advances the offset', () => {
    const u = buildOlSearchUrl('author', 'Anne Carson', 30, 30)
    expect(u).toContain('author=Anne+Carson')
    expect(u).toContain('offset=30')
  })
  it('clamps the limit to Open Library’s max of 100', () => {
    expect(buildOlSearchUrl('publisher', 'X', 0, 9999)).toContain('limit=100')
  })
})

describe('normalizeOlResponse', () => {
  it('maps docs and drops untitled entries', () => {
    const { docs, total } = normalizeOlResponse({
      numFound: 2,
      docs: [
        { title: 'A', author_name: ['X'], isbn: ['9780811216999'], publisher: ['New Directions'], first_publish_year: 1999 },
        { author_name: ['Y'] }, // no title -> dropped
      ],
    })
    expect(total).toBe(2)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ title: 'A', authors: ['X'], isbns: ['9780811216999'], publishers: ['New Directions'], year: 1999 })
  })
  it('tolerates a null/garbage payload', () => {
    expect(normalizeOlResponse(null)).toEqual({ docs: [], total: 0 })
    expect(normalizeOlResponse({})).toEqual({ docs: [], total: 0 })
  })
})
