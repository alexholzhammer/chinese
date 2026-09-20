import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type SessionCard, type SessionResponse } from '@/lib/api'
import { tts } from '@/lib/audio/tts'
import { formatInterval, type Rating } from '@/lib/srs'
import { CardBack, CardFront } from '@/components/review/CardFace'
import { GradeButtons } from '@/components/review/GradeButtons'

interface Pending {
  cardId: number
  rating: Rating
  durationMs: number
  typedAnswer?: string
}

const FLUSH_EVERY = 10

export function Review() {
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [correct, setCorrect] = useState<boolean | null>(null)
  const [done, setDone] = useState<{ rating: Rating; cardId: number }[]>([])
  const [leeches, setLeeches] = useState(0)
  const [flushError, setFlushError] = useState<string | null>(null)

  // Answers buffer here and go up in batches, so a dropped connection
  // mid-session costs nothing.
  const buffer = useRef<Pending[]>([])
  const shownAt = useRef<number>(Date.now())

  useEffect(() => {
    void api.session().then(setSession).catch((e: Error) => setError(e.message))
  }, [])

  const cards = session?.cards ?? []
  const current: SessionCard | undefined = cards[index]
  const finished = session !== null && index >= cards.length

  const flush = useCallback(async (force = false) => {
    if (buffer.current.length === 0) return
    if (!force && buffer.current.length < FLUSH_EVERY) return
    const batch = buffer.current
    buffer.current = []
    try {
      const res = await api.submitReviews(batch)
      if (res.leeches.length) setLeeches((n) => n + res.leeches.length)
      setFlushError(null)
    } catch (e) {
      // Put them back rather than lose them; the next flush retries.
      buffer.current = [...batch, ...buffer.current]
      setFlushError((e as Error).message)
    }
  }, [])

  // Audio cards play themselves on arrival; iOS needs the session to have
  // begun with a tap, which starting the session provides.
  useEffect(() => {
    shownAt.current = Date.now()
    setRevealed(false)
    setTyped('')
    setCorrect(null)
    if (current?.card.cardType === 'audio' && current.word) {
      void tts.speak(current.word.simplified)
    }
  }, [index, current?.card.id])

  useEffect(() => {
    if (finished) void flush(true)
  }, [finished, flush])

  // Flush whatever is buffered if the tab goes away mid-session.
  useEffect(() => {
    const onHide = () => void flush(true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [flush])

  const reveal = useCallback(() => {
    if (!current) return
    if (current.card.cardType === 'typing' && current.word) {
      setCorrect(typed.trim() === current.word.simplified)
    }
    setRevealed(true)
  }, [current, typed])

  const grade = useCallback(
    (rating: Rating) => {
      if (!current) return
      buffer.current.push({
        cardId: current.card.id,
        rating,
        durationMs: Date.now() - shownAt.current,
        ...(current.card.cardType === 'typing' ? { typedAnswer: typed } : {}),
      })
      setDone((d) => [...d, { rating, cardId: current.card.id }])
      setIndex((i) => i + 1)
      void flush()
    },
    [current, typed, flush],
  )

  const markKnown = useCallback(async () => {
    if (!current || current.card.state !== 'new') return
    // Send immediately rather than buffering: it isn't a graded review, and
    // the endpoint refuses a card that has already entered the schedule.
    try {
      await api.know(current.card.id)
      setIndex((i) => i + 1)
    } catch (e) {
      setFlushError((e as Error).message)
    }
  }, [current])

  const undo = useCallback(async () => {
    const last = done.at(-1)
    if (!last) return
    // Anything still buffered has not reached the server; drop it locally.
    const buffered = buffer.current.findIndex((b) => b.cardId === last.cardId)
    if (buffered !== -1) buffer.current.splice(buffered, 1)
    else await api.undo(last.cardId).catch((e: Error) => setFlushError(e.message))
    setDone((d) => d.slice(0, -1))
    setIndex((i) => Math.max(0, i - 1))
  }, [done])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.key === 'z' && !typing) {
        e.preventDefault()
        void undo()
        return
      }
      if (!current) return
      if (!revealed) {
        if (e.key === 'k' && !typing && current.card.state === 'new') {
          e.preventDefault()
          void markKnown()
        }
        if (e.key === ' ' && !typing) {
          e.preventDefault()
          reveal()
        }
        return
      }
      // Grade keys bind only after reveal, so they never fight the IME's
      // candidate-selection digits while typing hanzi.
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        grade(Number(e.key) as Rating)
      }
      if (e.key === ' ') {
        e.preventDefault()
        grade(3)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, reveal, grade, undo, markKnown])

  const summary = useMemo(() => {
    const again = done.filter((d) => d.rating === 1).length
    return { total: done.length, again, rate: done.length ? again / done.length : 0 }
  }, [done])

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <p style={{ color: 'var(--again)' }}>{error}</p>
      </div>
    )
  }
  if (!session) return <div className="mx-auto max-w-lg px-4 py-10 text-sm">Loading…</div>

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg">Nothing due.</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
          {session.settings.calibratedAt === null
            ? 'Take the placement test to get a queue worth studying.'
            : 'Come back tomorrow, or raise the daily new-word limit in Settings.'}
        </p>
        <Link
          to={session.settings.calibratedAt === null ? '/calibrate' : '/settings'}
          className="mt-5 inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          {session.settings.calibratedAt === null ? 'Placement test' : 'Settings'}
        </Link>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-3xl font-semibold tabular-nums">{summary.total}</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-dim)' }}>
          cards reviewed · {Math.round(summary.rate * 100)}% marked Again
        </p>
        {leeches > 0 && (
          <p className="mt-4 text-sm" style={{ color: 'var(--text-dim)' }}>
            {leeches} {leeches === 1 ? 'card was' : 'cards were'} suspended as leeches — forgotten
            too many times to keep in rotation.
          </p>
        )}
        {flushError && (
          <p className="mt-4 text-sm" style={{ color: 'var(--again)' }}>
            Some reviews haven&rsquo;t saved yet: {flushError}. Keep this tab open; they retry.
          </p>
        )}
        <Link
          to="/"
          className="mt-8 inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          Done
        </Link>
      </div>
    )
  }

  if (!current?.word) return <div className="mx-auto max-w-lg px-4 py-10 text-sm">Loading…</div>

  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-lg flex-col px-4 pb-6">
      <div className="flex items-center justify-between py-3 text-xs" style={{ color: 'var(--text-dim)' }}>
        <span className="tabular-nums">
          {index + 1} / {cards.length}
        </span>
        <span className="flex items-center gap-2">
          {current.card.state === 'new' && (
            <span
              className="rounded px-1.5 py-0.5"
              style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
            >
              new
            </span>
          )}
          <span>{current.card.cardType}</span>
        </span>
      </div>
      <div
        className="h-0.5 w-full rounded"
        style={{ background: 'var(--surface-2)' }}
        aria-hidden
      >
        <div
          className="h-full rounded"
          style={{ width: `${(index / cards.length) * 100}%`, background: 'var(--accent)' }}
        />
      </div>

      <div className="flex flex-1 flex-col justify-center">
        {revealed ? (
          <CardBack
            word={current.word}
            {...(current.card.cardType === 'typing' ? { typed, correct } : {})}
          />
        ) : (
          <CardFront
            cardType={current.card.cardType}
            word={current.word}
            typed={typed}
            onTyped={setTyped}
            onSubmit={reveal}
          />
        )}
      </div>

      {flushError && (
        <p className="mb-2 text-center text-xs" style={{ color: 'var(--again)' }}>
          Not saved yet — retrying
        </p>
      )}

      {revealed ? (
        <GradeButtons intervals={current.intervals} onGrade={grade} />
      ) : (
        <div className="space-y-2">
          <button
            onClick={reveal}
            className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            Show answer <span className="opacity-60">space</span>
          </button>
          {current.card.state === 'new' && (
            <button
              onClick={() => void markKnown()}
              className="w-full rounded-lg border px-4 py-2.5 text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
            >
              I already know this — see it in {formatInterval(21 * 86_400_000)}{' '}
              <span className="opacity-60">k</span>
            </button>
          )}
        </div>
      )}

      {done.length > 0 && (
        <button
          onClick={() => void undo()}
          className="mt-2 self-center text-xs underline"
          style={{ color: 'var(--text-dim)' }}
        >
          Undo last (z)
        </button>
      )}
    </div>
  )
}
