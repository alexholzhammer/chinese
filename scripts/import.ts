/**
 * Load the HSK library and the Du Chinese export into D1.
 *
 * Idempotent: re-running adds new words and refreshes content, and never
 * touches scheduling state on a card that already exists. Widening
 * INCLUDED_HSK_LEVELS and re-running is the supported way to extend the
 * curriculum.
 *
 *   npm run import -- --local     write to the local D1
 *   npm run import -- --remote    write to the deployed D1
 *   npm run import -- --dry-run   print the summary, write nothing
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DECK_EXTRAS,
  DECK_HSK,
  DEFAULT_CARD_TYPES,
  DEFAULTS,
  INCLUDED_HSK_LEVELS,
  OWNER_ID,
} from '../src/config.ts'
import {
  hskToWords,
  introductionOrder,
  parseDuChinese,
  type HskEntry,
  type WordSeed,
} from '../src/lib/import/transform.ts'

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const DB_NAME = 'chinese-db'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const remote = args.has('--remote')

const q = (v: string) => `'${v.replace(/'/g, "''")}'`
const qn = (v: number | null) => (v === null ? 'NULL' : String(v))

/** Applied per wrangler invocation. Small enough to stay well clear of
 *  whatever limit a single huge file runs into, big enough to stay quick. */
const STATEMENTS_PER_BATCH = 1500

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function main() {
  const hsk: HskEntry[] = JSON.parse(readFileSync(root('data/hsk/hsk-complete.min.json'), 'utf8'))
  const csv = readFileSync(root('data/vocab/duchinese-2026-09-19.csv'), 'utf8')

  const hskWords = hskToWords(hsk)
  const { examples, extras } = parseDuChinese(csv, hskWords)
  const order = introductionOrder(hskWords)
  const now = Date.now()

  const sql: string[] = ['PRAGMA defer_foreign_keys = true;']

  // --- settings & decks -------------------------------------------------
  sql.push(
    `INSERT INTO settings (user_id, new_words_per_day, max_reviews_per_day, desired_retention, timezone, day_cutoff_hour)
     VALUES (${q(OWNER_ID)}, ${DEFAULTS.newWordsPerDay}, ${DEFAULTS.maxReviewsPerDay}, ${DEFAULTS.desiredRetention}, ${q(DEFAULTS.timezone)}, ${DEFAULTS.dayCutoffHour})
     ON CONFLICT(user_id) DO NOTHING;`,
  )
  const types = q(JSON.stringify(DEFAULT_CARD_TYPES))
  for (const name of [DECK_HSK, DECK_EXTRAS]) {
    sql.push(
      `INSERT INTO decks (user_id, name, enabled_card_types, enabled) VALUES (${q(OWNER_ID)}, ${q(name)}, ${types}, 1)
       ON CONFLICT(user_id, name) DO NOTHING;`,
    )
  }

  // --- words & readings -------------------------------------------------
  const emitWord = (w: WordSeed) => {
    sql.push(
      `INSERT INTO words (simplified, hsk_new, hsk_old, frequency_rank, radical, pos)
       VALUES (${q(w.simplified)}, ${w.hskNew ? q(w.hskNew) : 'NULL'}, ${w.hskOld ? q(w.hskOld) : 'NULL'}, ${qn(w.frequencyRank)}, ${w.radical ? q(w.radical) : 'NULL'}, ${q(JSON.stringify(w.pos))})
       ON CONFLICT(simplified) DO UPDATE SET
         hsk_new = excluded.hsk_new, hsk_old = excluded.hsk_old,
         frequency_rank = excluded.frequency_rank, radical = excluded.radical, pos = excluded.pos;`,
    )
    for (const r of w.readings) {
      sql.push(
        `INSERT INTO readings (word_id, sort_order, pinyin, pinyin_numeric, meanings, is_primary)
         SELECT id, ${r.sortOrder}, ${q(r.pinyin)}, ${q(r.pinyinNumeric)}, ${q(JSON.stringify(r.meanings))}, ${r.isPrimary ? 1 : 0}
         FROM words WHERE simplified = ${q(w.simplified)}
         ON CONFLICT(word_id, pinyin) DO UPDATE SET
           sort_order = excluded.sort_order, pinyin_numeric = excluded.pinyin_numeric,
           meanings = excluded.meanings, is_primary = excluded.is_primary;`,
      )
    }
  }
  hskWords.forEach(emitWord)
  extras.forEach(emitWord)

  // --- example sentences ------------------------------------------------
  // The HSK dataset has none at all; these are the only ones in the system.
  for (const e of examples) {
    sql.push(
      `INSERT INTO examples (simplified, pinyin, translation, source)
       VALUES (${q(e.simplified)}, ${q(e.pinyin)}, ${q(e.translation)}, 'duchinese')
       ON CONFLICT(simplified) DO UPDATE SET pinyin = excluded.pinyin, translation = excluded.translation;`,
    )
    for (const w of e.words) {
      sql.push(
        `INSERT OR IGNORE INTO word_examples (word_id, example_id)
         SELECT w.id, x.id FROM words w, examples x
         WHERE w.simplified = ${q(w)} AND x.simplified = ${q(e.simplified)};`,
      )
    }
  }

  // --- deck membership --------------------------------------------------
  const extrasOffset = hskWords.length
  const members: { word: string; deck: string; source: string; rank: number }[] = [
    ...hskWords.map((w) => ({
      word: w.simplified,
      deck: DECK_HSK,
      source: 'hsk',
      rank: order.get(w.simplified)!,
    })),
    ...extras.map((w, i) => ({
      word: w.simplified,
      deck: DECK_EXTRAS,
      source: 'duchinese',
      rank: extrasOffset + i,
    })),
  ]
  for (const m of members) {
    sql.push(
      `INSERT INTO deck_words (deck_id, word_id, added_at, source, introduction_rank)
       SELECT d.id, w.id, ${now}, ${q(m.source)}, ${m.rank} FROM decks d, words w
       WHERE d.user_id = ${q(OWNER_ID)} AND d.name = ${q(m.deck)} AND w.simplified = ${q(m.word)}
       ON CONFLICT(deck_id, word_id) DO UPDATE SET introduction_rank = excluded.introduction_rank;`,
    )
  }

  // --- cards ------------------------------------------------------------
  // Every card starts `new`. Nothing is seeded as known here: the Du Chinese
  // export records exposure, not retention, so inferring knowledge from it
  // would be wrong in both directions. Seeding is /calibrate's job.
  //
  // INSERT OR IGNORE is load-bearing — a re-run must never reset a schedule.
  for (const m of members) {
    for (const type of DEFAULT_CARD_TYPES) {
      sql.push(
        `INSERT OR IGNORE INTO cards (user_id, deck_id, card_type, word_id, state, due, updated_at)
         SELECT ${q(OWNER_ID)}, d.id, ${q(type)}, w.id, 'new', ${now}, ${now} FROM decks d, words w
         WHERE d.user_id = ${q(OWNER_ID)} AND d.name = ${q(m.deck)} AND w.simplified = ${q(m.word)};`,
      )
    }
  }

  // --- report -----------------------------------------------------------
  const byLevel: Record<string, number> = {}
  for (const w of hskWords) byLevel[w.hskNew!] = (byLevel[w.hskNew!] ?? 0) + 1
  const attached = new Set<string>()
  const hskSet = new Set(hskWords.map((w) => w.simplified))
  for (const e of examples) for (const w of e.words) if (hskSet.has(w)) attached.add(w)

  console.log(`HSK bands            ${INCLUDED_HSK_LEVELS.join(', ')}`)
  for (const [lvl, n] of Object.entries(byLevel).sort()) console.log(`  ${lvl}                 ${n}`)
  console.log(`HSK words            ${hskWords.length}`)
  console.log(`readings             ${hskWords.reduce((n, w) => n + w.readings.length, 0)}`)
  console.log(`example sentences    ${examples.length}, attached to ${attached.size} HSK words`)
  console.log(`extras deck          ${extras.length} words outside the bands`)
  console.log(`card types           ${DEFAULT_CARD_TYPES.join(', ')}`)
  console.log(`cards                ${members.length * DEFAULT_CARD_TYPES.length}`)
  console.log(`seeded as known      0  (that is /calibrate's job)`)
  console.log(`SQL statements       ${sql.length}`)

  if (dryRun) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  const dir = mkdtempSync(join(tmpdir(), 'chinese-import-'))
  console.log(`\nApplying to ${remote ? 'remote' : 'local'} D1 ...`)

  // One 15,000-statement file is fragile — wrangler 3 crashed workerd outright
  // on it, and a single failure anywhere gives no clue where. Apply in chunks
  // so progress is visible and a failure names the batch it happened in.
  const batches = chunk(sql, STATEMENTS_PER_BATCH)
  for (const [i, batch] of batches.entries()) {
    const file = join(dir, `import-${String(i).padStart(3, '0')}.sql`)
    writeFileSync(file, batch.join('\n'))
    process.stdout.write(`  batch ${i + 1}/${batches.length} ... `)
    try {
      execFileSync(
        'npx',
        [
          'wrangler',
          'd1',
          'execute',
          DB_NAME,
          remote ? '--remote' : '--local',
          '--file',
          file,
          '--yes',
        ],
        // stdout is discarded outright, not piped: wrangler echoes a JSON
        // result object per statement, and piping that into execFileSync's
        // 1 MB default buffer kills the child once it overflows. stderr is
        // inherited so a real error always reaches the terminal — capturing
        // and re-printing it is how the previous version swallowed failures.
        { stdio: ['ignore', 'ignore', 'inherit'] },
      )
    } catch {
      console.error(
        `\n\nFailed on batch ${i + 1} of ${batches.length}. wrangler's own error is above.` +
          `\nThe SQL for this batch is at ${file} — run it by hand to see the failing statement:` +
          `\n  npx wrangler d1 execute ${DB_NAME} ${remote ? '--remote' : '--local'} --file ${file}`,
      )
      process.exitCode = 1
      return
    }
    console.log('ok')
  }
  console.log('\nDone. Re-running this is safe: existing cards keep their schedule.')
}

main()
