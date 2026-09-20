import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/* ------------------------------------------------------------------ *
 * Content library — shared, not per-user.
 * One `words` row per HSK entry; pronunciations live in `readings`.
 * ------------------------------------------------------------------ */

export const words = sqliteTable(
  'words',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    simplified: text('simplified').notNull(),
    hskNew: text('hsk_new'),
    hskOld: text('hsk_old'),
    frequencyRank: integer('frequency_rank'),
    radical: text('radical'),
    /** JSON string[] of part-of-speech codes. */
    pos: text('pos').notNull().default('[]'),
  },
  (t) => [
    uniqueIndex('words_simplified_unq').on(t.simplified),
    index('words_hsk_new_idx').on(t.hskNew),
    index('words_freq_idx').on(t.frequencyRank),
  ],
)

/**
 * A pronunciation of a word, with the meanings belonging to that pronunciation.
 * 405 of the 3,181 HSK 1-4 entries have more than one: 长 cháng/zhǎng, 还 hái/huán.
 */
export const readings = sqliteTable(
  'readings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    pinyin: text('pinyin').notNull(),
    pinyinNumeric: text('pinyin_numeric').notNull(),
    /** JSON string[]. */
    meanings: text('meanings').notNull(),
    /** The reading used for audio and for the single-line summary. */
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('readings_word_idx').on(t.wordId),
    // Lets the importer upsert a reading instead of duplicating it on re-run.
    uniqueIndex('readings_word_pinyin_unq').on(t.wordId, t.pinyin),
  ],
)

export const examples = sqliteTable(
  'examples',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    simplified: text('simplified').notNull(),
    pinyin: text('pinyin').notNull(),
    translation: text('translation').notNull(),
    source: text('source').notNull().default('duchinese'),
  },
  (t) => [uniqueIndex('examples_simplified_unq').on(t.simplified)],
)

export const wordExamples = sqliteTable(
  'word_examples',
  {
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    exampleId: integer('example_id')
      .notNull()
      .references(() => examples.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.exampleId] })],
)

/* ------------------------------------------------------------------ *
 * User data
 * ------------------------------------------------------------------ */

export const decks = sqliteTable(
  'decks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    /** JSON CardType[] — which card types this deck generates. */
    enabledCardTypes: text('enabled_card_types').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('decks_user_name_unq').on(t.userId, t.name)],
)

export const deckWords = sqliteTable(
  'deck_words',
  {
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    addedAt: integer('added_at').notNull(),
    source: text('source').notNull(),
    /** New-card order: HSK level ascending, then frequency rank ascending. */
    introductionRank: integer('introduction_rank').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.wordId] }),
    index('deck_words_rank_idx').on(t.deckId, t.introductionRank),
    check('deck_words_source_ck', sql`${t.source} IN ('hsk','duchinese','reader','manual')`),
  ],
)

/**
 * One card = one item tested one way, with its own FSRS schedule.
 *
 * The item is polymorphic: exactly one of wordId/sentenceId/patternId is set.
 * Only wordId is used in step 1; the other two are the seams the reader and the
 * topic-lesson curriculum hang off without a migration.
 */
export const cards = sqliteTable(
  'cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    cardType: text('card_type').notNull(),

    wordId: integer('word_id').references(() => words.id, { onDelete: 'cascade' }),
    sentenceId: integer('sentence_id'),
    patternId: integer('pattern_id'),

    // --- FSRS state ---
    state: text('state').notNull().default('new'),
    due: integer('due').notNull(),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    lastReview: integer('last_review'),

    suspended: integer('suspended', { mode: 'boolean' }).notNull().default(false),
    isLeech: integer('is_leech', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('cards_user_type_word_unq').on(t.userId, t.cardType, t.wordId),
    // The queue query. Partial, so suspended and leeched cards cost nothing.
    index('cards_due_idx').on(t.userId, t.due).where(sql`${t.suspended} = 0`),
    index('cards_deck_idx').on(t.deckId),
    check('cards_type_ck', sql`${t.cardType} IN ('recognition','typing','audio')`),
    check(
      'cards_state_ck',
      sql`${t.state} IN ('new','learning','review','relearning')`,
    ),
    check(
      'cards_one_item_ck',
      sql`(${t.wordId} IS NOT NULL) + (${t.sentenceId} IS NOT NULL) + (${t.patternId} IS NOT NULL) = 1`,
    ),
  ],
)

/**
 * Append-only. Every review ever taken, with the card's state *before* it.
 *
 * This is the one table that cannot be reconstructed after the fact: it is what
 * lets FSRS be retrained on real memory later, and what makes undo exact.
 * Rows are never deleted — undo sets `voided`.
 */
export const reviewLog = sqliteTable(
  'review_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    rating: integer('rating').notNull(),

    // Card state immediately before this review — what undo restores.
    stateBefore: text('state_before').notNull(),
    dueBefore: integer('due_before').notNull(),
    stabilityBefore: real('stability_before').notNull(),
    difficultyBefore: real('difficulty_before').notNull(),
    elapsedDaysBefore: integer('elapsed_days_before').notNull(),
    scheduledDaysBefore: integer('scheduled_days_before').notNull(),
    repsBefore: integer('reps_before').notNull(),
    lapsesBefore: integer('lapses_before').notNull(),
    lastReviewBefore: integer('last_review_before'),

    durationMs: integer('duration_ms'),
    typedAnswer: text('typed_answer'),
    reviewedAt: integer('reviewed_at').notNull(),
    voided: integer('voided', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('review_log_card_idx').on(t.cardId, t.reviewedAt),
    index('review_log_user_idx').on(t.userId, t.reviewedAt),
    check('review_log_rating_ck', sql`${t.rating} BETWEEN 1 AND 4`),
  ],
)

export const settings = sqliteTable('settings', {
  userId: text('user_id').primaryKey(),
  newWordsPerDay: integer('new_words_per_day').notNull(),
  maxReviewsPerDay: integer('max_reviews_per_day').notNull(),
  desiredRetention: real('desired_retention').notNull(),
  /** JSON number[] — FSRS weights, once retrained on review_log. */
  fsrsParams: text('fsrs_params'),
  timezone: text('timezone').notNull(),
  dayCutoffHour: integer('day_cutoff_hour').notNull(),
  /** Set once the placement test has been taken. */
  calibratedAt: integer('calibrated_at'),
})

export type WordRow = typeof words.$inferSelect
export type ReadingRow = typeof readings.$inferSelect
export type ExampleRow = typeof examples.$inferSelect
export type DeckRow = typeof decks.$inferSelect
export type CardRow = typeof cards.$inferSelect
export type ReviewLogRow = typeof reviewLog.$inferSelect
export type SettingsRow = typeof settings.$inferSelect
