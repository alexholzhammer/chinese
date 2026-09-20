import { describe, expect, it } from 'vitest'
import { buildQueue, dayStart, newCard, type SrsCard } from '@/lib/srs'

const DAY = 86_400_000
const HOUR = 3_600_000
const T0 = Date.UTC(2026, 0, 1, 12)

const due = (id: number, at: number, over: Partial<SrsCard> = {}): SrsCard => ({
  ...newCard(id, 'recognition', at),
  state: 'review',
  due: at,
  ...over,
})
const freshCard = (id: number): SrsCard => newCard(id, 'recognition', T0)
const many = (n: number, f: (i: number) => SrsCard) => Array.from({ length: n }, (_, i) => f(i))

describe('buildQueue', () => {
  it('caps new cards at the daily allowance', () => {
    const q = buildQueue({
      due: [],
      fresh: many(50, (i) => freshCard(i)),
      newWordsPerDay: 10,
      maxReviewsPerDay: 200,
    })
    expect(q).toHaveLength(10)
  })

  it('subtracts what has already been done today', () => {
    const q = buildQueue({
      due: many(30, (i) => due(100 + i, T0)),
      fresh: many(50, (i) => freshCard(i)),
      newWordsPerDay: 10,
      maxReviewsPerDay: 200,
      newDoneToday: 4,
      reviewsDoneToday: 190,
    })
    expect(q.filter((c) => c.state === 'new')).toHaveLength(6)
    expect(q.filter((c) => c.state === 'review')).toHaveLength(10)
  })

  it('caps reviews and takes the most overdue first', () => {
    const q = buildQueue({
      due: many(20, (i) => due(i, T0 - i * HOUR)),
      fresh: [],
      newWordsPerDay: 0,
      maxReviewsPerDay: 5,
    })
    expect(q).toHaveLength(5)
    // ids 19..15 are the oldest due times
    expect(q.map((c) => c.id)).toEqual([19, 18, 17, 16, 15])
  })

  it('excludes suspended cards from both streams', () => {
    const q = buildQueue({
      due: [due(1, T0), due(2, T0, { suspended: true, isLeech: true })],
      fresh: [freshCard(3), { ...freshCard(4), suspended: true }],
      newWordsPerDay: 10,
      maxReviewsPerDay: 10,
    })
    expect(q.map((c) => c.id).sort()).toEqual([1, 3])
  })

  it('spreads new cards through the session instead of front-loading them', () => {
    const q = buildQueue({
      due: many(20, (i) => due(100 + i, T0)),
      fresh: many(4, (i) => freshCard(i)),
      newWordsPerDay: 4,
      maxReviewsPerDay: 200,
    })
    const positions = q.flatMap((c, i) => (c.state === 'new' ? [i] : []))
    expect(positions).toHaveLength(4)
    // Not clustered at the front: the last new card is past the halfway mark.
    expect(positions.at(-1)!).toBeGreaterThan(q.length / 2)
    // Roughly evenly spaced — no two adjacent.
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]! - positions[i - 1]!).toBeGreaterThan(1)
    }
  })

  it('keeps the introduction order it was given', () => {
    const q = buildQueue({
      due: [],
      fresh: [freshCard(7), freshCard(3), freshCard(9)],
      newWordsPerDay: 3,
      maxReviewsPerDay: 0,
    })
    expect(q.map((c) => c.id)).toEqual([7, 3, 9])
  })

  it('handles either stream being empty', () => {
    const onlyNew = buildQueue({
      due: [],
      fresh: many(3, freshCard),
      newWordsPerDay: 10,
      maxReviewsPerDay: 10,
    })
    const onlyDue = buildQueue({
      due: many(3, (i) => due(i, T0)),
      fresh: [],
      newWordsPerDay: 10,
      maxReviewsPerDay: 10,
    })
    expect(onlyNew).toHaveLength(3)
    expect(onlyDue).toHaveLength(3)
    expect(buildQueue({ due: [], fresh: [], newWordsPerDay: 5, maxReviewsPerDay: 5 })).toEqual([])
  })
})

describe('dayStart', () => {
  const CUTOFF = 4

  it('treats 1am as still belonging to the previous day', () => {
    const at1am = Date.UTC(2026, 0, 2, 1)
    expect(dayStart(at1am, CUTOFF)).toBe(Date.UTC(2026, 0, 1, 4))
  })

  it('rolls over at the cutoff hour', () => {
    const at5am = Date.UTC(2026, 0, 2, 5)
    expect(dayStart(at5am, CUTOFF)).toBe(Date.UTC(2026, 0, 2, 4))
  })

  it('puts 1am and 5am on the same date in different study days', () => {
    const a = dayStart(Date.UTC(2026, 0, 2, 1), CUTOFF)
    const b = dayStart(Date.UTC(2026, 0, 2, 5), CUTOFF)
    expect(a).not.toBe(b)
    expect(b - a).toBe(DAY)
  })

  it('is stable across a whole study day', () => {
    const start = dayStart(Date.UTC(2026, 0, 2, 4), CUTOFF)
    for (const h of [4, 9, 15, 23]) {
      expect(dayStart(Date.UTC(2026, 0, 2, h), CUTOFF)).toBe(start)
    }
    expect(dayStart(Date.UTC(2026, 0, 3, 3), CUTOFF)).toBe(start)
  })
})
