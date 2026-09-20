import type { SrsCard } from './types'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

/**
 * Start of the study day containing `now`.
 *
 * The boundary is `cutoffHour` local time, not UTC midnight, so a session at
 * 1am still counts as the previous day rather than silently burning tomorrow's
 * new-card allowance.
 */
export function dayStart(now: number, cutoffHour: number, tzOffsetMinutes = 0): number {
  const local = now - tzOffsetMinutes * 60_000
  const midnight = Math.floor(local / DAY_MS) * DAY_MS
  const cutoff = midnight + cutoffHour * HOUR_MS
  const start = local >= cutoff ? cutoff : cutoff - DAY_MS
  return start + tzOffsetMinutes * 60_000
}

export interface QueueInput {
  /** Cards already in learning/review whose due time has passed. */
  due: SrsCard[]
  /** Unseen cards, already ordered by introductionRank. */
  fresh: SrsCard[]
  newWordsPerDay: number
  maxReviewsPerDay: number
  /** New cards already introduced today, and reviews already done today. */
  newDoneToday?: number
  reviewsDoneToday?: number
}

/**
 * Build a session queue.
 *
 * New cards are spread through the session rather than front-loaded — a block
 * of twenty unknown words at the start is the fastest way to abandon a session.
 */
export function buildQueue(input: QueueInput): SrsCard[] {
  const {
    due,
    fresh,
    newWordsPerDay,
    maxReviewsPerDay,
    newDoneToday = 0,
    reviewsDoneToday = 0,
  } = input

  const newBudget = Math.max(0, newWordsPerDay - newDoneToday)
  const reviewBudget = Math.max(0, maxReviewsPerDay - reviewsDoneToday)

  const usable = (c: SrsCard) => !c.suspended
  const reviews = due.filter(usable).sort((a, b) => a.due - b.due).slice(0, reviewBudget)
  const news = fresh.filter(usable).slice(0, newBudget)

  if (news.length === 0) return reviews
  if (reviews.length === 0) return news

  // Interleave: place new cards at even spacing through the review stream.
  const out: SrsCard[] = []
  const gap = reviews.length / news.length
  let nextNewAt = gap
  let n = 0
  for (let i = 0; i < reviews.length; i++) {
    out.push(reviews[i]!)
    while (n < news.length && i + 1 >= nextNewAt) {
      out.push(news[n]!)
      n += 1
      nextNewAt += gap
    }
  }
  while (n < news.length) out.push(news[n++]!)
  return out
}
