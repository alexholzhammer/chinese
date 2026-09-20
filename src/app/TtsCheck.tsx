import { useEffect, useState } from 'react'
import { tts, waitForVoices } from '@/lib/audio/tts'

/**
 * Does this device have a usable Mandarin voice?
 *
 * Worth answering before audio cards are switched on: 3,181 silent cards is a
 * bad thing to discover in week three. Open this on every device you study on.
 */
export function TtsCheck() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null)
  const [all, setAll] = useState(0)
  const [spoken, setSpoken] = useState<string | null>(null)

  useEffect(() => {
    void waitForVoices().then((v) => {
      setVoices(v)
      setAll(typeof speechSynthesis === 'undefined' ? 0 : speechSynthesis.getVoices().length)
    })
  }, [])

  const say = async (text: string) => {
    setSpoken(text)
    await tts.speak(text)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Speech check</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
        Audio cards use the browser&rsquo;s own speech synthesis — free, but the available
        Mandarin voices differ by device. Run this on every device you study on before turning
        audio cards on in Settings.
      </p>

      {voices === null ? (
        <p className="mt-8 text-sm">Looking for voices…</p>
      ) : voices.length === 0 ? (
        <div
          className="mt-8 rounded-lg border p-4"
          style={{ borderColor: 'var(--again)', background: 'var(--surface)' }}
        >
          <p className="font-medium" style={{ color: 'var(--again)' }}>
            No Mandarin voice on this device.
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
            {all} voices are installed, none of them Mandarin. Leave audio cards off here. If no
            device has one, the fallback is pre-generated audio — the whole corpus is about
            29,000 characters, inside a free TTS tier.
          </p>
        </div>
      ) : (
        <div
          className="mt-8 rounded-lg border p-4"
          style={{ borderColor: 'var(--good)', background: 'var(--surface)' }}
        >
          <p className="font-medium" style={{ color: 'var(--good)' }}>
            {voices.length} Mandarin {voices.length === 1 ? 'voice' : 'voices'} available.
          </p>
          <ul className="mt-3 space-y-1 text-sm" style={{ color: 'var(--text-dim)' }}>
            {voices.map((v) => (
              <li key={`${v.name}-${v.lang}`}>
                {v.name} <span className="opacity-60">({v.lang})</span>
                {v.localService ? '' : ' — needs a network connection'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8">
        <p className="text-sm font-medium">Listen — does it sound like Mandarin, with tones?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {['地铁', '音乐家', '我想买一张票'].map((text) => (
            <button
              key={text}
              onClick={() => void say(text)}
              className="hanzi rounded-lg border px-4 py-2 text-lg"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {text}
            </button>
          ))}
        </div>
        {spoken && (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-dim)' }}>
            Played <span className="hanzi">{spoken}</span>. Nothing heard? On iOS the first play
            needs a tap, which this was — so silence here means no usable voice.
          </p>
        )}
      </div>
    </div>
  )
}
