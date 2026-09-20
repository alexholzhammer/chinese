import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_TYPES } from '@/config'
import { parseCsvRecords } from '@/lib/import/csv'
import {
  hskToWords,
  introductionOrder,
  isMarginalReading,
  pickPrimaryIndex,
  parseDuChinese,
  type HskEntry,
} from '@/lib/import/transform'

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url))
const hskRaw: HskEntry[] = JSON.parse(readFileSync(root('data/hsk/hsk-complete.min.json'), 'utf8'))
const csvRaw = readFileSync(root('data/vocab/duchinese-2026-09-19.csv'), 'utf8')

const words = hskToWords(hskRaw)
const bySimplified = new Map(words.map((w) => [w.simplified, w]))
const { examples, extras } = parseDuChinese(csvRaw, words)

describe('HSK library', () => {
  it('yields 3,181 words for bands 1-4', () => {
    expect(words).toHaveLength(3181)
  })

  it('has no duplicate headwords — there is nothing to dedupe', () => {
    expect(bySimplified.size).toBe(words.length)
  })

  it('yields 3,555 readings across those words', () => {
    // 3,734 form rows in the dataset collapse to 3,555 distinct pronunciations.
    expect(words.reduce((n, w) => n + w.readings.length, 0)).toBe(3555)
  })

  it('has 318 words carrying more than one distinct pronunciation', () => {
    expect(words.filter((w) => w.readings.length > 1)).toHaveLength(318)
  })

  it('splits by band the way the standard does', () => {
    const counts: Record<string, number> = {}
    for (const w of words) counts[w.hskNew!] = (counts[w.hskNew!] ?? 0) + 1
    expect(counts).toEqual({ n1: 506, n2: 750, n3: 953, n4: 972 })
  })

  it('keeps 还 as ONE word with hái, huán and the surname', () => {
    const huan = bySimplified.get('还')!
    expect(huan).toBeDefined()
    // Ordered primary-first, not alphabetically.
    expect(huan.readings.map((r) => r.pinyin).sort()).toEqual(['Huán', 'hái', 'huán'].sort())
    expect(huan.readings[0]!.pinyin).toBe('hái')
  })

  it('picks hái as 还’s primary reading, not the surname', () => {
    const primary = bySimplified.get('还')!.readings.find((r) => r.isPrimary)!
    expect(primary.pinyin).toBe('hái')
    expect(primary.meanings).toContain('still')
  })

  it('keeps both readings of 长 and 把', () => {
    // 长 is the honest limit of the heuristic: cháng (long) and zhǎng (to
    // grow) are both core, so ranking by gloss count picks zhǎng on 7 vs 5.
    // A coin flip rather than an error — the card shows both either way.
    expect(bySimplified.get('长')!.readings.map((r) => r.pinyin).sort()).toEqual(
      ['cháng', 'zhǎng'].sort(),
    )
    expect(bySimplified.get('把')!.readings.map((r) => r.pinyin).sort()).toEqual(
      ['bà', 'bǎ'].sort(),
    )
    expect(bySimplified.get('把')!.readings[0]!.pinyin).toBe('bǎ')
  })

  it('excludes bands outside the configured range', () => {
    // 觉 (jiào/jué) is HSK 6 — it must not leak into a 1-4 library.
    expect(bySimplified.has('觉')).toBe(false)
  })

  it('merges form rows that share a pronunciation, unioning their meanings', () => {
    // 帮 is listed as bāng three times with different glosses; 了解 twice.
    const bang = bySimplified.get('帮')!
    expect(bang.readings.map((r) => r.pinyin)).toEqual(['bāng'])
    expect(bang.readings[0]!.meanings.length).toBeGreaterThan(1)
    expect(bySimplified.get('了解')!.readings).toHaveLength(1)
    // 干 has four gān rows, two Gān and one gàn -> three pronunciations.
    expect(bySimplified.get('干')!.readings.map((r) => r.pinyin).sort()).toEqual(
      ['Gān', 'gān', 'gàn'].sort(),
    )
    // Case stays significant: the surname reading is not merged away, but it
    // is not the one shown as the main reading either.
    expect(bySimplified.get('安')!.readings.map((r) => r.pinyin).sort()).toEqual(
      ['Ān', 'ān'].sort(),
    )
    expect(bySimplified.get('安')!.readings[0]!.pinyin).toBe('ān')
    for (const w of words) {
      const keys = w.readings.map((r) => `${r.pinyin}|${r.meanings.join('/')}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('gives every word exactly one primary reading', () => {
    for (const w of words) {
      expect(w.readings.filter((r) => r.isPrimary)).toHaveLength(1)
    }
  })

  it('derives numeric pinyin rather than trusting the dataset’s casing', () => {
    expect(bySimplified.get('地铁')!.readings[0]!.pinyinNumeric).toBe('di4 tie3')
  })

  it('treats the unranked sentinel as no rank at all', () => {
    expect(words.some((w) => w.frequencyRank === 1_000_000)).toBe(false)
    expect(bySimplified.get('一下儿')!.frequencyRank).toBeNull()
  })
})

describe('introduction order', () => {
  const order = introductionOrder(words)

  it('runs band 1 before band 2', () => {
    const worst1 = Math.max(...words.filter((w) => w.hskNew === 'n1').map((w) => order.get(w.simplified)!))
    const best2 = Math.min(...words.filter((w) => w.hskNew === 'n2').map((w) => order.get(w.simplified)!))
    expect(worst1).toBeLessThan(best2)
  })

  it('puts the commonest words of a band first', () => {
    expect(order.get('的')).toBeLessThan(order.get('睡觉')!)
  })

  it('sorts unranked words last within their band, not first', () => {
    const unranked = words.find((w) => w.hskNew === 'n1' && w.frequencyRank === null)!
    expect(order.get(unranked.simplified)!).toBeGreaterThan(order.get('的')!)
  })

  it('assigns a distinct rank to every word', () => {
    expect(new Set(order.values()).size).toBe(words.length)
  })
})

describe('Du Chinese export', () => {
  it('parses 742 rows past the leading # comment', () => {
    expect(parseCsvRecords(csvRaw)).toHaveLength(742)
  })

  it('reads quoted fields containing newlines and full-width punctuation', () => {
    const rows = parseCsvRecords(csvRaw)
    expect(rows[0]!['Simplified']).toBe('票')
    expect(rows[0]!['Meaning']).toContain('\n') // "ticket\nballot"
    expect(rows[0]!['Simplified sentence']).toContain('。')
  })

  it('yields 606 distinct example sentences', () => {
    expect(examples).toHaveLength(606)
  })

  it('attaches those sentences to 615 HSK words', () => {
    const attached = new Set<string>()
    for (const e of examples) for (const w of e.words) if (bySimplified.has(w)) attached.add(w)
    expect(attached.size).toBe(615)
  })

  it('carries pinyin and a translation on every sentence', () => {
    for (const e of examples) {
      expect(e.pinyin.length).toBeGreaterThan(0)
      expect(e.translation.length).toBeGreaterThan(0)
    }
  })

  it('contributes 123 extra words outside the HSK bands', () => {
    expect(extras).toHaveLength(123)
  })

  it('never re-adds a word the HSK library already has', () => {
    for (const e of extras) expect(bySimplified.has(e.simplified)).toBe(false)
  })

  it('splits multi-line meanings into separate senses', () => {
    const rows = parseCsvRecords(csvRaw)
    const piao = rows.find((r) => r['Simplified'] === '票')!
    expect(piao['Meaning']!.split('\n').filter(Boolean)).toEqual(['ticket', 'ballot'])
  })
})

describe('card generation', () => {
  it('produces 3,181 cards at the recognition-only default', () => {
    expect(words.length * DEFAULT_CARD_TYPES.length).toBe(3181)
  })

  it('produces 6,362 with audio and 9,543 with typing too', () => {
    expect(words.length * 2).toBe(6362)
    expect(words.length * 3).toBe(9543)
  })
})

describe('isMarginalReading', () => {
  it('treats capitalised pinyin as a proper noun', () => {
    // CC-CEDICT's convention: 周 Zhōu is the surname, 周 zhōu is "week".
    expect(isMarginalReading('Zhōu', ['surname Zhou', 'Zhou Dynasty'])).toBe(true)
    expect(isMarginalReading('zhōu', ['week', 'cycle'])).toBe(false)
  })

  it('treats a gloss that only points elsewhere as marginal', () => {
    expect(isMarginalReading('huán', ['surname Huan'])).toBe(true)
    expect(isMarginalReading('shuō', ['variant of 说'])).toBe(true)
    expect(isMarginalReading('x', [])).toBe(true)
  })

  it('leaves a real reading alone', () => {
    expect(isMarginalReading('hái', ['still', 'yet'])).toBe(false)
    expect(isMarginalReading('huán', ['surname Huan', 'to return'])).toBe(false)
  })
})

describe('pickPrimaryIndex', () => {
  it('picks the reading the dictionary says most about, not the first', () => {
    // The dataset lists forms alphabetically, so shuì comes before shuō.
    const forms = [
      { pinyin: 'shuì', meanings: ['to persuade'] },
      { pinyin: 'shuō', meanings: ['to speak', 'to talk', 'to say', 'to explain'] },
    ]
    expect(pickPrimaryIndex(forms)).toBe(1)
  })

  it('skips a proper noun even when it is listed first', () => {
    const forms = [
      { pinyin: 'Zhōu', meanings: ['surname Zhou', 'Zhou Dynasty'] },
      { pinyin: 'zhōu', meanings: ['week', 'cycle', 'circuit'] },
    ]
    expect(pickPrimaryIndex(forms)).toBe(1)
  })

  it('falls back to the fullest reading when every one is marginal', () => {
    const forms = [
      { pinyin: 'Ā', meanings: ['surname A'] },
      { pinyin: 'Ē', meanings: ['surname E', 'place name'] },
    ]
    expect(pickPrimaryIndex(forms)).toBe(1)
  })

  it('handles a single reading and an empty list', () => {
    expect(pickPrimaryIndex([{ pinyin: 'de', meanings: ['of'] }])).toBe(0)
    expect(pickPrimaryIndex([])).toBe(-1)
  })
})

describe('primary readings in the real library', () => {
  const primaryOf = (w: string) => bySimplified.get(w)!.readings.find((r) => r.isPrimary)!

  it('gets the words that were wrong before', () => {
    expect(primaryOf('说').pinyin).toBe('shuō')
    expect(primaryOf('打').pinyin).toBe('dǎ')
    expect(primaryOf('行').pinyin).toBe('xíng')
    expect(primaryOf('周').pinyin).toBe('zhōu')
    expect(primaryOf('片').pinyin).toBe('piàn')
    expect(primaryOf('还').pinyin).toBe('hái')
  })

  it('lists the primary reading first', () => {
    for (const w of words) {
      expect(w.readings[0]!.isPrimary).toBe(true)
      expect(w.readings.filter((r) => r.isPrimary)).toHaveLength(1)
    }
  })

  it('never picks a proper-noun reading when a real one exists', () => {
    for (const w of words) {
      const primary = w.readings.find((r) => r.isPrimary)!
      const hasReal = w.readings.some((r) => !isMarginalReading(r.pinyin, r.meanings))
      if (hasReal) expect(isMarginalReading(primary.pinyin, primary.meanings)).toBe(false)
    }
  })

  it('never picks a reading another one clearly beats on gloss count', () => {
    for (const w of words) {
      const primary = w.readings.find((r) => r.isPrimary)!
      const real = w.readings.filter((r) => !isMarginalReading(r.pinyin, r.meanings))
      if (real.length === 0) continue
      const best = Math.max(...real.map((r) => r.meanings.length))
      expect(primary.meanings.length).toBe(best)
    }
  })
})
