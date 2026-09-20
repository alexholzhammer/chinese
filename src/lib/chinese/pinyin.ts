/**
 * Tone-marked pinyin -> numeric pinyin. `dì tiě` becomes `di4 tie3`.
 *
 * Numeric form is what search and any typed-answer checking should compare
 * against, so neither has to deal with combining diacritics.
 */

const TONE_MARKS: Record<string, number> = {
  '̄': 1, // macron
  '́': 2, // acute
  '̌': 3, // caron
  '̀': 4, // grave
}

/** Strip tone marks: `dì tiě` -> `di tie`. */
export function stripTones(pinyin: string): string {
  return pinyin
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function syllableToNumeric(syllable: string): string {
  const decomposed = syllable.normalize('NFD')
  let tone = 5 // neutral until a mark says otherwise
  let base = ''
  for (const ch of decomposed) {
    const t = TONE_MARKS[ch]
    if (t !== undefined) {
      tone = t
      continue
    }
    // ü survives as u + diaeresis in NFD; keep it as the letter v-free 'ü'.
    if (ch === '̈') {
      base += '̈'
      continue
    }
    base += ch
  }
  const normalized = base.normalize('NFC')
  if (!/[a-zü]/i.test(normalized)) return normalized // punctuation, latin names
  return `${normalized.toLowerCase()}${tone}`
}

/** `dì tiě` -> `di4 tie3`; `qi lai` -> `qi5 lai5`. */
export function toNumericPinyin(pinyin: string): string {
  return pinyin
    .trim()
    .split(/\s+/)
    .map(syllableToNumeric)
    .join(' ')
}

/** The tone of each syllable, for colouring. 5 = neutral, 0 = not a syllable. */
export function syllableTones(pinyin: string): number[] {
  return pinyin
    .trim()
    .split(/\s+/)
    .map((s) => {
      const decomposed = s.normalize('NFD')
      if (!/[a-zü]/i.test(decomposed.replace(/[̀-ͯ]/g, ''))) return 0
      for (const ch of decomposed) {
        const t = TONE_MARKS[ch]
        if (t !== undefined) return t
      }
      return 5
    })
}
