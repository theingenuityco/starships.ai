'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Icon from '@/components/primitives/Icon'

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
}

const formatValue = (value: DataCellValue, format: DataColumn['format'] = 'text'): string => {
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

export function DataTable({
  columns,
  data,
  title,
  description,
  pageSize = 10,
  striped = true,
  className,
}: DataTableProps): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(data.length / pageSize))
  const pageStart = pageSize === 0 ? 0 : (currentPage - 1) * pageSize
  const pageEnd = pageSize === 0 ? data.length : pageStart + pageSize
  const visibleRows = data.slice(pageStart, pageEnd)

  return (
    <Card className={cn('shadow-sm border-border/50', className)}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-md border">
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
                      )}
                    >
                      {columns.map(column => (
                        <td
                          key={`${tableRowIndex}-${column.key}`}
                          className="px-4 py-3 text-sm text-left whitespace-normal break-words"
                        >
                          {formatValue(row[column.key], column.format)}
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
      </CardContent>
    </Card>
  )
}

export default DataTable
