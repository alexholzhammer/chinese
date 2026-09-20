import type { CardType } from '@/config'

export type SrsState = 'new' | 'learning' | 'review' | 'relearning'

/** Again / Hard / Good / Easy — the four grades, matching FSRS. */
export type Rating = 1 | 2 | 3 | 4
export const RATINGS: Rating[] = [1, 2, 3, 4]
export const RATING_LABELS: Record<Rating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
}

export type Bucket = 'new' | 'learning' | 'young' | 'mature'

/**
 * The scheduling state of one card, decoupled from both the Drizzle row and
 * from ts-fsrs's own shape. Times are unix ms.
 */
export interface SrsCard {
  id: number
  cardType: CardType
  state: SrsState
  due: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  lastReview: number | null
  suspended: boolean
  isLeech: boolean
}

/** The card state before a review — everything undo needs to restore it. */
export interface ReviewSnapshot {
  stateBefore: SrsState
  dueBefore: number
  stabilityBefore: number
  difficultyBefore: number
  elapsedDaysBefore: number
  scheduledDaysBefore: number
  repsBefore: number
  lapsesBefore: number
  lastReviewBefore: number | null
}

export interface ReviewOutcome {
  card: SrsCard
  snapshot: ReviewSnapshot
  /** True when this review pushed the card over the leech threshold. */
  becameLeech: boolean
}

export interface SchedulerOptions {
  desiredRetention?: number
  fsrsParams?: number[] | null
}
