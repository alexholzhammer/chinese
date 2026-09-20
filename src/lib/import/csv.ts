/**
 * Minimal RFC-4180 CSV reader.
 *
 * The Du Chinese export needs a real parser rather than a split on commas:
 * quoted fields contain commas, embedded newlines (multi-line meanings) and
 * full-width punctuation (，。).
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  // Strip a UTF-8 BOM if the export carries one.
  if (input.charCodeAt(0) === 0xfeff) i = 1

  while (i < input.length) {
    const ch = input[i]!

    if (quoted) {
      // The export is CRLF throughout, including inside quoted multi-line
      // fields. Normalise, or every embedded meaning keeps a trailing \r.
      if (ch === '\r') {
        if (input[i + 1] === '\n') {
          field += '\n'
          i += 2
        } else {
          field += '\n'
          i += 1
        }
        continue
      }
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      quoted = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Parse to objects, skipping leading `#` comment lines (the export has one). */
export function parseCsvRecords(input: string): Record<string, string>[] {
  const body = input
    .split('\n')
    .filter((line, idx) => !(idx === 0 && line.startsWith('#')))
    .join('\n')

  const rows = parseCsv(body).filter((r) => r.some((c) => c.trim() !== ''))
  const header = rows.shift()
  if (!header) return []
  return rows.map((r) => {
    const rec: Record<string, string> = {}
    header.forEach((h, idx) => {
      rec[h] = r[idx] ?? ''
    })
    return rec
  })
}
