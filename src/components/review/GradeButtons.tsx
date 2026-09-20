import { formatInterval, RATING_LABELS, type Rating } from '@/lib/srs'

const COLOR: Record<Rating, string> = {
  1: 'var(--again)',
  2: 'var(--hard)',
  3: 'var(--good)',
  4: 'var(--easy)',
}

/**
 * Each button carries the interval it will actually produce, taken from the
 * scheduler itself rather than approximated — which is why fuzz is off.
 */
export function GradeButtons({
  intervals,
  onGrade,
}: {
  intervals: Record<Rating, number>
  onGrade: (r: Rating) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {([1, 2, 3, 4] as Rating[]).map((r) => (
        <button
          key={r}
          onClick={() => onGrade(r)}
          className="flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 text-sm font-medium"
          style={{ borderColor: COLOR[r], color: COLOR[r], background: 'var(--surface)' }}
        >
          <span>{RATING_LABELS[r]}</span>
          <span className="text-xs tabular-nums opacity-80">{formatInterval(intervals[r])}</span>
          <span className="text-[10px] opacity-50">{r}</span>
        </button>
      ))}
    </div>
  )
}
