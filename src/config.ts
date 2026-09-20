/** Single-user app: every row is owned by this constant. See plan, "No login in step 1". */
export const OWNER_ID = 'owner'

/**
 * Which HSK 3.0 bands make up the study library.
 * Widening the curriculum is this line plus a re-run of `npm run import` —
 * existing scheduling state is untouched.
 */
export const INCLUDED_HSK_LEVELS = ['n1', 'n2', 'n3', 'n4'] as const

export const DECK_HSK = 'HSK 3.0 (1-4)'
export const DECK_EXTRAS = 'Du Chinese extras'

export const CARD_TYPES = ['recognition', 'typing', 'audio'] as const
export type CardType = (typeof CARD_TYPES)[number]

/**
 * Recognition only by default. Audio is switched on once the TTS check at
 * /tts-check confirms a usable Mandarin voice; typing is best enabled for a
 * subset rather than all 3,181 words. See plan, "Scale and daily load".
 */
export const DEFAULT_CARD_TYPES: CardType[] = ['recognition']

export const DEFAULTS = {
  newWordsPerDay: 10,
  maxReviewsPerDay: 200,
  desiredRetention: 0.9,
  dayCutoffHour: 4,
  timezone: 'Europe/Berlin',
} as const

/** Anki's default: this many lapses tags the card a leech and suspends it. */
export const LEECH_THRESHOLD = 8

/** Interval in days given to a card marked "I already know this". */
export const KNOWN_SEED_DAYS = 21
/** Interval for the middle "shaky" state in calibration triage. */
export const SHAKY_SEED_DAYS = 3

/**
 * Bulk seeding spreads across a window rather than stacking on one date.
 *
 * The placement test seeds ~880 cards at once. Giving them all the same due
 * date buries a single day three weeks out and starves new words while the
 * backlog clears. The window is sized to hold roughly this many of them
 * falling due per day.
 */
export const SEED_SPREAD_PER_DAY = 25
export const SEED_SPREAD_MIN_DAYS = 14
export const SEED_SPREAD_MAX_DAYS = 42

/** Anki's thresholds, reused so the buckets mean what people expect. */
export const MATURE_INTERVAL_DAYS = 21
