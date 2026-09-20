import { hanziTones, TONE_CLASS } from '@/lib/chinese/tone'

/** Hanzi, coloured by tone when the pinyin lines up character-for-character. */
export function Hanzi({
  text,
  pinyin,
  className = '',
}: {
  text: string
  pinyin?: string
  className?: string
}) {
  const tones = pinyin ? hanziTones(text, pinyin) : null
  if (!tones) return <span className={`hanzi ${className}`}>{text}</span>
  return (
    <span className={`hanzi ${className}`}>
      {[...text].map((ch, i) => (
        <span key={i} className={TONE_CLASS[tones[i] ?? 0]}>
          {ch}
        </span>
      ))}
    </span>
  )
}
