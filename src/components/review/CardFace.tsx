import type { CardType } from '@/config'
import { Hanzi } from '@/components/chinese/Hanzi'
import { Pinyin } from '@/components/chinese/Pinyin'
import { AudioButton } from '@/components/chinese/AudioButton'
import type { WordContent } from '@/lib/api'

export function CardFront({
  cardType,
  word,
  typed,
  onTyped,
  onSubmit,
}: {
  cardType: CardType
  word: WordContent
  typed: string
  onTyped: (v: string) => void
  onSubmit: () => void
}) {
  const primary = word.readings.find((r) => r.isPrimary) ?? word.readings[0]

  if (cardType === 'audio') {
    return (
      <div className="flex flex-col items-center gap-6 py-10">
        <AudioButton text={word.simplified} size="lg" autoLabel="Play the word again" />
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          What does it mean, and how is it written?
        </p>
      </div>
    )
  }

  if (cardType === 'typing') {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="text-center text-xl">{primary?.meanings.slice(0, 3).join('; ')}</div>
        <AudioButton text={word.simplified} />
        <input
          autoFocus
          value={typed}
          onChange={(e) => onTyped(e.target.value)}
          onKeyDown={(e) => {
            // Let the IME finish composing before Enter means "submit".
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              onSubmit()
            }
          }}
          lang="zh-CN"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="type the characters"
          className="hanzi w-full max-w-xs rounded-lg border px-4 py-3 text-center text-3xl outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Enter to check
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <Hanzi text={word.simplified} className="text-7xl" />
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
        Meaning and pinyin?
      </p>
    </div>
  )
}

export function CardBack({
  word,
  typed,
  correct,
}: {
  word: WordContent
  typed?: string
  correct?: boolean | null
}) {
  const primary = word.readings.find((r) => r.isPrimary) ?? word.readings[0]

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <Hanzi text={word.simplified} pinyin={primary?.pinyin} className="text-6xl" />

      {typed !== undefined && correct !== null && (
        <div className="text-sm" style={{ color: correct ? 'var(--good)' : 'var(--again)' }}>
          {correct ? (
            'Correct'
          ) : (
            <>
              You typed <span className="hanzi text-base">{typed || '(nothing)'}</span>
            </>
          )}
        </div>
      )}

      {/* Every reading, not just the primary one: 长 is cháng *and* zhǎng, and
          a card that only taught one of them would be teaching a half-truth. */}
      <div className="w-full space-y-3">
        {word.readings.map((r, i) => (
          <div
            key={i}
            className="rounded-lg border px-4 py-3"
            style={{
              borderColor: 'var(--border)',
              background: r.isPrimary ? 'var(--surface)' : 'transparent',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <Pinyin text={r.pinyin} className="text-lg font-medium" />
              {word.readings.length > 1 && r.isPrimary && (
                <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                  main
                </span>
              )}
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--text-dim)' }}>
              {r.meanings.join('; ')}
            </div>
          </div>
        ))}
      </div>

      {word.example && (
        <div
          className="w-full rounded-lg border px-4 py-3"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <Hanzi text={word.example.simplified} className="text-base leading-relaxed" />
            <AudioButton text={word.example.simplified} />
          </div>
          <div className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            <Pinyin text={word.example.pinyin} />
          </div>
          <div className="mt-1.5 text-sm" style={{ color: 'var(--text-dim)' }}>
            {word.example.translation}
          </div>
        </div>
      )}

      {word.hskNew && (
        <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
          HSK {word.hskNew.slice(1)}
        </span>
      )}
    </div>
  )
}
