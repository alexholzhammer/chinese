import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from '@/db/schema'
import type { CardType } from '@/config'
import type { SrsCard, SrsState } from '@/lib/srs'

export type Db = DrizzleD1Database<typeof schema>
export const makeDb = (d1: D1Database): Db => drizzle(d1, { schema })

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
}

export function toSrsCard(row: schema.CardRow): SrsCard {
  return {
    id: row.id,
    cardType: row.cardType as CardType,
    state: row.state as SrsState,
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    lastReview: row.lastReview,
    suspended: row.suspended,
    isLeech: row.isLeech,
  }
}

/** The mutable half of a card row, for an UPDATE. */
export function srsCardUpdate(card: SrsCard, now: number) {
  return {
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.lastReview,
    suspended: card.suspended,
    isLeech: card.isLeech,
    updatedAt: now,
  }
}
