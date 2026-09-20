import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Stats } from '@/lib/api'

const BUCKETS = [
  { key: 'new', label: 'New', tone: 'var(--text-dim)' },
  { key: 'learning', label: 'Learning', tone: 'var(--tone-1)' },
  { key: 'young', label: 'Young', tone: 'var(--tone-2)' },
  { key: 'mature', label: 'Mature', tone: 'var(--tone-4)' },
] as const

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [calibrated, setCalibrated] = useState<boolean | null>(null)

  useEffect(() => {
    void api.stats().then(setStats).catch((e: Error) => setError(e.message))
    void api
      .session()
      .then((s) => setCalibrated(s.settings.calibratedAt !== null))
      .catch(() => setCalibrated(null))
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p style={{ color: 'var(--again)' }}>{error}</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
          If the database is empty, run <code>npm run import -- --local</code>.
        </p>
      </div>
    )
  }
  if (!stats) return <div className="mx-auto max-w-4xl px-4 py-10 text-sm">Loading…</div>

  const waiting = stats.dueNow + Math.max(0, stats.buckets.new > 0 ? 1 : 0)
  const maxForecast = Math.max(1, ...stats.forecast.map((f) => f.count))

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {calibrated === false && (
        <div
          className="mb-8 rounded-lg border p-4"
          style={{ borderColor: 'var(--accent)', background: 'var(--surface)' }}
        >
          <p className="font-medium">Take the placement test first</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-dim)' }}>
            Cards are introduced commonest-first, so without it the first weeks are 的, 我, 是.
            120 words, about ten minutes. It doesn&rsquo;t need to be accurate — the scheduler
            corrects it as you go.
          </p>
          <Link
            to="/calibrate"
            className="mt-3 inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            Start the placement test
          </Link>
        </div>
      )}

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Today</h1>
        <span className="text-sm" style={{ color: 'var(--text-dim)' }}>
          {stats.reviewsDoneToday} reviewed · {stats.newDoneToday} new
        </span>
      </div>

      <Link
        to="/review"
        className="mt-6 flex items-center justify-between rounded-xl border p-6 transition-colors"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div>
          <div className="text-4xl font-semibold tabular-nums">{stats.dueNow}</div>
          <div className="mt-1 text-sm" style={{ color: 'var(--text-dim)' }}>
            {stats.dueNow === 1 ? 'card due' : 'cards due'}
            {stats.buckets.new > 0 && ` · ${stats.buckets.new} still unseen`}
          </div>
        </div>
        <span
          className="rounded-md px-5 py-2.5 text-sm font-medium text-white"
          style={{ background: waiting ? 'var(--accent)' : 'var(--text-dim)' }}
        >
          {waiting ? 'Study' : 'All clear'}
        </span>
      </Link>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
        Buckets
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BUCKETS.map((b) => (
          <div
            key={b.key}
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="text-2xl font-semibold tabular-nums" style={{ color: b.tone }}>
              {stats.buckets[b.key].toLocaleString()}
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
              {b.label}
            </div>
          </div>
        ))}
      </div>
      {stats.buckets.leech > 0 && (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-dim)' }}>
          {stats.buckets.leech} {stats.buckets.leech === 1 ? 'card is' : 'cards are'} suspended as
          a leech — repeatedly forgotten, so parked rather than left to crowd the queue.
        </p>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
        Next seven days
      </h2>
      <div className="mt-3 flex items-end gap-2" style={{ height: 96 }}>
        {stats.forecast.map((f) => (
          <div key={f.day} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t"
              style={{
                height: `${Math.max(2, (f.count / maxForecast) * 76)}px`,
                background: f.day === 0 ? 'var(--accent)' : 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
              title={`${f.count} due`}
            />
            <span className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>
              {f.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
