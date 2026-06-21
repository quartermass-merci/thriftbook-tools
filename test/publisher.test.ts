import { describe, it, expect } from 'vitest'
import { normalizePublisher } from '../src/shared/util/publisher'

describe('normalizePublisher', () => {
  it('collapses corporate variants to one canonical name', () => {
    expect(normalizePublisher('New Directions Publishing Corporation')).toBe('New Directions')
    expect(normalizePublisher('\tNew Directions')).toBe('New Directions')
    expect(normalizePublisher('New Directions Books')).toBe('New Directions')
    expect(normalizePublisher('Verso Books')).toBe('Verso')
    expect(normalizePublisher('W. W. Norton & Company')).toBe('W. W. Norton')
  })
  it('preserves Press and single-word houses', () => {
    expect(normalizePublisher('MIT Press')).toBe('MIT Press')
    expect(normalizePublisher('Verso')).toBe('Verso')
    expect(normalizePublisher('Penguin')).toBe('Penguin')
  })
  it('handles empty / undefined', () => {
    expect(normalizePublisher(undefined)).toBeUndefined()
    expect(normalizePublisher('   ')).toBeUndefined()
  })
})
