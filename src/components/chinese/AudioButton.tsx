import { useState } from 'react'
import { tts } from '@/lib/audio/tts'

export function AudioButton({
  text,
  size = 'md',
  autoLabel,
}: {
  text: string
  size?: 'md' | 'lg'
  autoLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  const play = async () => {
    setBusy(true)
    await tts.speak(text)
    setBusy(false)
  }
  return (
    <button
      onClick={() => void play()}
      aria-label={autoLabel ?? `Play ${text}`}
      className={`inline-flex items-center justify-center rounded-full border transition-opacity ${
        size === 'lg' ? 'h-16 w-16' : 'h-9 w-9'
      } ${busy ? 'opacity-50' : ''}`}
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <svg
        width={size === 'lg' ? 28 : 18}
        height={size === 'lg' ? 28 : 18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  )
}
