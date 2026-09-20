import { toneClassesFor } from '@/lib/chinese/tone'

export function Pinyin({ text, className = '' }: { text: string; className?: string }) {
  const classes = toneClassesFor(text)
  const syllables = text.trim().split(/\s+/)
  return (
    <span className={className}>
      {syllables.map((s, i) => (
        <span key={i} className={classes[i]}>
          {s}
          {i < syllables.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}
