import { MATURE_INTERVAL_DAYS } from '@/config'
import type { Bucket, SrsCard } from './types'

const DAY_MS = 86_400_000

/**
 * Which bucket a card sits in.
 *
 * FSRS schedules an exact due date; the buckets are a *view* over the interval,
 * not the mechanism. Thresholds are Anki's, so they mean what you'd expect:
 * Young is under 21 days, Mature is 21 days or more.
 *
 * The topic-lesson curriculum (phase 4) gates on this and nothing else.
 */
export function bucketOf(card: SrsCard): Bucket {
  if (card.state === 'new') return 'new'
  if (card.state === 'learning' || card.state === 'relearning') return 'learning'
  return card.scheduledDays >= MATURE_INTERVAL_DAYS ? 'mature' : 'young'
}

export type BucketCounts = Record<Bucket, number> & { suspended: number; leech: number }

export function bucketCounts(cards: SrsCard[]): BucketCounts {
  const counts: BucketCounts = {
    new: 0,
    learning: 0,
    young: 0,
    mature: 0,
    suspended: 0,
    leech: 0,
  }
  for (const card of cards) {
    if (card.isLeech) counts.leech += 1
    if (card.suspended) {
      counts.suspended += 1
      continue
    }
    counts[bucketOf(card)] += 1
  }
  return counts
}

/** Human-readable interval, for grade-button labels: 10m, 4d, 2.1mo. */
export function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < DAY_MS) return `${Math.round(ms / 3_600_000)}h`
  const days = ms / DAY_MS
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${(days / 30.44).toFixed(1)}mo`
  return `${(days / 365.25).toFixed(1)}y`
}
