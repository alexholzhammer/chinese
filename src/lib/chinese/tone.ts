import { syllableTones } from './pinyin'

/**
 * Tone colours. Cheap to add and it makes tones stick, which is the single
 * thing adult learners most reliably fail to acquire from reading alone.
 *
 * Defined as CSS custom properties so light and dark can differ; see index.css.
 */
export const TONE_CLASS: Record<number, string> = {
  1: 'tone-1',
  2: 'tone-2',
  3: 'tone-3',
  4: 'tone-4',
  5: 'tone-5',
  0: '',
}

export function toneClassesFor(pinyin: string): string[] {
  return syllableTones(pinyin).map((t) => TONE_CLASS[t] ?? '')
}

/**
 * Pair each hanzi character with the tone of its syllable, so the characters
 * can be coloured to match the pinyin beneath them.
 *
 * Only applied when the counts line up — a mismatch means the pinyin has
 * punctuation or a latin name in it, and guessing would mis-colour.
 */
export function hanziTones(hanzi: string, pinyin: string): number[] | null {
  const chars = [...hanzi]
  const tones = syllableTones(pinyin)
  if (chars.length !== tones.length) return null
  return tones
}
