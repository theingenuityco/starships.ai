import type { ExportableTable } from './types'

function escapeCsvCell(value: string): string {
  const str = String(value ?? '')
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return `"${str}"`
}

/**
 * Convert ExportableTable to RFC-style CSV string.
 */
export function toCsv(table: ExportableTable): string {
  const { headers, rows } = table
  if (headers.length === 0 && rows.length === 0) {
    return ''
  }

  const lines: string[] = []
  if (headers.length > 0) {
    lines.push(headers.map(escapeCsvCell).join(','))
  }
  for (const row of rows) {
    const padded = [...row, ...Array(headers.length - row.length).fill('')]
    lines.push(padded.slice(0, headers.length).map(escapeCsvCell).join(','))
  }
  return lines.join('\r\n')
}
