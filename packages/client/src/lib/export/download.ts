import type { ExportableTable } from './types'
import { toCsv } from './writers'

/**
 * Replace characters invalid in filenames with dash.
 */
export function sanitizeFilename(name: string): string {
  return String(name ?? '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'export'
}

/**
 * Trigger CSV download for a table.
 * @throws on failure (e.g. createObjectURL not supported)
 */
export function downloadTableAsCsv(table: ExportableTable, filename: string): void {
  const csv = toCsv(table)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
