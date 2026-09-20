# Chinese

A personal Chinese learning app. Step 1 is spaced-repetition vocabulary over
HSK 3.0 bands 1–4; the reader, dictation, topic lessons and a Claude connector
come later.

Goals it is built around: **reading, typing, listening, vocabulary.** No
handwriting or stroke order. Simplified characters only.

## Stack

Vite + React 19 + TypeScript, served by a Cloudflare Worker with static assets.
Cloudflare D1 (SQLite) via Drizzle. [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
for scheduling. One free Cloudflare account covers the site, the API and the
database in a single deploy.

There is no login. It is a single-user app, and `userId` is a constant
(`OWNER_ID`) so that adding real users later is a config change rather than a
migration across every table. The deployed URL is public, so put Cloudflare
Access in front of the Worker — it is a dashboard toggle, not code.

## Setup

```bash
npm install

npx wrangler d1 create chinese-db      # paste the id into wrangler.jsonc
npm run db:migrate:local
npm run import -- --local              # loads the HSK library and examples

npm run dev                            # http://localhost:5173
```

Deploying:

```bash
npm run db:migrate:remote
npm run import -- --remote
npm run deploy
```

## Before you study: two things in order

1. **`/tts-check`** on every device you study on. Audio cards use the browser's
   own speech synthesis, and Mandarin voice availability varies. Only turn
   audio cards on in Settings once this passes.
2. **`/calibrate`** — the placement test. Cards are introduced commonest-first,
   so starting cold means weeks of confirming 的, 我, 是. 120 words, about ten
   minutes.

Calibration does not need to be accurate, because the scheduler corrects it: a
word wrongly seeded fails once and drops into relearning, and a known word left
new takes one keypress (`k`) to move on. A wrong guess costs about one review.

## Commands

| | |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and build |
| `npm test` | Unit tests |
| `npm run import -- --local\|--remote\|--dry-run` | Load the vocabulary |
| `npm run db:generate` | New migration from `src/db/schema.ts` |
| `npm run deploy` | Build and deploy to Cloudflare |

## Data

| Path | What |
|---|---|
| `data/hsk/hsk-complete.min.json` | [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary), MIT |
| `data/vocab/duchinese-2026-09-19.csv` | Du Chinese export, 742 rows |

A first import produces **3,181** HSK words across bands 1–4 (506/750/953/972),
**3,555** readings, **606** example sentences attached to 615 words, **123**
extra words from the export, and one card per word per enabled card type.

Two things about this data are worth knowing, because both look like bugs
otherwise:

- **A word is one HSK entry, and pronunciations live under it.** 还 is a single
  word with `hái`, `huán` and a surname reading; 长 is `cháng` and `zhǎng`. The
  dataset splits some pronunciations across several rows (帮 lists `bāng` three
  times with different glosses), so the importer merges on exact pinyin and
  unions the meanings. Case is significant, which keeps the surname 安 `Ān`
  apart from 安 `ān`.
- **The Du Chinese export is not used to guess what you already know.** Within
  every HSK band its words are the *more common* ones — that is exposure from
  reading, not retention — so inferring knowledge from it would be wrong in both
  directions. It supplies example sentences (the HSK dataset has none at all)
  and the 123 words outside the bands. Seeding is the placement test's job.

The importer is idempotent: re-running adds new words, refreshes content, and
never touches the schedule of a card that already exists. Widening
`INCLUDED_HSK_LEVELS` in `src/config.ts` and re-running is the supported way to
extend the curriculum.

## Layout

```
src/lib/srs/          scheduler, buckets, queue — pure, no React, no database
src/lib/calibration   placement-test sampling and grading — pure
src/lib/import/       HSK + CSV parsing — pure
src/worker/           Hono API over D1
src/app/              pages
scripts/import.ts     vocabulary loader
```

`src/lib/srs` is deliberately framework-free so the reader, dictation and topic
lessons reuse it unchanged. A card is polymorphic over word / sentence / pattern
with a CHECK that exactly one is set, so those modules attach without a
migration.

## Backups

`GET /api/export` (or the button in Settings) dumps the whole database as JSON.
Worth doing occasionally: D1's own Time Travel is 7 days on the free plan and
produces no downloadable file, and `review_log` is the one table that cannot be
reconstructed — it is what FSRS would be retrained on.

## Keyboard

| | |
|---|---|
| `space` | show answer, then grade Good |
| `1` `2` `3` `4` | Again / Hard / Good / Easy |
| `k` | already know this (new cards only) |
| `z` | undo the last answer |
| `enter` | submit a typed answer |

Grade keys bind only after the answer is shown, so they never collide with an
IME's candidate-selection digits while typing hanzi.

## A note on how to use it

Drilling 3,181 isolated words is the most quit-prone way to spend a year, and
vocabulary sticks when it is met in context. Keep reading while you use this.
The SRS is here to stop you forgetting what you have met — not to be the place
you meet it.
