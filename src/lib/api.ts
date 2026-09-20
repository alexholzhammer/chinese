import type { SrsCard, Rating } from '@/lib/srs'

export interface WordContent {
  wordId: number
  simplified: string
  hskNew: string | null
  readings: { pinyin: string; meanings: string[]; isPrimary: boolean }[]
  example: { simplified: string; pinyin: string; translation: string } | null
}

export interface SessionCard {
  card: SrsCard
  intervals: Record<Rating, number>
  word: WordContent | null
}

export interface SessionResponse {
  settings: {
    newWordsPerDay: number
    maxReviewsPerDay: number
    dayCutoffHour: number
    calibratedAt: number | null
  }
  cards: SessionCard[]
}

export interface Stats {
  buckets: { new: number; learning: number; young: number; mature: number; suspended: number; leech: number }
  dueNow: number
  total: number
  forecast: { day: number; count: number }[]
  dayStart: number
  newDoneToday: number
  reviewsDoneToday: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${path}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

export const api = {
  session: () => request<SessionResponse>('/session'),
  stats: () => request<Stats>('/stats'),
  settings: () => request<Record<string, unknown>>('/settings'),
  saveSettings: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  decks: () => request<{ id: number; name: string; enabled: boolean; enabledCardTypes: string[] }[]>('/decks'),
  saveDeck: (id: number, body: { enabled?: boolean; enabledCardTypes?: string[] }) =>
    request<{ ok: boolean }>(`/decks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  submitReviews: (reviews: { cardId: number; rating: Rating; durationMs?: number; typedAnswer?: string }[]) =>
    request<{ applied: number; leeches: number[] }>('/reviews', {
      method: 'POST',
      body: JSON.stringify({ reviews }),
    }),
  undo: (cardId: number) =>
    request<{ undone: boolean }>('/reviews/undo', {
      method: 'POST',
      body: JSON.stringify({ cardId }),
    }),
  know: (cardId: number) => request<{ ok: boolean }>(`/cards/${cardId}/know`, { method: 'POST' }),

  calibrationSample: () =>
    request<{
      items: { wordId: number; stratum: string; word: WordContent | null }[]
      strata: { key: string; level: string; band: string; size: number }[]
    }>('/calibrate'),
  submitCalibration: (answers: { wordId: number; stratum: string; known: boolean }[]) =>
    request<{
      verdicts: { stratum: string; known: number; tested: number; ratio: number; action: string; size: number }[]
      seeded: number
      triage: string[]
    }>('/calibrate', { method: 'POST', body: JSON.stringify({ answers }) }),

  library: (limit = 200) => request<{ card: SrsCard; word: WordContent | null }[]>(`/library?limit=${limit}`),
}
