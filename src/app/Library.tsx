import { useEffect, useMemo, useState } from 'react'
import { api, type WordContent } from '@/lib/api'
import { bucketOf, type Bucket, type SrsCard } from '@/lib/srs'
import { Hanzi } from '@/components/chinese/Hanzi'
import { Pinyin } from '@/components/chinese/Pinyin'
import { MnemonicEditor } from '@/components/review/MnemonicEditor'

const BUCKET_COLOR: Record<Bucket, string> = {
  new: 'var(--text-dim)',
  learning: 'var(--tone-1)',
  young: 'var(--tone-2)',
  mature: 'var(--tone-4)',
}

export function Library() {
  const [rows, setRows] = useState<{ card: SrsCard; word: WordContent | null }[] | null>(null)
  const [query, setQuery] = useState('')
  const [bucket, setBucket] = useState<Bucket | 'all' | 'leech'>('all')

  const saveMnemonic = async (wordId: number, text: string) => {
    const { mnemonic } = await api.saveMnemonic(wordId, text)
    setRows(
      (prev) =>
        prev?.map((r) => (r.word?.wordId === wordId ? { ...r, word: { ...r.word, mnemonic } } : r)) ??
        prev,
    )
  }

  useEffect(() => {
    void api.library(500).then(setRows).catch(() => setRows([]))
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    return rows.filter(({ card, word }) => {
      if (!word) return false
      if (bucket === 'leech' ? !card.isLeech : bucket !== 'all' && bucketOf(card) !== bucket) {
        return false
      }
      if (!q) return true
      return (
        word.simplified.includes(q) ||
        word.readings.some(
          (r) =>
            r.pinyin.toLowerCase().includes(q) ||
            r.meanings.some((m) => m.toLowerCase().includes(q)),
        )
      )
    })
  }, [rows, query, bucket])

  if (!rows) return <div className="mx-auto max-w-4xl px-4 py-10 text-sm">Loading…</div>

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Library</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search characters, pinyin or meaning"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value as Bucket | 'all')}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="all">All buckets</option>
          <option value="new">New</option>
          <option value="learning">Learning</option>
          <option value="young">Young</option>
          <option value="mature">Mature</option>
          <option value="leech">Leeches</option>
        </select>
      </div>
      <p className="mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
        {filtered.length} of {rows.length} shown (most frequent first)
      </p>

      <ul className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
        {filtered.map(({ card, word }) => {
          const primary = word!.readings.find((r) => r.isPrimary) ?? word!.readings[0]
          const b = bucketOf(card)
          return (
            <li key={card.id} className="flex items-start gap-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <Hanzi text={word!.simplified} pinyin={primary?.pinyin} className="w-24 shrink-0 text-2xl" />
              <div className="min-w-0 flex-1">
                {primary && <Pinyin text={primary.pinyin} className="text-sm" />}
                <div className="truncate text-sm" style={{ color: 'var(--text-dim)' }}>
                  {primary?.meanings.join('; ')}
                </div>
                <div className="mt-1.5">
                  <MnemonicEditor
                    value={word!.mnemonic}
                    onSave={(text) => saveMnemonic(word!.wordId, text)}
                    compact
                  />
                </div>
              </div>
              {word!.hskNew && (
                <span className="shrink-0 text-xs" style={{ color: 'var(--text-dim)' }}>
                  HSK {word!.hskNew.slice(1)}
                </span>
              )}
              <span className="w-16 shrink-0 text-right text-xs" style={{ color: BUCKET_COLOR[b] }}>
                {card.isLeech ? 'leech' : b}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
