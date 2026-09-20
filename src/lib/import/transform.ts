import { INCLUDED_HSK_LEVELS } from '@/config'
import { toNumericPinyin } from '@/lib/chinese/pinyin'
import { parseCsvRecords } from './csv'

/** One entry of complete-hsk-vocabulary (the minified shape). */
export interface HskEntry {
  s: string // simplified
  r?: string // radical
  l: string[] // levels, e.g. ['n1','o2','t1']
  q?: number // frequency rank; 1_000_000 is an "unranked" sentinel
  p?: string[] // parts of speech
  f: {
    t?: string // traditional — unused, simplified only
    i: { y: string; n: string } // pinyin: tone-marked, numeric
    m: string[] // meanings
  }[]
}

export interface ReadingSeed {
  sortOrder: number
  pinyin: string
  pinyinNumeric: string
  meanings: string[]
  isPrimary: boolean
}

export interface WordSeed {
  simplified: string
  hskNew: string | null
  hskOld: string | null
  frequencyRank: number | null
  radical: string | null
  pos: string[]
  readings: ReadingSeed[]
}

export interface ExampleSeed {
  simplified: string
  pinyin: string
  translation: string
  /** Headwords this sentence illustrates. */
  words: string[]
}

const UNRANKED = 1_000_000
const LEVEL_ORDER: Record<string, number> = { n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, n7: 7 }

/** A form glossed only as a surname is not what you want read aloud or tested. */
export function isSurnameOnly(meanings: string[]): boolean {
  return meanings.length > 0 && meanings.every((m) => /^surname\b/i.test(m.trim()))
}

function lowestLevel(levels: string[], prefix: string): string | null {
  const matching = levels.filter((l) => l.startsWith(prefix)).sort()
  return matching[0] ?? null
}

/** HSK entries -> word seeds, for the configured bands only. */
export function hskToWords(
  entries: HskEntry[],
  levels: readonly string[] = INCLUDED_HSK_LEVELS,
): WordSeed[] {
  const wanted = new Set(levels)
  const out: WordSeed[] = []

  for (const e of entries) {
    if (!e.l.some((l) => wanted.has(l))) continue

    // A reading is a pronunciation; meanings belong to it. The dataset splits
    // some pronunciations across several form rows — 帮 lists bāng three times
    // with different glosses, 干 lists gān four times — so merge on the exact
    // pinyin and union the meanings. Case is significant: it keeps the surname
    // reading 安 Ān apart from the ordinary 安 ān.
    const merged = new Map<string, { pinyin: string; meanings: string[] }>()
    for (const f of e.f ?? []) {
      const pinyin = f.i.y.trim()
      const entry = merged.get(pinyin) ?? { pinyin, meanings: [] }
      for (const m of f.m) if (!entry.meanings.includes(m)) entry.meanings.push(m)
      merged.set(pinyin, entry)
    }
    const forms = [...merged.values()]

    // Prefer a real reading over a surname gloss for audio and summaries.
    const primaryIdx = forms.findIndex((f) => !isSurnameOnly(f.meanings))

    const readings: ReadingSeed[] = forms.map((f, idx) => ({
      sortOrder: idx,
      pinyin: f.pinyin,
      // Derive rather than trust: the dataset's numeric field is
      // inconsistently cased ("A1 la1 bo2 yu3").
      pinyinNumeric: toNumericPinyin(f.pinyin),
      meanings: f.meanings,
      isPrimary: idx === (primaryIdx === -1 ? 0 : primaryIdx),
    }))

    out.push({
      simplified: e.s,
      hskNew: lowestLevel(e.l, 'n'),
      hskOld: lowestLevel(e.l, 'o'),
      frequencyRank: e.q && e.q < UNRANKED ? e.q : null,
      radical: e.r ?? null,
      pos: e.p ?? [],
      readings,
    })
  }
  return out
}

/**
 * New-card order: HSK band ascending, then commonest first.
 *
 * Unranked words sort last within their band rather than first, which is what
 * a null frequency would otherwise do.
 */
export function introductionOrder(words: WordSeed[]): Map<string, number> {
  const sorted = [...words].sort((a, b) => {
    const la = LEVEL_ORDER[a.hskNew ?? ''] ?? 99
    const lb = LEVEL_ORDER[b.hskNew ?? ''] ?? 99
    if (la !== lb) return la - lb
    const fa = a.frequencyRank ?? Number.MAX_SAFE_INTEGER
    const fb = b.frequencyRank ?? Number.MAX_SAFE_INTEGER
    if (fa !== fb) return fa - fb
    return a.simplified.localeCompare(b.simplified)
  })
  return new Map(sorted.map((w, i) => [w.simplified, i]))
}

export interface DuChineseResult {
  examples: ExampleSeed[]
  /** Headwords in the export that are outside the configured HSK bands. */
  extras: WordSeed[]
}

/**
 * The Du Chinese export.
 *
 * Two jobs, both narrow. It supplies the example sentences the HSK dataset
 * lacks entirely, and it contributes the words outside the HSK bands.
 *
 * It deliberately does NOT mark anything as known: within every HSK band the
 * saved words are the *more common* ones, which is the signature of exposure
 * while reading rather than of retention. Inferring knowledge from it would be
 * wrong in both directions. Seeding is the calibration step's job.
 */
export function parseDuChinese(csv: string, hskWords: WordSeed[]): DuChineseResult {
  const records = parseCsvRecords(csv)
  const hskBySimplified = new Map(hskWords.map((w) => [w.simplified, w]))

  const bySentence = new Map<string, ExampleSeed>()
  const extras = new Map<string, WordSeed>()

  for (const r of records) {
    const simplified = (r['Simplified'] ?? '').trim()
    if (!simplified) continue

    const sentence = (r['Simplified sentence'] ?? '').trim()
    if (sentence) {
      const existing = bySentence.get(sentence)
      if (existing) {
        if (!existing.words.includes(simplified)) existing.words.push(simplified)
      } else {
        bySentence.set(sentence, {
          simplified: sentence,
          pinyin: (r['Sentence pinyin'] ?? '').trim(),
          translation: (r['Sentence translation'] ?? '').trim(),
          words: [simplified],
        })
      }
    }

    if (hskBySimplified.has(simplified)) continue

    // Outside the HSK bands: keep it, it is a word actually met while reading.
    const pinyin = (r['Pinyin'] ?? '').trim()
    const meanings = (r['Meaning'] ?? '')
      .split('\n')
      .map((m) => m.trim())
      .filter(Boolean)

    const found = extras.get(simplified)
    if (found) {
      const reading = found.readings.find((x) => x.pinyin === pinyin)
      if (reading) {
        for (const m of meanings) if (!reading.meanings.includes(m)) reading.meanings.push(m)
      } else {
        found.readings.push({
          sortOrder: found.readings.length,
          pinyin,
          pinyinNumeric: toNumericPinyin(pinyin),
          meanings,
          isPrimary: false,
        })
      }
      continue
    }

    extras.set(simplified, {
      simplified,
      hskNew: null,
      hskOld: null,
      frequencyRank: null,
      radical: null,
      pos: [],
      readings: [
        {
          sortOrder: 0,
          pinyin,
          pinyinNumeric: toNumericPinyin(pinyin),
          meanings,
          isPrimary: true,
        },
      ],
    })
  }

  return { examples: [...bySentence.values()], extras: [...extras.values()] }
}
