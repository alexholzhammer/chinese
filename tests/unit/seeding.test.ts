import { describe, expect, it } from 'vitest'
import {
  KNOWN_SEED_DAYS,
  SEED_SPREAD_MAX_DAYS,
  SEED_SPREAD_MIN_DAYS,
  SEED_SPREAD_PER_DAY,
} from '@/config'
import { spreadSeedDays } from '@/lib/srs'

const spread = (n: number, base = KNOWN_SEED_DAYS) =>
  spreadSeedDays(n, base, SEED_SPREAD_PER_DAY, SEED_SPREAD_MIN_DAYS, SEED_SPREAD_MAX_DAYS)

const perDay = (offsets: number[]) => {
  const counts = new Map<number, number>()
  for (const d of offsets) counts.set(d, (counts.get(d) ?? 0) + 1)
  return counts
}

describe('spreadSeedDays', () => {
  it('fans a full placement-test seed across weeks, not one day', () => {
    // The bug this exists for: ~880 cards all landing on the same date, which
    // at a 200/day cap is five days of backlog and no new words.
    const counts = perDay(spread(880))
    // 880 cards at a target of 25/day is a 36-day window, inside the clamp.
    expect(counts.size).toBe(Math.ceil(880 / SEED_SPREAD_PER_DAY))
    expect(counts.size).toBeLessThanOrEqual(SEED_SPREAD_MAX_DAYS)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(SEED_SPREAD_PER_DAY + 1)
  })

  it('keeps the daily load near the target', () => {
    for (const n of [200, 500, 880, 1200]) {
      const busiest = Math.max(...perDay(spread(n)).values())
      // Only a batch big enough to hit the 42-day clamp exceeds the target.
      const cap = n / SEED_SPREAD_MAX_DAYS > SEED_SPREAD_PER_DAY
        ? Math.ceil(n / SEED_SPREAD_MAX_DAYS) + 1
        : SEED_SPREAD_PER_DAY + 1
      expect(busiest).toBeLessThanOrEqual(cap)
    }
  })

  it('centres the window on the base interval, so the average is unchanged', () => {
    const offsets = spread(880)
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length
    expect(Math.abs(mean - KNOWN_SEED_DAYS)).toBeLessThan(1)
  })

  it('keeps a small batch inside a sensible window', () => {
    const counts = perDay(spread(40))
    expect(counts.size).toBe(SEED_SPREAD_MIN_DAYS)
  })

  it('never schedules a card in the past or today', () => {
    for (const n of [1, 40, 880]) {
      for (const base of [3, 21]) {
        for (const d of spread(n, base)) expect(d).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('is deterministic, so re-running calibration is reproducible', () => {
    expect(spread(880)).toEqual(spread(880))
  })

  it('handles the empty and single-card cases', () => {
    expect(spread(0)).toEqual([])
    expect(spread(1)).toHaveLength(1)
  })

  it('spreads the shorter "shaky" interval too, without going negative', () => {
    const offsets = spread(400, 3)
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(1)
    expect(perDay(offsets).size).toBeGreaterThan(1)
  })
})
