import { describe, it, expect } from 'vitest'
import { tagEmoji, tagLabel } from '../tagEmoji'

describe('tagEmoji', () => {
  it('returns the mapped emoji for a known tag value', () => {
    expect(tagEmoji('revenue')).toBe('💹')
    expect(tagEmoji('postgresql')).toBe('🐘')
  })

  it('is case-insensitive', () => {
    expect(tagEmoji('Revenue')).toBe('💹')
    expect(tagEmoji('POSTGRESQL')).toBe('🐘')
  })

  it('returns empty string for an unknown tag value', () => {
    expect(tagEmoji('not-a-real-tag')).toBe('')
  })
})

describe('tagLabel', () => {
  it('prepends the emoji for a known tag value', () => {
    expect(tagLabel('revenue')).toBe('💹 revenue')
  })

  it('returns the value unchanged for an unknown tag value', () => {
    expect(tagLabel('not-a-real-tag')).toBe('not-a-real-tag')
  })
})
