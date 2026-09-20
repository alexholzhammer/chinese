import {
  createEmptyCard,
  fsrs,
  Rating as FsrsRating,
  State as FsrsState,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
} from 'ts-fsrs'
import { KNOWN_SEED_DAYS, LEECH_THRESHOLD } from '@/config'
import type {
  Rating,
  ReviewOutcome,
  ReviewSnapshot,
  SchedulerOptions,
  SrsCard,
  SrsState,
} from './types'

const DAY_MS = 86_400_000

const STATE_TO_FSRS: Record<SrsState, FsrsState> = {
  new: FsrsState.New,
  learning: FsrsState.Learning,
  review: FsrsState.Review,
  relearning: FsrsState.Relearning,
}

const FSRS_TO_STATE: Record<FsrsState, SrsState> = {
  [FsrsState.New]: 'new',
  [FsrsState.Learning]: 'learning',
  [FsrsState.Review]: 'review',
  [FsrsState.Relearning]: 'relearning',
}

export function makeScheduler(opts: SchedulerOptions = {}): FSRS {
  return fsrs({
    request_retention: opts.desiredRetention ?? 0.9,
    ...(opts.fsrsParams?.length ? { w: opts.fsrsParams } : {}),
    // Fuzz would make intervals non-deterministic, which makes the
    // grade-button labels lie and the tests flaky.
    enable_fuzz: false,
  })
}

function toFsrs(card: SrsCard): FsrsCard {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_FSRS[card.state],
    ...(card.lastReview !== null ? { last_review: new Date(card.lastReview) } : {}),
  }
}

function fromFsrs(base: SrsCard, f: FsrsCard): SrsCard {
  return {
    ...base,
    state: FSRS_TO_STATE[f.state],
    due: f.due.getTime(),
    stability: f.stability,
    difficulty: f.difficulty,
    elapsedDays: f.elapsed_days,
    scheduledDays: f.scheduled_days,
    reps: f.reps,
    lapses: f.lapses,
    lastReview: f.last_review ? f.last_review.getTime() : null,
  }
}

export function snapshotOf(card: SrsCard): ReviewSnapshot {
  return {
    stateBefore: card.state,
    dueBefore: card.due,
    stabilityBefore: card.stability,
    difficultyBefore: card.difficulty,
    elapsedDaysBefore: card.elapsedDays,
    scheduledDaysBefore: card.scheduledDays,
    repsBefore: card.reps,
    lapsesBefore: card.lapses,
    lastReviewBefore: card.lastReview,
  }
}

/**
 * Grade a card. Pure: `now` is always injected, never read from the clock, so
 * every scheduling decision is reproducible in a test.
 */
export function review(
  card: SrsCard,
  rating: Rating,
  now: number,
  opts: SchedulerOptions = {},
): ReviewOutcome {
  const snapshot = snapshotOf(card)
  const scheduler = makeScheduler(opts)
  const { card: next } = scheduler.next(toFsrs(card), new Date(now), rating as Grade)

  const updated = fromFsrs(card, next)
  // A card that keeps being forgotten will otherwise dominate the queue
  // forever. Anki's rule: at LEECH_THRESHOLD lapses, tag it and get it out.
  const becameLeech = !card.isLeech && updated.lapses >= LEECH_THRESHOLD

  return {
    card: becameLeech ? { ...updated, isLeech: true, suspended: true } : updated,
    snapshot,
    becameLeech,
  }
}

/** Restore a card to the state captured before a review. Used by undo. */
export function applySnapshot(card: SrsCard, snapshot: ReviewSnapshot): SrsCard {
  return {
    ...card,
    state: snapshot.stateBefore,
    due: snapshot.dueBefore,
    stability: snapshot.stabilityBefore,
    difficulty: snapshot.difficultyBefore,
    elapsedDays: snapshot.elapsedDaysBefore,
    scheduledDays: snapshot.scheduledDaysBefore,
    reps: snapshot.repsBefore,
    lapses: snapshot.lapsesBefore,
    lastReview: snapshot.lastReviewBefore,
    // Undoing the review that caused a leech un-leeches the card.
    isLeech: snapshot.lapsesBefore >= LEECH_THRESHOLD,
    suspended: card.suspended && snapshot.lapsesBefore >= LEECH_THRESHOLD,
  }
}

/** The interval each grade would produce, for labelling the grade buttons. */
export function previewIntervals(
  card: SrsCard,
  now: number,
  opts: SchedulerOptions = {},
): Record<Rating, number> {
  const scheduler = makeScheduler(opts)
  const preview = scheduler.repeat(toFsrs(card), new Date(now))
  const at = (r: Rating) => preview[r as unknown as Grade].card.due.getTime() - now
  return { 1: at(1), 2: at(2), 3: at(3), 4: at(4) }
}

/**
 * Mark a card as already known without reviewing it.
 *
 * Deliberately *not* a skip: an unreviewed "known" word decays silently and
 * you would never find out. It is scheduled far enough out to stay out of the
 * way, and confirms itself when it comes round.
 */
export function seedAsKnown(
  card: SrsCard,
  now: number,
  days: number = KNOWN_SEED_DAYS,
): ReviewOutcome {
  const snapshot = snapshotOf(card)
  const empty = createEmptyCard(new Date(now))
  return {
    card: {
      ...card,
      state: 'review',
      due: now + days * DAY_MS,
      stability: days,
      difficulty: empty.difficulty || 5,
      elapsedDays: 0,
      scheduledDays: days,
      reps: card.reps + 1,
      lapses: card.lapses,
      lastReview: now,
    },
    snapshot,
    becameLeech: false,
  }
}

/** A brand-new, never-seen card for a given item. */
export function newCard(id: number, cardType: SrsCard['cardType'], now: number): SrsCard {
  const empty = createEmptyCard(new Date(now))
  return {
    id,
    cardType,
    state: 'new',
    due: now,
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    suspended: false,
    isLeech: false,
  }
}

export { FsrsRating }
