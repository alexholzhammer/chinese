import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type WordContent } from '@/lib/api'
import { Hanzi } from '@/components/chinese/Hanzi'
import { Pinyin } from '@/components/chinese/Pinyin'

interface Item {
  wordId: number
  stratum: string
  word: WordContent | null
}

type Verdicts = Awaited<ReturnType<typeof api.submitCalibration>>

/**
 * The placement test.
 *
 * Self-graded recognition over a stratified sample: see the word, decide, then
 * check. Coarse on purpose — 15 words per stratum is roughly +/- 22 points,
 * and the scheduler absorbs the error either way.
 */
export function Calibrate() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  const [answers, setAnswers] = useState<{ wordId: number; stratum: string; known: boolean }[]>([])
  const [result, setResult] = useState<Verdicts | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api
      .calibrationSample()
      .then((r) => setItems(r.items.filter((x) => x.word !== null)))
      .catch((e: Error) => setError(e.message))
  }, [])

  const answer = (known: boolean) => {
    const item = items?.[i]
    if (!item) return
    setAnswers((a) => [...a, { wordId: item.wordId, stratum: item.stratum, known }])
    setShown(false)
    setI((n) => n + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!items || i >= items.length) return
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setShown(true)
      } else if (shown) {
        if (e.key === 'y' || e.key === '1') answer(true)
        if (e.key === 'n' || e.key === '2') answer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const submit = async () => {
    try {
      setResult(await api.submitCalibration(answers))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (error) return <div className="mx-auto max-w-lg px-4 py-10" style={{ color: 'var(--again)' }}>{error}</div>
  if (!items) return <div className="mx-auto max-w-lg px-4 py-10 text-sm">Loading…</div>

  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Calibrated</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
          {result.seeded.toLocaleString()} cards were scheduled forward as already known. The rest
          stay new. Anything misjudged corrects itself: a word you don&rsquo;t really know fails
          once, and a known one takes a single keypress to move on.
        </p>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--text-dim)' }}>
              <th className="py-2 text-left font-medium">Band</th>
              <th className="py-2 text-right font-medium">Scored</th>
              <th className="py-2 text-right font-medium">Words</th>
              <th className="py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {result.verdicts.map((v) => (
              <tr key={v.stratum} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="py-2">{v.stratum.replace(':', ' · ')}</td>
                <td className="py-2 text-right tabular-nums">
                  {v.known}/{v.tested}
                </td>
                <td className="py-2 text-right tabular-nums">{v.size.toLocaleString()}</td>
                <td
                  className="py-2 text-right"
                  style={{
                    color:
                      v.action === 'seed-known'
                        ? 'var(--good)'
                        : v.action === 'triage'
                          ? 'var(--hard)'
                          : 'var(--text-dim)',
                  }}
                >
                  {v.action === 'seed-known'
                    ? 'seeded as known'
                    : v.action === 'triage'
                      ? 'mixed — left new'
                      : 'left new'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Link
          to="/review"
          className="mt-8 inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          Start reviewing
        </Link>
      </div>
    )
  }

  if (i >= items.length) {
    const known = answers.filter((a) => a.known).length
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-3xl font-semibold tabular-nums">
          {known} / {answers.length}
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-dim)' }}>
          known. Apply this to the deck?
        </p>
        <button
          onClick={() => void submit()}
          className="mt-8 rounded-md px-5 py-2.5 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          Apply
        </button>
      </div>
    )
  }

  const item = items[i]!
  const word = item.word!
  const primary = word.readings.find((r) => r.isPrimary) ?? word.readings[0]

  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-lg flex-col px-4 pb-6">
      <div className="py-3 text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
        {i + 1} / {items.length} · placement test
      </div>
      <div className="h-0.5 w-full rounded" style={{ background: 'var(--surface-2)' }} aria-hidden>
        <div
          className="h-full rounded"
          style={{ width: `${(i / items.length) * 100}%`, background: 'var(--accent)' }}
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Hanzi text={word.simplified} className="text-7xl" />
        {shown && primary && (
          <div className="text-center">
            <Pinyin text={primary.pinyin} className="text-xl" />
            <p className="mt-1 text-sm" style={{ color: 'var(--text-dim)' }}>
              {primary.meanings.slice(0, 4).join('; ')}
            </p>
          </div>
        )}
      </div>

      {shown ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => answer(true)}
            className="rounded-lg border px-4 py-3 text-sm font-medium"
            style={{ borderColor: 'var(--good)', color: 'var(--good)' }}
          >
            I knew it <span className="opacity-60">y</span>
          </button>
          <button
            onClick={() => answer(false)}
            className="rounded-lg border px-4 py-3 text-sm font-medium"
            style={{ borderColor: 'var(--again)', color: 'var(--again)' }}
          >
            I didn&rsquo;t <span className="opacity-60">n</span>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShown(true)}
          className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          Show <span className="opacity-60">space</span>
        </button>
      )}
    </div>
  )
}
