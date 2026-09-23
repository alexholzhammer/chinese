/**
 * An Eselsbrücke is free text, but blank is meaningfully different from
 * absent: clearing the box should remove the hook, not leave an empty one that
 * still renders a Hint button with nothing behind it.
 */
export const MNEMONIC_MAX_LENGTH = 2000

export interface NormalizedMnemonic {
  /** null means "delete this mnemonic". */
  text: string | null
  tooLong: boolean
}

export function normalizeMnemonic(input: unknown): NormalizedMnemonic {
  if (typeof input !== 'string') return { text: null, tooLong: false }
  // Collapse the trailing blank lines a textarea leaves behind, but keep
  // deliberate internal line breaks — mnemonics are often two or three lines.
  const trimmed = input.replace(/[ \t]+$/gm, '').trim()
  if (trimmed.length === 0) return { text: null, tooLong: false }
  return {
    text: trimmed.slice(0, MNEMONIC_MAX_LENGTH),
    tooLong: trimmed.length > MNEMONIC_MAX_LENGTH,
  }
}
