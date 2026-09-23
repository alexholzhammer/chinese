import { describe, expect, it } from 'vitest'
import { MNEMONIC_MAX_LENGTH, normalizeMnemonic } from '@/lib/vocab/mnemonic'

describe('normalizeMnemonic', () => {
  it('keeps ordinary text', () => {
    expect(normalizeMnemonic('dì tiě → "deet-yeah", underground').text).toBe(
      'dì tiě → "deet-yeah", underground',
    )
  })

  it('treats blank as a deletion, not an empty hook', () => {
    // Otherwise clearing the box leaves a Hint button with nothing behind it.
    for (const blank of ['', '   ', '\n\n', '\t \n ']) {
      expect(normalizeMnemonic(blank).text).toBeNull()
    }
  })

  it('trims the edges but keeps internal line breaks', () => {
    const out = normalizeMnemonic('  地 earth + 铁 iron\n  = iron road underground  \n\n')
    expect(out.text).toBe('地 earth + 铁 iron\n  = iron road underground')
  })

  it('handles a missing or non-string body as a deletion', () => {
    expect(normalizeMnemonic(undefined).text).toBeNull()
    expect(normalizeMnemonic(null).text).toBeNull()
    expect(normalizeMnemonic(42).text).toBeNull()
  })

  it('accepts a long mnemonic without silently losing it', () => {
    const long = 'a'.repeat(500)
    expect(normalizeMnemonic(long).text).toBe(long)
    expect(normalizeMnemonic(long).tooLong).toBe(false)
  })

  it('caps absurd input and says so rather than truncating quietly', () => {
    const out = normalizeMnemonic('a'.repeat(MNEMONIC_MAX_LENGTH + 100))
    expect(out.text).toHaveLength(MNEMONIC_MAX_LENGTH)
    expect(out.tooLong).toBe(true)
  })

  it('keeps hanzi and diacritics intact', () => {
    const out = normalizeMnemonic('说 shuō — think "shower", you talk in it')
    expect(out.text).toContain('说')
    expect(out.text).toContain('shuō')
  })
})
