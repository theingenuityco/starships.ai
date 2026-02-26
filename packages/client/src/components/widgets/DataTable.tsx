'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import Icon from '@/components/primitives/Icon'
import { adaptDataTable, downloadTableAsCsv, sanitizeFilename } from '@/lib/export'
import { formatDataCellValue } from '@/lib/table-format'
import { toast } from 'sonner'

export type DataCellValue = string | number | boolean | null | undefined

export interface DataColumn {
  key: string
  label: string
  format?: 'text' | 'number' | 'currency' | 'date' | 'percentage'
}

export interface DataTableProps {
  columns: DataColumn[]
  data: Array<Record<string, DataCellValue>>
  title?: string
  description?: string
  pageSize?: number
  striped?: boolean
  className?: string
  onRowClick?: (payload: { row: Record<string, DataCellValue>; rowIndex: number }) => void
}

export function DataTable({
  columns,
  data,
  title,
  description,
  pageSize = 10,
  striped = true,
  className,
  onRowClick,
}: DataTableProps): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(data.length / pageSize))
  const pageStart = pageSize === 0 ? 0 : (currentPage - 1) * pageSize
  const pageEnd = pageSize === 0 ? data.length : pageStart + pageSize
  const visibleRows = data.slice(pageStart, pageEnd)

  const handleExportCsv = () => {
    try {
      const table = adaptDataTable(columns, data)
      const baseName = sanitizeFilename(title || 'data-table')
      const filename = `${baseName}-${Date.now()}.csv`
      downloadTableAsCsv(table, filename)
      toast.success('Table exported')
    } catch {
      toast.error('Export failed')
    }
  }

  const canExport = columns.length > 0 && data.length > 0
  const rowClickable = typeof onRowClick === 'function'

  return (
    <div className={cn('w-full max-w-none', className)}>
      <div className="space-y-4">
          {(title || canExport) && (
            <div className="flex items-center justify-between gap-2">
              {title && <h3 className="text-sm font-medium">{title}</h3>}
              {canExport && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCsv}
                      aria-label="Export table as CSV"
                      className="shrink-0"
                    >
                      <Icon name="download" className="w-3.5 h-3.5 mr-1.5" />
                      Export CSV
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download as CSV</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
          <div className="w-full max-w-none rounded-md border overflow-visible">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  {columns.map(column => (
                    <th key={column.key} className="border-b px-4 py-3 text-left text-sm font-medium whitespace-nowrap">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No data available
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row, tableRowIndex) => (
                    <tr
                      key={`${tableRowIndex}-${row[columns[0]?.key ?? 'row'] ?? tableRowIndex}`}
                      className={cn(
                        'border-b last:border-0',
                        striped && tableRowIndex % 2 === 0 && 'bg-muted/20',
                        'transition-colors hover:bg-muted/30',
                        rowClickable && 'cursor-pointer',
                      )}
                      onClick={
                        rowClickable
                          ? () =>
                              onRowClick({
                                row,
                                rowIndex: pageSize === 0 ? tableRowIndex : pageStart + tableRowIndex,
                              })
                          : undefined
                      }
                    >
                      {columns.map(column => (
                        <td
                          key={`${tableRowIndex}-${column.key}`}
                          className="px-4 py-3 text-sm text-left whitespace-normal break-words"
                        >
                          {formatDataCellValue(row[column.key], column.format ?? 'text')}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pageSize > 0 && totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                <Icon name="chevron-left" className="h-4 w-4" />
              </Button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                <Icon name="chevron-right" className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
    </div>
  )
}

export default DataTable
