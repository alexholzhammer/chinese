import { describe, expect, it } from 'vitest'
import { LEECH_THRESHOLD } from '@/config'
import {
  applySnapshot,
  newCard,
  previewIntervals,
  review,
  seedAsKnown,
  type SrsCard,
} from '@/lib/srs'

const DAY = 86_400_000
/** Fixed clock — nothing in the scheduler may read the real time. */
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)
const fresh = () => newCard(1, 'recognition', T0)

/** Grade a card repeatedly, advancing the clock to each due date. */
function drill(card: SrsCard, ratings: number[], start = T0) {
  let now = start
  let c = card
  for (const r of ratings) {
    now = Math.max(now, c.due)
    c = review(c, r as 1 | 2 | 3 | 4, now).card
  }
  return { card: c, now }
}

describe('scheduler', () => {
  it('starts a new card in the new state, due immediately', () => {
    const c = fresh()
    expect(c.state).toBe('new')
    expect(c.due).toBe(T0)
    expect(c.reps).toBe(0)
  })

  it('Again on a new card puts it in learning on a minutes scale', () => {
    const { card } = review(fresh(), 1, T0)
    expect(card.state).toBe('learning')
    const gap = card.due - T0
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThan(DAY)
  })

  it('repeated Good grows the interval monotonically into days', () => {
    let c = fresh()
    let now = T0
    const intervals: number[] = []
    for (let i = 0; i < 6; i++) {
      now = Math.max(now, c.due)
      const out = review(c, 3, now)
      c = out.card
      intervals.push(c.due - now)
    }
    expect(c.state).toBe('review')
    const dayScale = intervals.filter((i) => i >= DAY)
    expect(dayScale.length).toBeGreaterThanOrEqual(3)
    // Once on the day scale, each interval exceeds the previous one.
    for (let i = 1; i < dayScale.length; i++) {
      expect(dayScale[i]!).toBeGreaterThan(dayScale[i - 1]!)
    }
  })

  it('a lapse increments lapses and drops stability', () => {
    const { card: mature, now } = drill(fresh(), [3, 3, 3, 3])
    expect(mature.state).toBe('review')
    const before = mature.stability
    const { card: lapsed } = review(mature, 1, Math.max(now, mature.due))
    expect(lapsed.lapses).toBe(mature.lapses + 1)
    expect(lapsed.stability).toBeLessThan(before)
    expect(lapsed.state).toBe('relearning')
  })

  it('Easy schedules further out than Good, which beats Hard, which beats Again', () => {
    const { card } = drill(fresh(), [3, 3, 3])
    const at = Math.max(T0, card.due)
    const p = previewIntervals(card, at)
    expect(p[1]).toBeLessThan(p[2])
    expect(p[2]).toBeLessThan(p[3])
    expect(p[3]).toBeLessThan(p[4])
  })

  it('preview matches what grading actually does', () => {
    const { card } = drill(fresh(), [3, 3])
    const at = Math.max(T0, card.due)
    const p = previewIntervals(card, at)
    for (const r of [1, 2, 3, 4] as const) {
      const actual = review(card, r, at).card.due - at
      expect(actual).toBe(p[r])
    }
  })

  it('is deterministic — fuzz is off, so button labels cannot lie', () => {
    const a = previewIntervals(drill(fresh(), [3, 3, 3]).card, T0 + 10 * DAY)
    const b = previewIntervals(drill(fresh(), [3, 3, 3]).card, T0 + 10 * DAY)
    expect(a).toEqual(b)
  })

  it('never reads the wall clock', () => {
    // Same card, same injected `now`, called a moment apart in real time.
    const c = drill(fresh(), [3, 3]).card
    const one = review(c, 3, T0 + 5 * DAY).card
    const two = review(c, 3, T0 + 5 * DAY).card
    expect(one.due).toBe(two.due)
    expect(one.stability).toBe(two.stability)
  })
})

describe('leeches', () => {
  it(`flags and suspends a card at ${LEECH_THRESHOLD} lapses`, () => {
    let c = fresh()
    let now = T0
    let became = 0
    // Alternate Good and Again so the card keeps lapsing from review state.
    while (c.lapses < LEECH_THRESHOLD && now < T0 + 4000 * DAY) {
      now = Math.max(now, c.due)
      const out = review(c, c.state === 'review' ? 1 : 3, now)
      c = out.card
      if (out.becameLeech) became += 1
    }
    expect(c.lapses).toBeGreaterThanOrEqual(LEECH_THRESHOLD)
    expect(c.isLeech).toBe(true)
    expect(c.suspended).toBe(true)
    expect(became).toBe(1) // reported exactly once, not on every later review
  })

  it('leaves a card alone below the threshold', () => {
    const { card } = drill(fresh(), [3, 1, 3, 1])
    expect(card.lapses).toBeLessThan(LEECH_THRESHOLD)
    expect(card.isLeech).toBe(false)
    expect(card.suspended).toBe(false)
  })
})

describe('undo', () => {
  it('restores the exact prior state', () => {
    const { card: before } = drill(fresh(), [3, 3, 3])
    const at = Math.max(T0, before.due)
    const { card: after, snapshot } = review(before, 1, at)
    expect(after).not.toEqual(before)

    const restored = applySnapshot(after, snapshot)
    expect(restored.state).toBe(before.state)
    expect(restored.due).toBe(before.due)
    expect(restored.stability).toBe(before.stability)
    expect(restored.difficulty).toBe(before.difficulty)
    expect(restored.reps).toBe(before.reps)
    expect(restored.lapses).toBe(before.lapses)
    expect(restored.lastReview).toBe(before.lastReview)
  })

  it('un-suspends a card whose leech was undone', () => {
    let c = fresh()
    let now = T0
    let last: ReturnType<typeof review> | null = null
    while (!c.isLeech && now < T0 + 4000 * DAY) {
      now = Math.max(now, c.due)
      last = review(c, c.state === 'review' ? 1 : 3, now)
      c = last.card
    }
    expect(c.isLeech).toBe(true)
    const restored = applySnapshot(c, last!.snapshot)
    expect(restored.isLeech).toBe(false)
    expect(restored.suspended).toBe(false)
  })
})

describe('seedAsKnown', () => {
  it('schedules well out instead of skipping the card', () => {
    const out = seedAsKnown(fresh(), T0)
    expect(out.card.state).toBe('review')
    expect(out.card.due).toBeGreaterThan(T0 + 20 * DAY)
    expect(out.card.reps).toBe(1)
    // It will come back round and confirm itself — not silently assumed known.
    expect(out.card.due).toBeLessThan(T0 + 40 * DAY)
  })

  it('is undoable back to new', () => {
    const c = fresh()
    const out = seedAsKnown(c, T0)
    const restored = applySnapshot(out.card, out.snapshot)
    expect(restored.state).toBe('new')
    expect(restored.due).toBe(c.due)
    expect(restored.reps).toBe(0)
  })

  it('keeps scheduling normally afterwards', () => {
    const seeded = seedAsKnown(fresh(), T0).card
    const next = review(seeded, 3, seeded.due).card
    expect(next.state).toBe('review')
    expect(next.due).toBeGreaterThan(seeded.due)
  })
})
