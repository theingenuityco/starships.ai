export type DataCellValue = string | number | boolean | null | undefined
export type DataCellFormat = 'text' | 'number' | 'currency' | 'date' | 'percentage'

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

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
  }

  if (format === 'date') {
    const asDate = new Date(value)
    return Number.isNaN(asDate.getTime())
      ? String(value)
      : asDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (format === 'percentage') {
    return `${(Number(value) * 100).toFixed(1)}%`
  }

  if (format === 'number') {
    return new Intl.NumberFormat('en-US').format(Number(value))
  }

  return String(value)
}
