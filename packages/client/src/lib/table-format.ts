export type DataCellValue = unknown
export type DataCellFormat = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percentage'

type RefValue =
  | { kind: 'table_row'; tableIdOrSlug: string; key: string; label?: string; url?: string }
  | { kind: 'task_card'; cardId: string; label?: string; url?: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isRefValue(value: unknown): value is RefValue {
  if (!isPlainObject(value)) return false
  const kind = String((value as any).kind || '').trim()
  if (kind === 'table_row') return typeof (value as any).tableIdOrSlug === 'string' && typeof (value as any).key === 'string'
  if (kind === 'task_card') return typeof (value as any).cardId === 'string'
  return false
}

/**
 * Format a cell value for display (used by DataTable and export adapters).
 */
export function formatDataCellValue(
  value: DataCellValue,
  format: DataCellFormat = 'text'
): string {
  if (value === null || value === undefined) {
    return '-'
  }

  if (isRefValue(value)) {
    const label = typeof (value as any).label === 'string' && (value as any).label.trim().length > 0 ? String((value as any).label) : ''
    if (label) return label
    if (value.kind === 'task_card') return String(value.cardId || '')
    return String(value.key || '')
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
  }

  if (format === 'date') {
    const dateInput: string | number | Date =
      value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? value : String(value)
    const asDate = new Date(dateInput)
    return Number.isNaN(asDate.getTime())
      ? String(value)
      : asDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (format === 'datetime') {
    const dateInput: string | number | Date =
      value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? value : String(value)
    const asDate = new Date(dateInput)
    return Number.isNaN(asDate.getTime())
      ? String(value)
      : asDate.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
  }

  if (format === 'percentage') {
    return `${(Number(value) * 100).toFixed(1)}%`
  }

  if (format === 'number') {
    return new Intl.NumberFormat('en-US').format(Number(value))
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}
