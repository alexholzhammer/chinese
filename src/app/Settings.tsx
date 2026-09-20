import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { CARD_TYPES } from '@/config'

interface Deck {
  id: number
  name: string
  enabled: boolean
  enabledCardTypes: string[]
}

export function Settings() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [decks, setDecks] = useState<Deck[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.settings().then(setSettings)
    void api.decks().then(setDecks)
  }, [])

  const save = async (patch: Record<string, unknown>) => {
    setSettings(await api.saveSettings(patch))
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const toggleCardType = async (deck: Deck, type: string) => {
    const next = deck.enabledCardTypes.includes(type)
      ? deck.enabledCardTypes.filter((t) => t !== type)
      : [...deck.enabledCardTypes, type]
    if (next.length === 0) return // a deck with no card types generates nothing
    await api.saveDeck(deck.id, { enabledCardTypes: next })
    setDecks(await api.decks())
  }

  if (!settings) return <div className="mx-auto max-w-2xl px-4 py-10 text-sm">Loading…</div>

  const num = (k: string) => Number(settings[k] ?? 0)

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {saved && (
        <p className="mt-2 text-sm" style={{ color: 'var(--good)' }}>
          Saved
        </p>
      )}

      <section className="mt-8 space-y-5">
        <Field
          label="New words per day"
          hint="Each new word becomes one card per enabled type. 10/day introduces the full 3,181 in about a year."
        >
          <input
            type="number"
            min={0}
            max={200}
            value={num('newWordsPerDay')}
            onChange={(e) => void save({ newWordsPerDay: Number(e.target.value) })}
            className="w-24 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </Field>

        <Field label="Maximum reviews per day" hint="A ceiling on the queue, so a backlog can't produce an unusable session.">
          <input
            type="number"
            min={0}
            max={2000}
            value={num('maxReviewsPerDay')}
            onChange={(e) => void save({ maxReviewsPerDay: Number(e.target.value) })}
            className="w-24 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </Field>

        <Field
          label="Target retention"
          hint="What share of reviews FSRS aims to get right. Higher means more frequent reviews."
        >
          <input
            type="number"
            min={0.7}
            max={0.98}
            step={0.01}
            value={num('desiredRetention')}
            onChange={(e) => void save({ desiredRetention: Number(e.target.value) })}
            className="w-24 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </Field>

        <Field
          label="Day rolls over at"
          hint="Local hour. Reviewing at 1am counts as the previous day rather than spending tomorrow's new cards."
        >
          <input
            type="number"
            min={0}
            max={23}
            value={num('dayCutoffHour')}
            onChange={(e) => void save({ dayCutoffHour: Number(e.target.value) })}
            className="w-24 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </Field>
      </section>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
        Decks and card types
      </h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
        Every type you add multiplies the card count and the daily load. Check a Mandarin voice
        exists on this device before turning audio on — <Link to="/tts-check" className="underline">speech check</Link>.
      </p>
      <div className="mt-4 space-y-3">
        {decks.map((deck) => (
          <div
            key={deck.id}
            className="rounded-lg border p-4"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{deck.name}</span>
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-dim)' }}>
                <input
                  type="checkbox"
                  checked={deck.enabled}
                  onChange={async () => {
                    await api.saveDeck(deck.id, { enabled: !deck.enabled })
                    setDecks(await api.decks())
                  }}
                />
                enabled
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {CARD_TYPES.map((type) => {
                const on = deck.enabledCardTypes.includes(type)
                return (
                  <button
                    key={type}
                    onClick={() => void toggleCardType(deck, type)}
                    className="rounded-md border px-3 py-1.5 text-xs"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--text-dim)',
                    }}
                  >
                    {type}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
              Adding a type creates its cards on the next <code>npm run import</code>.
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
        Backup
      </h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
        D1&rsquo;s own recovery window is seven days on the free plan and produces no file. Your
        review history is the one thing here that can&rsquo;t be rebuilt, so take a copy now and
        then.
      </p>
      <a
        href="/api/export"
        className="mt-3 inline-block rounded-md border px-4 py-2 text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        Download everything as JSON
      </a>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
        Calibration
      </h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
        {settings['calibratedAt']
          ? `Last run ${new Date(Number(settings['calibratedAt'])).toLocaleDateString()}.`
          : 'Not yet run.'}{' '}
        Re-running only ever moves cards that are still new.
      </p>
      <Link
        to="/calibrate"
        className="mt-3 inline-block rounded-md border px-4 py-2 text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        Placement test
      </Link>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
          {hint}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
