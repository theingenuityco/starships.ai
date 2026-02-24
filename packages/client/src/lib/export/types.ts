export interface ExportableTable {
  headers: string[]
  rows: string[][]
}

export interface DataColumnLike {
  key: string
  label: string
  format?: 'text' | 'number' | 'currency' | 'date' | 'percentage'
}

export type DataCellValue = string | number | boolean | null | undefined
