import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BULK_SEED_THRESHOLD,
  buildSample,
  buildStrata,
  gradeSample,
  STRATUM_SAMPLE_SIZE,
  stratumKey,
  type CalibrationWord,
} from '@/lib/calibration'
import { hskToWords, type HskEntry } from '@/lib/import/transform'

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url))
const hsk: HskEntry[] = JSON.parse(readFileSync(root('data/hsk/hsk-complete.min.json'), 'utf8'))
const words: CalibrationWord[] = hskToWords(hsk).map((w, i) => ({
  wordId: i + 1,
  simplified: w.simplified,
  hskNew: w.hskNew!,
  frequencyRank: w.frequencyRank,
}))
const strata = buildStrata(words)

describe('strata', () => {
  it('splits 4 bands into a common and a rare half each', () => {
    expect(strata).toHaveLength(8)
    expect(strata.map((s) => s.key)).toEqual([
      'n1:common', 'n1:rare',
      'n2:common', 'n2:rare',
      'n3:common', 'n3:rare',
      'n4:common', 'n4:rare',
    ])
  })

  it('covers every word exactly once', () => {
    const all = strata.flatMap((s) => s.wordIds)
    expect(all).toHaveLength(words.length)
    expect(new Set(all).size).toBe(words.length)
  })

  it('puts commoner words in the common half', () => {
    const byId = new Map(words.map((w) => [w.wordId, w]))
    for (const level of ['n1', 'n2', 'n3', 'n4']) {
      const common = strata.find((s) => s.key === stratumKey(level, 'common'))!
      const rare = strata.find((s) => s.key === stratumKey(level, 'rare'))!
      const worstCommon = Math.max(
        ...common.wordIds.map((id) => byId.get(id)!.frequencyRank ?? Number.MAX_SAFE_INTEGER),
      )
      const bestRare = Math.min(
        ...rare.wordIds.map((id) => byId.get(id)!.frequencyRank ?? Number.MAX_SAFE_INTEGER),
      )
      expect(worstCommon).toBeLessThanOrEqual(bestRare)
    }
  })

  it('halves each band to within one word', () => {
    for (const level of ['n1', 'n2', 'n3', 'n4']) {
      const c = strata.find((s) => s.key === stratumKey(level, 'common'))!.wordIds.length
      const r = strata.find((s) => s.key === stratumKey(level, 'rare'))!.wordIds.length
      expect(Math.abs(c - r)).toBeLessThanOrEqual(1)
    }
  })
})

describe('sample', () => {
  const sampled = buildSample(strata)

  it('is 120 words — 15 per stratum', () => {
    expect(sampled).toHaveLength(8 * STRATUM_SAMPLE_SIZE)
  })

  it('never repeats a word', () => {
    expect(new Set(sampled.map((s) => s.wordId)).size).toBe(sampled.length)
  })

  it('draws exactly 15 from each stratum', () => {
    for (const s of strata) {
      expect(sampled.filter((x) => x.stratum === s.key)).toHaveLength(STRATUM_SAMPLE_SIZE)
    }
  })

  it('only draws a word from the stratum it belongs to', () => {
    const owner = new Map<number, string>()
    for (const s of strata) for (const id of s.wordIds) owner.set(id, s.key)
    for (const item of sampled) expect(owner.get(item.wordId)).toBe(item.stratum)
  })

  it('is deterministic — reloading gives the same test, not a new one', () => {
    expect(buildSample(strata, 7)).toEqual(buildSample(strata, 7))
    expect(buildSample(strata, 7)).not.toEqual(buildSample(strata, 8))
  })
})

describe('grading', () => {
  const answersFor = (knownCount: number) =>
    buildSample(strata).map((s, i) => ({
      ...s,
      known: s.stratum === 'n1:common' ? i % STRATUM_SAMPLE_SIZE < knownCount : false,
    }))

  it('bulk-seeds a stratum scored 14 of 15', () => {
    const verdicts = gradeSample(strata, answersFor(14))
    const v = verdicts.find((x) => x.stratum === 'n1:common')!
    expect(v.known).toBe(14)
    expect(v.ratio).toBeGreaterThanOrEqual(BULK_SEED_THRESHOLD)
    expect(v.action).toBe('seed-known')
    // and it seeds the whole band, not just the sampled 15
    expect(v.wordIds.length).toBeGreaterThan(STRATUM_SAMPLE_SIZE)
  })

  it('seeds nothing for a stratum scored 2 of 15', () => {
    const v = gradeSample(strata, answersFor(2)).find((x) => x.stratum === 'n1:common')!
    expect(v.known).toBe(2)
    expect(v.action).toBe('leave-new')
  })

  it('sends a middling stratum to hand triage', () => {
    const v = gradeSample(strata, answersFor(8)).find((x) => x.stratum === 'n1:common')!
    expect(v.action).toBe('triage')
  })

  it('leaves an unanswered stratum new rather than guessing', () => {
    const v = gradeSample(strata, []).find((x) => x.stratum === 'n2:rare')!
    expect(v.tested).toBe(0)
    expect(v.action).toBe('leave-new')
  })

  it('returns a verdict for every stratum', () => {
    expect(gradeSample(strata, answersFor(5))).toHaveLength(strata.length)
  })
})
