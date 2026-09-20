/**
 * Placement test.
 *
 * Starting a 3,181-word deck cold means weeks of confirming 的, 我, 是. The
 * Du Chinese export can't tell us what's already known — it records exposure
 * while reading, not retention — so the only honest source is answers.
 *
 * Calibration does NOT have to be accurate, because the SRS corrects it: a
 * word wrongly seeded fails once and drops into relearning, a known word left
 * new takes one keypress to move on. A wrong guess costs about one review. So
 * this samples rather than sweeps: ~120 words in ten minutes, enough to sort
 * each stratum into bulk-seed / triage / leave-new.
 */

export const STRATUM_SAMPLE_SIZE = 15
/** At or above this share known, seed the whole stratum. */
export const BULK_SEED_THRESHOLD = 0.9
/** At or below this, leave the whole stratum as new. */
export const LEAVE_NEW_THRESHOLD = 0.2

export interface CalibrationWord {
  wordId: number
  simplified: string
  hskNew: string
  frequencyRank: number | null
}

export type FrequencyBand = 'common' | 'rare'
export type StratumKey = `${string}:${FrequencyBand}`

export interface Stratum {
  key: StratumKey
  level: string
  band: FrequencyBand
  /** Every word in the stratum, not just the sampled ones. */
  wordIds: number[]
}

export const stratumKey = (level: string, band: FrequencyBand): StratumKey => `${level}:${band}`

/**
 * Split each HSK band in half at its median frequency rank.
 *
 * Knowledge tracks frequency far more tightly than it tracks HSK level, so a
 * level alone is too coarse a stratum: a learner may know every common HSK-4
 * word and none of the rare HSK-2 ones.
 */
export function buildStrata(words: CalibrationWord[]): Stratum[] {
  const byLevel = new Map<string, CalibrationWord[]>()
  for (const w of words) {
    const list = byLevel.get(w.hskNew)
    if (list) list.push(w)
    else byLevel.set(w.hskNew, [w])
  }

  const strata: Stratum[] = []
  for (const [level, list] of [...byLevel.entries()].sort()) {
    // Unranked words sort last, and land in the rare half.
    const sorted = [...list].sort(
      (a, b) =>
        (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.frequencyRank ?? Number.MAX_SAFE_INTEGER),
    )
    const mid = Math.ceil(sorted.length / 2)
    strata.push({
      key: stratumKey(level, 'common'),
      level,
      band: 'common',
      wordIds: sorted.slice(0, mid).map((w) => w.wordId),
    })
    strata.push({
      key: stratumKey(level, 'rare'),
      level,
      band: 'rare',
      wordIds: sorted.slice(mid).map((w) => w.wordId),
    })
  }
  return strata
}

/** Deterministic PRNG, so a reload returns the same test rather than a new one. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sample<T>(items: T[], n: number, rand: () => number): T[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, n)
}

export interface SampledItem {
  wordId: number
  stratum: StratumKey
}

export function buildSample(
  strata: Stratum[],
  seed = 1,
  perStratum = STRATUM_SAMPLE_SIZE,
): SampledItem[] {
  const rand = mulberry32(seed)
  const out: SampledItem[] = []
  for (const s of strata) {
    for (const wordId of sample(s.wordIds, perStratum, rand)) {
      out.push({ wordId, stratum: s.key })
    }
  }
  return out
}

export type SeedAction = 'seed-known' | 'triage' | 'leave-new'

export interface StratumVerdict {
  stratum: StratumKey
  known: number
  tested: number
  ratio: number
  action: SeedAction
  wordIds: number[]
}

/**
 * Turn test answers into a per-stratum decision.
 *
 * With 15 words a stratum the margin is roughly +/- 22 points, which is coarse
 * — but so is the decision, and the SRS absorbs the error.
 */
export function gradeSample(
  strata: Stratum[],
  answers: { wordId: number; stratum: StratumKey; known: boolean }[],
): StratumVerdict[] {
  const tally = new Map<StratumKey, { known: number; tested: number }>()
  for (const a of answers) {
    const t = tally.get(a.stratum) ?? { known: 0, tested: 0 }
    t.tested += 1
    if (a.known) t.known += 1
    tally.set(a.stratum, t)
  }

  return strata.map((s) => {
    const t = tally.get(s.key) ?? { known: 0, tested: 0 }
    const ratio = t.tested === 0 ? 0 : t.known / t.tested
    const action: SeedAction =
      t.tested === 0
        ? 'leave-new'
        : ratio >= BULK_SEED_THRESHOLD
          ? 'seed-known'
          : ratio <= LEAVE_NEW_THRESHOLD
            ? 'leave-new'
            : 'triage'
    return { stratum: s.key, known: t.known, tested: t.tested, ratio, action, wordIds: s.wordIds }
  })
}
