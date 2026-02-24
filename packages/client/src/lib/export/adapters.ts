import type { ExportableTable } from './types'
import type { DataColumnLike, DataCellValue } from './types'
import { formatDataCellValue } from '../table-format'

/**
 * Adapt a DOM table element to ExportableTable (for markdown-rendered tables).
 */
export function adaptDomTable(tableElement: HTMLTableElement): ExportableTable {
  const rows: string[][] = []
  const allRows = Array.from(tableElement.querySelectorAll('tr'))

  for (const row of allRows) {
    const cells: string[] = []
    const cellElements = Array.from(row.querySelectorAll('th, td'))
    for (const cell of cellElements) {
      const plainText = (cell.textContent || (cell as HTMLElement).innerText || '').trim()
      cells.push(plainText)
    }
    if (cells.length > 0) {
      rows.push(cells)
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = rows[0]
  const dataRows = rows.length > 1 ? rows.slice(1) : []
  return { headers, rows: dataRows }
}

/**
 * Adapt DataTable props (columns + data) to ExportableTable.
 */
export function adaptDataTable(
  columns: DataColumnLike[],
  data: Array<Record<string, DataCellValue>>
): ExportableTable {
  const headers = columns.map((c) => c.label || c.key)
  const rows = data.map((row) =>
    columns.map((col) => formatDataCellValue(row[col.key], col.format ?? 'text'))
  )
  return { headers, rows }
}
