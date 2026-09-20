import { describe, expect, it } from 'vitest'
import { bucketCounts, bucketOf, formatInterval, newCard, type SrsCard } from '@/lib/srs'

const T0 = Date.UTC(2026, 0, 1)
const card = (over: Partial<SrsCard>): SrsCard => ({
  ...newCard(1, 'recognition', T0),
  ...over,
})

describe('bucketOf', () => {
  it('calls an unseen card New', () => {
    expect(bucketOf(card({ state: 'new' }))).toBe('new')
  })

  it('calls learning and relearning Learning', () => {
    expect(bucketOf(card({ state: 'learning', scheduledDays: 0 }))).toBe('learning')
    expect(bucketOf(card({ state: 'relearning', scheduledDays: 40 }))).toBe('learning')
  })

  it("uses Anki's 21-day boundary between Young and Mature", () => {
    expect(bucketOf(card({ state: 'review', scheduledDays: 20 }))).toBe('young')
    expect(bucketOf(card({ state: 'review', scheduledDays: 21 }))).toBe('mature')
    expect(bucketOf(card({ state: 'review', scheduledDays: 22 }))).toBe('mature')
  })
})

describe('bucketCounts', () => {
  it('counts each bucket, and excludes suspended cards from them', () => {
    const counts = bucketCounts([
      card({ state: 'new' }),
      card({ state: 'new' }),
      card({ state: 'learning' }),
      card({ state: 'review', scheduledDays: 5 }),
      card({ state: 'review', scheduledDays: 90 }),
      card({ state: 'review', scheduledDays: 5, suspended: true, isLeech: true }),
    ])
    expect(counts).toEqual({
      new: 2,
      learning: 1,
      young: 1,
      mature: 1,
      suspended: 1,
      leech: 1,
    })
  })
})

describe('formatInterval', () => {
  it('reads the way a grade button should', () => {
    expect(formatInterval(10 * 60_000)).toBe('10m')
    expect(formatInterval(2 * 3_600_000)).toBe('2h')
    expect(formatInterval(4 * 86_400_000)).toBe('4d')
    expect(formatInterval(60 * 86_400_000)).toBe('2.0mo')
    expect(formatInterval(400 * 86_400_000)).toBe('1.1y')
  })
})
