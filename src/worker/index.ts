import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import * as t from '@/db/schema'
import {
  KNOWN_SEED_DAYS,
  OWNER_ID,
  SEED_SPREAD_MAX_DAYS,
  SEED_SPREAD_MIN_DAYS,
  SEED_SPREAD_PER_DAY,
  SHAKY_SEED_DAYS,
} from '@/config'
import {
  applySnapshot,
  buildQueue,
  previewIntervals,
  review,
  seedAsKnown,
  spreadSeedDays,
  type Rating,
  type SrsCard,
} from '@/lib/srs'
import { buildSample, buildStrata, gradeSample, type StratumKey } from '@/lib/calibration'
import { chunked, D1_PARAM_LIMIT, inChunks } from './chunk'
import { makeDb, srsCardUpdate, toSrsCard, type Env } from './db'
import {
  getSettings,
  loadQueueCandidates,
  loadStats,
  loadTodayCounts,
  loadWordContent,
} from './queries'

const app = new Hono<{ Bindings: Env }>()

/** Single user: no auth, no session. See plan, "No login in step 1". */
const api = app.basePath('/api')

const schedulerOpts = (s: { desiredRetention: number; fsrsParams: string | null }) => ({
  desiredRetention: s.desiredRetention,
  fsrsParams: s.fsrsParams ? (JSON.parse(s.fsrsParams) as number[]) : null,
})

/* ------------------------------- session ------------------------------- */

api.get('/session', async (c) => {
  const db = makeDb(c.env.DB)
  const now = Date.now()
  const settings = await getSettings(db)
  const today = await loadTodayCounts(db, now, settings.dayCutoffHour)

  const { due, fresh } = await loadQueueCandidates(
    db,
    now,
    Math.max(0, settings.maxReviewsPerDay - today.reviewsDoneToday),
    Math.max(0, settings.newWordsPerDay - today.newDoneToday),
  )

  const queue = buildQueue({
    due,
    fresh,
    newWordsPerDay: settings.newWordsPerDay,
    maxReviewsPerDay: settings.maxReviewsPerDay,
    newDoneToday: today.newDoneToday,
    reviewsDoneToday: today.reviewsDoneToday,
  })

  // The queue holds SrsCards; we need their word ids to hydrate content.
  const ids = queue.map((q) => q.id)
  const rows = await inChunks(ids, (chunk) =>
    db.select().from(t.cards).where(inArray(t.cards.id, chunk)),
  )
  const wordIdByCard = new Map(rows.map((r) => [r.id, r.wordId]))
  const content = await loadWordContent(
    db,
    [...new Set(rows.map((r) => r.wordId).filter((x): x is number => x !== null))],
  )

  const opts = schedulerOpts(settings)
  return c.json({
    settings: {
      newWordsPerDay: settings.newWordsPerDay,
      maxReviewsPerDay: settings.maxReviewsPerDay,
      dayCutoffHour: settings.dayCutoffHour,
      calibratedAt: settings.calibratedAt,
    },
    cards: queue.map((card) => ({
      card,
      // Sent with the card so the grade buttons show the real next interval
      // rather than an approximation.
      intervals: previewIntervals(card, now, opts),
      word: content.get(wordIdByCard.get(card.id) ?? -1) ?? null,
    })),
  })
})

/* ------------------------------- reviews ------------------------------- */

interface ReviewInput {
  cardId: number
  rating: Rating
  durationMs?: number
  typedAnswer?: string
}

api.post('/reviews', async (c) => {
  const db = makeDb(c.env.DB)
  const body = (await c.req.json()) as { reviews: ReviewInput[] }
  const items = body.reviews ?? []
  if (items.length === 0) return c.json({ applied: 0, leeches: [] })

  const settings = await getSettings(db)
  const opts = schedulerOpts(settings)
  const now = Date.now()

  const rows = await inChunks(
    items.map((i) => i.cardId),
    (chunk) =>
      db
        .select()
        .from(t.cards)
        .where(and(eq(t.cards.userId, OWNER_ID), inArray(t.cards.id, chunk))),
  )
  const byId = new Map(rows.map((r) => [r.id, r]))

  const statements = []
  const leeches: number[] = []

  for (const item of items) {
    const row = byId.get(item.cardId)
    if (!row) continue
    if (item.rating < 1 || item.rating > 4) continue

    const outcome = review(toSrsCard(row), item.rating, now, opts)
    if (outcome.becameLeech) leeches.push(row.id)

    statements.push(
      db.update(t.cards).set(srsCardUpdate(outcome.card, now)).where(eq(t.cards.id, row.id)),
      db.insert(t.reviewLog).values({
        cardId: row.id,
        userId: OWNER_ID,
        rating: item.rating,
        ...outcome.snapshot,
        source: 'review',
        durationMs: item.durationMs ?? null,
        typedAnswer: item.typedAnswer ?? null,
        reviewedAt: now,
        voided: false,
      }),
    )
  }

  // One transaction: a card's new schedule and its log entry must land
  // together or not at all, or the log can no longer explain the card.
  if (statements.length) {
    await db.batch(statements as [(typeof statements)[number], ...typeof statements])
  }
  return c.json({ applied: statements.length / 2, leeches })
})

api.post('/reviews/undo', async (c) => {
  const db = makeDb(c.env.DB)
  const { cardId } = (await c.req.json()) as { cardId: number }

  const logs = await db
    .select()
    .from(t.reviewLog)
    .where(and(eq(t.reviewLog.cardId, cardId), eq(t.reviewLog.voided, false)))
    .orderBy(desc(t.reviewLog.reviewedAt), desc(t.reviewLog.id))
    .limit(1)
  const log = logs[0]
  if (!log) return c.json({ undone: false, reason: 'nothing to undo' }, 404)

  const rows = await db.select().from(t.cards).where(eq(t.cards.id, cardId)).limit(1)
  const row = rows[0]
  if (!row) return c.json({ undone: false, reason: 'no such card' }, 404)

  const restored = applySnapshot(toSrsCard(row), {
    stateBefore: log.stateBefore as SrsCard['state'],
    dueBefore: log.dueBefore,
    stabilityBefore: log.stabilityBefore,
    difficultyBefore: log.difficultyBefore,
    elapsedDaysBefore: log.elapsedDaysBefore,
    scheduledDaysBefore: log.scheduledDaysBefore,
    repsBefore: log.repsBefore,
    lapsesBefore: log.lapsesBefore,
    lastReviewBefore: log.lastReviewBefore,
  })

  await db.update(t.cards).set(srsCardUpdate(restored, Date.now())).where(eq(t.cards.id, cardId))
  // The row is voided, never deleted — review_log is the one table that
  // cannot be reconstructed.
  await db.update(t.reviewLog).set({ voided: true }).where(eq(t.reviewLog.id, log.id))

  return c.json({ undone: true, card: restored })
})

/** The `k` key: mark a new card already known and schedule it well out. */
api.post('/cards/:id/know', async (c) => {
  const db = makeDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const rows = await db.select().from(t.cards).where(eq(t.cards.id, id)).limit(1)
  const row = rows[0]
  if (!row) return c.json({ ok: false, reason: 'no such card' }, 404)
  if (row.state !== 'new') {
    return c.json({ ok: false, reason: 'card is already in the schedule' }, 400)
  }

  const now = Date.now()
  const outcome = seedAsKnown(toSrsCard(row), now)
  await db.update(t.cards).set(srsCardUpdate(outcome.card, now)).where(eq(t.cards.id, id))
  await db.insert(t.reviewLog).values({
    cardId: id,
    userId: OWNER_ID,
    rating: 4,
    ...outcome.snapshot,
    source: 'know',
    durationMs: null,
    typedAnswer: null,
    reviewedAt: now,
    voided: false,
  })
  return c.json({ ok: true, card: outcome.card })
})

/* ----------------------------- calibration ----------------------------- */

api.get('/calibrate', async (c) => {
  const db = makeDb(c.env.DB)
  const words = await db
    .select({
      wordId: t.words.id,
      simplified: t.words.simplified,
      hskNew: t.words.hskNew,
      frequencyRank: t.words.frequencyRank,
    })
    .from(t.words)
    .where(isNotNull(t.words.hskNew))

  const strata = buildStrata(
    words.map((w) => ({ ...w, hskNew: w.hskNew as string })),
  )
  const sample = buildSample(strata)
  const content = await loadWordContent(db, sample.map((s) => s.wordId))

  return c.json({
    items: sample.map((s) => ({ ...s, word: content.get(s.wordId) ?? null })),
    strata: strata.map((s) => ({ key: s.key, level: s.level, band: s.band, size: s.wordIds.length })),
  })
})

api.post('/calibrate', async (c) => {
  const db = makeDb(c.env.DB)
  const body = (await c.req.json()) as {
    answers: { wordId: number; stratum: StratumKey; known: boolean }[]
  }

  const words = await db
    .select({
      wordId: t.words.id,
      simplified: t.words.simplified,
      hskNew: t.words.hskNew,
      frequencyRank: t.words.frequencyRank,
    })
    .from(t.words)
    .where(isNotNull(t.words.hskNew))

  const strata = buildStrata(words.map((w) => ({ ...w, hskNew: w.hskNew as string })))
  const verdicts = gradeSample(strata, body.answers ?? [])

  const toSeed = verdicts.filter((v) => v.action === 'seed-known').flatMap((v) => v.wordIds)
  const seeded = await seedWords(db, toSeed, KNOWN_SEED_DAYS)

  await db
    .update(t.settings)
    .set({ calibratedAt: Date.now() })
    .where(eq(t.settings.userId, OWNER_ID))

  return c.json({
    verdicts: verdicts.map(({ wordIds, ...rest }) => ({ ...rest, size: wordIds.length })),
    seeded,
    triage: verdicts.filter((v) => v.action === 'triage').map((v) => v.stratum),
  })
})

/** Three-state triage over the uncertain band. */
api.post('/calibrate/triage', async (c) => {
  const db = makeDb(c.env.DB)
  const body = (await c.req.json()) as {
    verdicts: { wordId: number; level: 'unknown' | 'shaky' | 'solid' }[]
  }
  const solid = body.verdicts.filter((v) => v.level === 'solid').map((v) => v.wordId)
  const shaky = body.verdicts.filter((v) => v.level === 'shaky').map((v) => v.wordId)

  const a = await seedWords(db, solid, KNOWN_SEED_DAYS)
  const b = await seedWords(db, shaky, SHAKY_SEED_DAYS)
  return c.json({ seeded: a + b, solid: a, shaky: b })
})

/**
 * Seed a set of words' new cards forward.
 *
 * Only `new` cards are touched — calibration must never overwrite a schedule
 * that has already been earned by real reviews.
 */
async function seedWords(
  db: ReturnType<typeof makeDb>,
  wordIds: number[],
  days: number,
): Promise<number> {
  if (wordIds.length === 0) return 0
  const now = Date.now()

  // Collect first, then place: the spread needs to know how many cards there
  // actually are before it can size the window.
  const rows: (typeof t.cards.$inferSelect)[] = []
  for (const chunk of chunked(wordIds)) {
    rows.push(
      ...(await db
        .select()
        .from(t.cards)
        .where(
          and(
            eq(t.cards.userId, OWNER_ID),
            eq(t.cards.state, 'new'),
            inArray(t.cards.wordId, chunk),
          ),
        )),
    )
  }
  if (rows.length === 0) return 0

  const offsets = spreadSeedDays(
    rows.length,
    days,
    SEED_SPREAD_PER_DAY,
    SEED_SPREAD_MIN_DAYS,
    SEED_SPREAD_MAX_DAYS,
  )

  for (const [i, batch] of chunked(rows).entries()) {
    const statements = batch.flatMap((row, j) => {
      const offset = offsets[i * D1_PARAM_LIMIT + j] ?? days
      const outcome = seedAsKnown(toSrsCard(row), now, offset)
      return [
        db.update(t.cards).set(srsCardUpdate(outcome.card, now)).where(eq(t.cards.id, row.id)),
        db.insert(t.reviewLog).values({
          cardId: row.id,
          userId: OWNER_ID,
          rating: 4,
          ...outcome.snapshot,
          source: 'seed',
          durationMs: null,
          typedAnswer: null,
          reviewedAt: now,
          voided: false,
        }),
      ]
    })
    await db.batch(statements as [(typeof statements)[number], ...typeof statements])
  }
  return rows.length
}

/* -------------------------- stats / settings --------------------------- */

api.get('/stats', async (c) => {
  const db = makeDb(c.env.DB)
  const settings = await getSettings(db)
  return c.json(await loadStats(db, Date.now(), settings.dayCutoffHour))
})

api.get('/settings', async (c) => c.json(await getSettings(makeDb(c.env.DB))))

api.put('/settings', async (c) => {
  const db = makeDb(c.env.DB)
  const body = (await c.req.json()) as Partial<t.SettingsRow>
  const allowed = {
    ...(body.newWordsPerDay !== undefined ? { newWordsPerDay: body.newWordsPerDay } : {}),
    ...(body.maxReviewsPerDay !== undefined ? { maxReviewsPerDay: body.maxReviewsPerDay } : {}),
    ...(body.desiredRetention !== undefined ? { desiredRetention: body.desiredRetention } : {}),
    ...(body.dayCutoffHour !== undefined ? { dayCutoffHour: body.dayCutoffHour } : {}),
    ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
  }
  if (Object.keys(allowed).length) {
    await db.update(t.settings).set(allowed).where(eq(t.settings.userId, OWNER_ID))
  }
  return c.json(await getSettings(db))
})

api.get('/decks', async (c) => {
  const db = makeDb(c.env.DB)
  const rows = await db.select().from(t.decks).where(eq(t.decks.userId, OWNER_ID))
  return c.json(rows.map((d) => ({ ...d, enabledCardTypes: JSON.parse(d.enabledCardTypes) })))
})

api.put('/decks/:id', async (c) => {
  const db = makeDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const body = (await c.req.json()) as { enabled?: boolean; enabledCardTypes?: string[] }
  await db
    .update(t.decks)
    .set({
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.enabledCardTypes
        ? { enabledCardTypes: JSON.stringify(body.enabledCardTypes) }
        : {}),
    })
    .where(and(eq(t.decks.id, id), eq(t.decks.userId, OWNER_ID)))
  return c.json({ ok: true })
})

/* -------------------------------- library ------------------------------- */

api.get('/library', async (c) => {
  const db = makeDb(c.env.DB)
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 500)
  const rows = await db
    .select({ card: t.cards, word: t.words })
    .from(t.cards)
    .innerJoin(t.words, eq(t.words.id, t.cards.wordId))
    .where(eq(t.cards.userId, OWNER_ID))
    .orderBy(asc(t.words.frequencyRank))
    .limit(limit)

  const content = await loadWordContent(db, rows.map((r) => r.word.id))
  return c.json(
    rows.map((r) => ({ card: toSrsCard(r.card), word: content.get(r.word.id) ?? null })),
  )
})

/* -------------------------------- export -------------------------------- */

/**
 * Whole-database dump.
 *
 * D1's Time Travel is 7 days on the free plan and produces no downloadable
 * file, so without this a year of review history has no backup at all.
 */
api.get('/export', async (c) => {
  const db = makeDb(c.env.DB)
  const [words, readings, examples, wordExamples, decks, deckWords, cards, reviewLog, settings] =
    await Promise.all([
      db.select().from(t.words),
      db.select().from(t.readings),
      db.select().from(t.examples),
      db.select().from(t.wordExamples),
      db.select().from(t.decks),
      db.select().from(t.deckWords),
      db.select().from(t.cards),
      db.select().from(t.reviewLog),
      db.select().from(t.settings),
    ])

  return c.json(
    {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      words,
      readings,
      examples,
      wordExamples,
      decks,
      deckWords,
      cards,
      reviewLog,
      settings,
    },
    200,
    {
      'content-disposition': `attachment; filename="chinese-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  )
})

api.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

// An unknown /api/* path is a real 404; anything else is a client route, so
// hand it to the asset handler, which serves index.html for the SPA. Without
// this, refreshing on /review or bookmarking /library returns 404.
api.all('*', (c) => c.json({ error: 'not found' }, 404))
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
