/**
 * D1 caps the number of bound parameters in a single statement, so any
 * `inArray` over a user-sized list has to be split. 90 keeps a margin under
 * the limit for the other parameters in the same query.
 */
export const D1_PARAM_LIMIT = 90

export function chunked<T>(items: T[], size = D1_PARAM_LIMIT): T[][] {
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Run a query once per chunk and concatenate the rows. */
export async function inChunks<T, R>(
  items: T[],
  run: (chunk: T[]) => Promise<R[]>,
  size = D1_PARAM_LIMIT,
): Promise<R[]> {
  const out: R[] = []
  for (const chunk of chunked(items, size)) out.push(...(await run(chunk)))
  return out
}
