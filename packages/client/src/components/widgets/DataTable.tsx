'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import Icon from '@/components/primitives/Icon'
import { adaptDataTable, downloadTableAsCsv, sanitizeFilename } from '@/lib/export'
import { formatDataCellValue } from '@/lib/table-format'
import { toast } from 'sonner'

export type DataCellValue = string | number | boolean | null | undefined

export interface DataColumn {
  key: string
  label: string
  format?: 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percentage'
}

export interface DataTableProps {
  columns?: DataColumn[]
  data?: Array<Record<string, unknown>>
  title?: string
  description?: string
  pageSize?: number
  striped?: boolean
  className?: string
  onRowClick?: (payload: { row: Record<string, unknown>; rowIndex: number }) => void
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null

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
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>(null)
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(() => new Set())

  const safeColumns: DataColumn[] = Array.isArray(columns) ? columns : []
  const safeData: Array<Record<string, unknown>> = Array.isArray(data) ? data : []

  const visibleColumns = useMemo(() => {
    const hidden = hiddenColumnKeys
    const cols = safeColumns.filter((c) => !hidden.has(c.key))
    return cols.length > 0 ? cols : safeColumns
  }, [hiddenColumnKeys, safeColumns])

  useEffect(() => {
    // If columns change, keep hidden state valid.
    const colKeys = new Set(safeColumns.map((c) => c.key))
    setHiddenColumnKeys((prev) => {
      if (prev.size === 0) return prev
      const next = new Set<string>()
      for (const k of prev) if (colKeys.has(k)) next.add(k)
      return next
    })
  }, [safeColumns])

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cols = visibleColumns
    let out = safeData

    if (q && cols.length > 0) {
      out = out.filter((row) => {
        for (const col of cols) {
          const raw = (row as any)?.[col.key]
          const text = formatDataCellValue(raw, col.format ?? 'text').toLowerCase()
          if (text.includes(q)) return true
        }
        return false
      })
    }

    if (!sort || !sort.key) return out

    const sortCol = safeColumns.find((c) => c.key === sort.key) ?? visibleColumns.find((c) => c.key === sort.key)
    const fmt = sortCol?.format ?? 'text'

    const rankValue = (v: unknown): { kind: 'empty' } | { kind: 'number'; v: number } | { kind: 'date'; v: number } | { kind: 'string'; v: string } => {
      if (v === null || v === undefined) return { kind: 'empty' }
      if (typeof v === 'boolean') return { kind: 'number', v: v ? 1 : 0 }

      if (fmt === 'number' || fmt === 'currency' || fmt === 'percentage') {
        const n = Number(v)
        if (Number.isFinite(n)) return { kind: 'number', v: n }
        return { kind: 'string', v: String(v).toLowerCase() }
      }

      if (fmt === 'date' || fmt === 'datetime') {
        const t = new Date(v as any).getTime()
        if (Number.isFinite(t)) return { kind: 'date', v: t }
        return { kind: 'string', v: String(v).toLowerCase() }
      }

      if (typeof v === 'number' && Number.isFinite(v)) return { kind: 'number', v }
      return { kind: 'string', v: formatDataCellValue(v, fmt).toLowerCase() }
    }

    const dir = sort.dir === 'desc' ? -1 : 1
    return out
      .slice()
      .sort((a, b) => {
        const av = rankValue((a as any)?.[sort.key])
        const bv = rankValue((b as any)?.[sort.key])

        if (av.kind === 'empty' && bv.kind === 'empty') return 0
        if (av.kind === 'empty') return 1
        if (bv.kind === 'empty') return -1

        if (av.kind === bv.kind) {
          if (av.kind === 'number' || av.kind === 'date') return dir * (av.v - (bv as any).v)
          return dir * av.v.localeCompare((bv as any).v)
        }

        const order = (k: string) => (k === 'number' ? 0 : k === 'date' ? 1 : 2)
        return dir * (order(av.kind) - order(bv.kind))
      })
  }, [query, safeColumns, safeData, sort, visibleColumns])

  useEffect(() => {
    setCurrentPage(1)
  }, [query, sort, hiddenColumnKeys])

  const safePageSize = Number.isFinite(pageSize) ? Math.max(0, Math.floor(pageSize)) : 10
  const totalRows = safeData.length
  const filteredRows = filteredAndSorted.length
  const totalPages = safePageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredRows / safePageSize))
  const safeCurrentPage = Math.min(totalPages, Math.max(1, currentPage))
  const pageStart = safePageSize === 0 ? 0 : (safeCurrentPage - 1) * safePageSize
  const pageEnd = safePageSize === 0 ? filteredRows : pageStart + safePageSize
  const visibleRows = safePageSize === 0 ? filteredAndSorted : filteredAndSorted.slice(pageStart, pageEnd)

  const handleExportCsv = () => {
    try {
      const table = adaptDataTable(safeColumns, safeData)
      const baseName = sanitizeFilename(title || 'data-table')
      const filename = `${baseName}-${Date.now()}.csv`
      downloadTableAsCsv(table, filename)
      toast.success('Table exported')
    } catch {
      toast.error('Export failed')
    }
  }

  const canExport = safeColumns.length > 0 && safeData.length > 0
  const rowClickable = typeof onRowClick === 'function'

  return (
    <div className={cn('w-full max-w-none', className)}>
      <div className="space-y-4">
        {(title || description || canExport || safeColumns.length > 0) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {title && <h3 className="text-sm font-medium truncate">{title}</h3>}
                {description && <div className="text-xs text-muted-foreground truncate">{description}</div>}
                {safeColumns.length > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {query.trim() || hiddenColumnKeys.size > 0 ? (
                      <span>
                        Showing {filteredRows.toLocaleString()} of {totalRows.toLocaleString()} rows
                      </span>
                    ) : (
                      <span>{totalRows.toLocaleString()} rows</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {safeColumns.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="shrink-0" aria-label="Table columns">
                        <Icon name="list" className="w-3.5 h-3.5 mr-1.5" />
                        Columns
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[220px]">
                      <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {safeColumns.map((c) => {
                        const checked = !hiddenColumnKeys.has(c.key)
                        return (
                          <DropdownMenuCheckboxItem
                            key={c.key}
                            checked={checked}
                            onCheckedChange={(next) => {
                              setHiddenColumnKeys((prev) => {
                                const p = new Set(prev)
                                const shouldShow = Boolean(next)
                                if (shouldShow) p.delete(c.key)
                                else p.add(c.key)
                                // Never allow "hide everything" — if all are hidden, reset.
                                if (p.size >= safeColumns.length) return new Set()
                                return p
                              })
                            }}
                          >
                            <span className="truncate">{c.label}</span>
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                      <DropdownMenuSeparator />
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
                        onClick={() => setHiddenColumnKeys(new Set())}
                      >
                        Reset columns
                      </button>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

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
            </div>

            {safeColumns.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search rows…"
                    className="h-9 pl-9"
                  />
                </div>
                {query.trim() && (
                  <Button variant="outline" size="sm" onClick={() => setQuery('')} className="shrink-0">
                    Clear
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="w-full max-w-none rounded-md border overflow-auto">
          <table className="w-full min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/50">
              <tr>
                {visibleColumns.map((column) => {
                  const isSorted = sort?.key === column.key
                  const isNumeric = column.format === 'number' || column.format === 'currency' || column.format === 'percentage'
                  const label = column.label
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={cn(
                        'border-b px-4 py-2.5 whitespace-nowrap font-medium text-muted-foreground',
                        isNumeric ? 'text-right' : 'text-left'
                      )}
                    >
                      <button
                        type="button"
                        className={cn(
                          'group inline-flex items-center gap-2 select-none hover:text-foreground transition-colors',
                          isNumeric && 'ml-auto'
                        )}
                        onClick={() => {
                          setSort((prev) => {
                            if (!prev || prev.key !== column.key) return { key: column.key, dir: 'asc' }
                            if (prev.dir === 'asc') return { key: column.key, dir: 'desc' }
                            return null
                          })
                        }}
                        aria-label={`Sort by ${label}`}
                      >
                        <span>{label}</span>
                        <span className="inline-flex items-center">
                          {isSorted ? (
                            sort?.dir === 'asc' ? (
                              <Icon name="arrow-up" className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                            ) : (
                              <Icon name="arrow-down" className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                            )
                          ) : (
                            <span className="opacity-0 group-hover:opacity-60 transition-opacity">
                              <Icon name="chevron-up" className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </span>
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, visibleColumns.length)} className="px-4 py-10 text-center text-muted-foreground">
                    {query.trim() ? 'No matching rows' : 'No data available'}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, tableRowIndex) => (
                  <tr
                    key={`${pageStart + tableRowIndex}-${row[visibleColumns[0]?.key ?? 'row'] ?? tableRowIndex}`}
                    className={cn(
                      'border-b last:border-0',
                      striped && tableRowIndex % 2 === 0 && 'bg-muted/20',
                      'transition-colors hover:bg-muted/30',
                      rowClickable && 'cursor-pointer focus-within:ring-2 focus-within:ring-ring'
                    )}
                    onClick={
                      rowClickable
                        ? () =>
                            onRowClick({
                              row,
                              rowIndex: safePageSize === 0 ? tableRowIndex : pageStart + tableRowIndex,
                            })
                        : undefined
                    }
                  >
                    {visibleColumns.map((column) => {
                      const isNumeric = column.format === 'number' || column.format === 'currency' || column.format === 'percentage'
                      const value = formatDataCellValue((row as any)[column.key], column.format ?? 'text')
                      return (
                        <td
                          key={`${pageStart + tableRowIndex}-${column.key}`}
                          className={cn(
                            'px-4 py-2.5 align-top',
                            isNumeric ? 'text-right tabular-nums' : 'text-left',
                            'whitespace-normal break-words'
                          )}
                          title={value === '-' ? undefined : value}
                        >
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {safePageSize > 0 && totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage === 1}
            >
              <Icon name="chevron-left" className="h-4 w-4" />
            </Button>
            <span>
              Page {safeCurrentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safeCurrentPage === totalPages}
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
