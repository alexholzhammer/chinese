/**
 * Speech, behind a provider interface.
 *
 * Step 1 uses the Web Speech API: free, no key, no server. Its weakness is
 * that Mandarin voice availability and quality vary by device, and iOS needs a
 * user gesture before it will speak — so the app asks whether it can speak
 * before it builds a card type around it, and pre-generated audio can be
 * dropped in later as a second provider without touching callers.
 */

export interface TtsProvider {
  readonly name: string
  available(): boolean
  speak(text: string): Promise<void>
}

const MANDARIN = /^(zh|cmn)(-|_)?(CN|Hans|SG)?/i

export function mandarinVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices().filter((v) => MANDARIN.test(v.lang))
}

/**
 * getVoices() is empty until the list loads, and the event never fires on some
 * browsers — so poll briefly rather than wait forever.
 */
export function waitForVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve([])
    const found = mandarinVoices()
    if (found.length) return resolve(found)

    const started = Date.now()
    const tick = () => {
      const voices = mandarinVoices()
      if (voices.length || Date.now() - started > timeoutMs) {
        clearInterval(timer)
        resolve(voices)
      }
    }
    const timer = setInterval(tick, 150)
    speechSynthesis.addEventListener('voiceschanged', tick, { once: true })
  })
}

export const webSpeechProvider: TtsProvider = {
  name: 'Web Speech API',
  available: () => mandarinVoices().length > 0,
  speak: (text) =>
    new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined') return resolve()
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      const voice = mandarinVoices()[0]
      if (voice) utterance.voice = voice
      utterance.rate = 0.85
      utterance.onend = () => resolve()
      // A failed utterance must not hang the caller — the card still shows.
      utterance.onerror = () => resolve()
      speechSynthesis.speak(utterance)
    }),
}

export const tts: TtsProvider = webSpeechProvider
