import { and, asc, eq, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm'
import * as t from '@/db/schema'
import { OWNER_ID } from '@/config'
import { bucketCounts, dayStart, type SrsCard } from '@/lib/srs'
import { inChunks } from './chunk'
import { toSrsCard, type Db } from './db'

export interface WordContent {
  wordId: number
  simplified: string
  hskNew: string | null
  readings: { pinyin: string; meanings: string[]; isPrimary: boolean }[]
  example: { simplified: string; pinyin: string; translation: string } | null
  /** The Eselsbrücke, revealed on demand during review. */
  mnemonic: string | null
}

/**
 * Hydrate words for a set of cards.
 *
 * Three batched queries rather than one per card — the session endpoint is
 * fetched once per session and must not fan out into hundreds of round trips.
 */
export async function loadWordContent(db: Db, wordIds: number[]): Promise<Map<number, WordContent>> {
  const out = new Map<number, WordContent>()
  if (wordIds.length === 0) return out

  const [wordRows, readingRows, exampleRows, mnemonicRows] = await Promise.all([
    inChunks(wordIds, (ids) => db.select().from(t.words).where(inArray(t.words.id, ids))),
    inChunks(wordIds, (ids) =>
      db
        .select()
        .from(t.readings)
        .where(inArray(t.readings.wordId, ids))
        .orderBy(asc(t.readings.wordId), asc(t.readings.sortOrder)),
    ),
    inChunks(wordIds, (ids) =>
      db
        .select({
          wordId: t.wordExamples.wordId,
          simplified: t.examples.simplified,
          pinyin: t.examples.pinyin,
          translation: t.examples.translation,
        })
        .from(t.wordExamples)
        .innerJoin(t.examples, eq(t.examples.id, t.wordExamples.exampleId))
        .where(inArray(t.wordExamples.wordId, ids)),
    ),
    inChunks(wordIds, (ids) =>
      db
        .select({ wordId: t.mnemonics.wordId, text: t.mnemonics.text })
        .from(t.mnemonics)
        .where(and(eq(t.mnemonics.userId, OWNER_ID), inArray(t.mnemonics.wordId, ids))),
    ),
  ])

  for (const w of wordRows) {
    out.set(w.id, {
      wordId: w.id,
      simplified: w.simplified,
      hskNew: w.hskNew,
      readings: [],
      example: null,
      mnemonic: null,
    })
  }
  for (const m of mnemonicRows) {
    const entry = out.get(m.wordId)
    if (entry) entry.mnemonic = m.text
  }
  for (const r of readingRows) {
    out.get(r.wordId)?.readings.push({
      pinyin: r.pinyin,
      meanings: JSON.parse(r.meanings) as string[],
      isPrimary: r.isPrimary,
    })
  }
  // A word can have several sentences; one is enough on a card.
  for (const e of exampleRows) {
    const entry = out.get(e.wordId)
    if (entry && !entry.example) {
      entry.example = { simplified: e.simplified, pinyin: e.pinyin, translation: e.translation }
    }
  }
  return out
}

export async function getSettings(db: Db) {
  const rows = await db.select().from(t.settings).where(eq(t.settings.userId, OWNER_ID)).limit(1)
  const row = rows[0]
  if (!row) throw new Error('No settings row. Run `npm run import` first.')
  return row
}

/** Cards due now, and unseen cards in introduction order. */
export async function loadQueueCandidates(db: Db, now: number, reviewLimit: number, newLimit: number) {
  const enabledDecks = db
    .select({ id: t.decks.id })
    .from(t.decks)
    .where(and(eq(t.decks.userId, OWNER_ID), eq(t.decks.enabled, true)))

  const [dueRows, freshRows] = await Promise.all([
    db
      .select()
      .from(t.cards)
      .where(
        and(
          eq(t.cards.userId, OWNER_ID),
          eq(t.cards.suspended, false),
          ne(t.cards.state, 'new'),
          lte(t.cards.due, now),
          inArray(t.cards.deckId, enabledDecks),
        ),
      )
      .orderBy(asc(t.cards.due))
      .limit(reviewLimit),
    db
      .select({ card: t.cards })
      .from(t.cards)
      .innerJoin(
        t.deckWords,
        and(eq(t.deckWords.deckId, t.cards.deckId), eq(t.deckWords.wordId, t.cards.wordId)),
      )
      .where(
        and(
          eq(t.cards.userId, OWNER_ID),
          eq(t.cards.suspended, false),
          eq(t.cards.state, 'new'),
          inArray(t.cards.deckId, enabledDecks),
        ),
      )
      .orderBy(asc(t.deckWords.introductionRank))
      .limit(newLimit),
  ])

  return {
    due: dueRows.map(toSrsCard),
    fresh: freshRows.map((r) => toSrsCard(r.card)),
  }
}

/** How much has already been done in the current study day. */
export async function loadTodayCounts(db: Db, now: number, cutoffHour: number) {
  const start = dayStart(now, cutoffHour)
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      fresh: sql<number>`SUM(CASE WHEN ${t.reviewLog.stateBefore} = 'new' THEN 1 ELSE 0 END)`,
    })
    .from(t.reviewLog)
    .where(
      and(
        eq(t.reviewLog.userId, OWNER_ID),
        eq(t.reviewLog.voided, false),
        // Calibration seeds and "already know" are not study.
        eq(t.reviewLog.source, 'review'),
        gte(t.reviewLog.reviewedAt, start),
      ),
    )
  const row = rows[0]
  const newDoneToday = Number(row?.fresh ?? 0)
  return {
    dayStart: start,
    newDoneToday,
    // New cards are graded too; don't charge them against both budgets.
    reviewsDoneToday: Math.max(0, Number(row?.total ?? 0) - newDoneToday),
  }
}

export async function loadStats(db: Db, now: number, cutoffHour: number) {
  const rows = await db
    .select()
    .from(t.cards)
    .where(and(eq(t.cards.userId, OWNER_ID), isNotNull(t.cards.wordId)))
  const cards: SrsCard[] = rows.map(toSrsCard)
  const counts = bucketCounts(cards)
  const today = await loadTodayCounts(db, now, cutoffHour)

  const dueNow = cards.filter((c) => !c.suspended && c.state !== 'new' && c.due <= now).length

  // Seven-day forecast of what falls due.
  const DAY = 86_400_000
  const forecast: { day: number; count: number }[] = []
  for (let d = 0; d < 7; d++) {
    const from = today.dayStart + d * DAY
    const to = from + DAY
    forecast.push({
      day: d,
      count: cards.filter((c) => !c.suspended && c.due >= from && c.due < to && c.state !== 'new')
        .length,
    })
  }

  return { buckets: counts, dueNow, total: cards.length, forecast, ...today }
}
