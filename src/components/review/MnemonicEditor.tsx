import { useEffect, useRef, useState } from 'react'

/**
 * Inline editor for a word's Eselsbrücke.
 *
 * Deliberately available on the back of a card, not only in the Library: the
 * moment you most want to write a memory hook is straight after failing the
 * word, and making you go and find it later means it never gets written.
 */
export function MnemonicEditor({
  value,
  onSave,
  compact = false,
}: {
  value: string | null
  onSave: (text: string) => Promise<void> | void
  compact?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const commit = async () => {
    if (saving) return
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return value ? (
      <button
        onClick={() => setEditing(true)}
        className="w-full rounded-lg border px-4 py-3 text-left text-sm"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <span
          className="mb-1 block text-[10px] uppercase tracking-wide"
          style={{ color: 'var(--text-dim)' }}
        >
          Eselsbrücke
        </span>
        <span className="whitespace-pre-wrap">{value}</span>
      </button>
    ) : (
      <button
        onClick={() => setEditing(true)}
        className={`text-xs underline ${compact ? '' : 'self-center'}`}
        style={{ color: 'var(--text-dim)' }}
      >
        + Eselsbrücke
      </button>
    )
  }

  return (
    <div className="w-full">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter alone inserts a newline — mnemonics are often a few lines.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(value ?? '')
            setEditing(false)
          }
          // Keep the review shortcuts from firing while typing a mnemonic.
          e.stopPropagation()
        }}
        onBlur={() => void commit()}
        rows={3}
        placeholder="A hook that gets you to the word…"
        className="w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none"
        style={{
          borderColor: 'var(--accent)',
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      />
      <div className="mt-1 flex items-center justify-between text-xs" style={{ color: 'var(--text-dim)' }}>
        <span>⌘↵ to save · esc to cancel{value ? ' · empty removes it' : ''}</span>
        {saving && <span>saving…</span>}
      </div>
    </div>
  )
}
