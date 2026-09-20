import { describe, expect, it } from 'vitest'
import { stripTones, syllableTones, toNumericPinyin } from '@/lib/chinese/pinyin'
import { hanziTones } from '@/lib/chinese/tone'

describe('toNumericPinyin', () => {
  it('converts the plan’s worked examples', () => {
    expect(toNumericPinyin('dì tiě')).toBe('di4 tie3')
    expect(toNumericPinyin('qi lai')).toBe('qi5 lai5')
  })

  it('handles all four tones plus neutral', () => {
    expect(toNumericPinyin('mā má mǎ mà ma')).toBe('ma1 ma2 ma3 ma4 ma5')
  })

  it('covers every toned vowel form', () => {
    expect(toNumericPinyin('ā á ǎ à')).toBe('a1 a2 a3 a4')
    expect(toNumericPinyin('ē é ě è')).toBe('e1 e2 e3 e4')
    expect(toNumericPinyin('ī í ǐ ì')).toBe('i1 i2 i3 i4')
    expect(toNumericPinyin('ō ó ǒ ò')).toBe('o1 o2 o3 o4')
    expect(toNumericPinyin('ū ú ǔ ù')).toBe('u1 u2 u3 u4')
  })

  it('keeps the umlaut on ü while taking the tone off', () => {
    expect(toNumericPinyin('lǜ')).toBe('lü4')
    expect(toNumericPinyin('nǚ')).toBe('nü3')
    expect(toNumericPinyin('lǚ xíng')).toBe('lü3 xing2')
  })

  it('lowercases proper nouns so lookups match', () => {
    expect(toNumericPinyin('Huán')).toBe('huan2')
  })

  it('survives real multi-syllable entries', () => {
    expect(toNumericPinyin('yīn yuè jiā')).toBe('yin1 yue4 jia1')
    expect(toNumericPinyin('zhǔ yi')).toBe('zhu3 yi5')
  })
})

describe('stripTones', () => {
  it('removes marks and normalises spacing and case', () => {
    expect(stripTones('dì tiě')).toBe('di tie')
    expect(stripTones('  Huán  ')).toBe('huan')
    expect(stripTones('qǐ lái')).toBe('qi lai')
  })

  it('leaves the two readings of 还 distinguishable', () => {
    expect(stripTones('hái')).not.toBe(stripTones('huán'))
  })
})

describe('syllableTones', () => {
  it('reports one tone per syllable', () => {
    expect(syllableTones('dì tiě')).toEqual([4, 3])
    expect(syllableTones('zhǔ yi')).toEqual([3, 5])
  })
})

describe('hanziTones', () => {
  it('pairs characters with their tones', () => {
    expect(hanziTones('地铁', 'dì tiě')).toEqual([4, 3])
  })

  it('declines to guess when the counts disagree', () => {
    expect(hanziTones('地铁', 'dì')).toBeNull()
  })
})
