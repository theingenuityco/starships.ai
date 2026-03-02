'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Icon from '@/components/primitives/Icon'
import { adaptDataTable, downloadTableAsCsv, sanitizeFilename } from '@/lib/export'
import { formatDataCellValue } from '@/lib/table-format'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { toast } from 'sonner'

export type DataCellValue = string | number | boolean | null | undefined

export type DataColumnDataType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'enum' | 'reference' | 'formula'

export type DataColumnReferenceTarget =
  | { kind: 'dataset_row'; datasetIdOrSlug: string }
  | { kind: 'task_card' }

export interface DataColumn {
  key: string
  label: string
  format?: 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'percentage'
  dataType?: DataColumnDataType
  enumOptions?: string[]
  referenceTarget?: DataColumnReferenceTarget
}

type RowsCommitMeta =
  | { reason: 'edit_cell'; rowIndex: number; columnKey: string }
  | { reason: 'clear_cell'; rowIndex: number; columnKey: string }
  | { reason: 'paste'; startRowIndex: number; startColumnKey: string; rows: number; cols: number }

export interface DataTableProps {
  columns?: DataColumn[]
  data?: Array<Record<string, unknown>>
  title?: string
  description?: string
  pageSize?: number
  striped?: boolean
  className?: string
  onRowClick?: (payload: { row: Record<string, unknown>; rowIndex: number }) => void
  excelLike?: boolean
  editable?: boolean
  primaryKey?: string | null
  onCommitRows?: (payload: { rows: Array<Record<string, unknown>>; meta: RowsCommitMeta }) => Promise<void> | void
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null

type RefValue =
  | { kind: 'dataset_row'; datasetIdOrSlug: string; key: string; label?: string; url?: string }
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
  if (kind === 'dataset_row') return typeof (value as any).datasetIdOrSlug === 'string' && typeof (value as any).key === 'string'
  if (kind === 'task_card') return typeof (value as any).cardId === 'string'
  return false
}

function safeJsonString(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function inferIsoDateKind(value: unknown): 'date' | 'datetime' | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s) return null

  // Strict-ish ISO patterns to avoid false positives.
  // Date: 2026-03-01
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date'
  // Datetime: 2026-03-01T12:34 or 2026-03-01 12:34:56(.789)Z?
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) return 'datetime'
  return null
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
  excelLike = false,
  editable = false,
  primaryKey = null,
  onCommitRows,
}: DataTableProps): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState(1)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>(null)
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(() => new Set())
  const [draftData, setDraftData] = useState<Array<Record<string, unknown>>>(() => (Array.isArray(data) ? data : []))
  const rootRef = useRef<HTMLDivElement | null>(null)

  type CellPos = { r: number; c: number }
  type CellRange = { anchor: CellPos; focus: CellPos }
  const [selection, setSelection] = useState<CellRange | null>(null)
  const [editing, setEditing] = useState<null | { r: number; c: number; value: string }>(null)

  const safeColumns: DataColumn[] = Array.isArray(columns) ? columns : []
  const safeData: Array<Record<string, unknown>> = draftData

  useEffect(() => {
    setDraftData(Array.isArray(data) ? data : [])
  }, [data])

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

      const inferred = fmt === 'text' ? inferIsoDateKind(v) : null
      const effectiveFmt = inferred ?? fmt

      if (effectiveFmt === 'number' || effectiveFmt === 'currency' || effectiveFmt === 'percentage') {
        const n = Number(v)
        if (Number.isFinite(n)) return { kind: 'number', v: n }
        return { kind: 'string', v: String(v).toLowerCase() }
      }

      if (effectiveFmt === 'date' || effectiveFmt === 'datetime') {
        const t = new Date(v as any).getTime()
        if (Number.isFinite(t)) return { kind: 'date', v: t }
        return { kind: 'string', v: String(v).toLowerCase() }
      }

      if (typeof v === 'number' && Number.isFinite(v)) return { kind: 'number', v }
      return { kind: 'string', v: formatDataCellValue(v, effectiveFmt).toLowerCase() }
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
  const canEdit = Boolean(excelLike && editable && primaryKey && String(primaryKey).trim().length > 0 && typeof onCommitRows === 'function')

  const selectionRange = useMemo(() => {
    if (!selection) return null
    const r0 = Math.min(selection.anchor.r, selection.focus.r)
    const r1 = Math.max(selection.anchor.r, selection.focus.r)
    const c0 = Math.min(selection.anchor.c, selection.focus.c)
    const c1 = Math.max(selection.anchor.c, selection.focus.c)
    return { r0, r1, c0, c1 }
  }, [selection])

  const clampCell = (pos: CellPos, args?: { rows?: number; cols?: number }): CellPos => {
    const rows = args?.rows ?? visibleRows.length
    const cols = args?.cols ?? visibleColumns.length
    const r = Math.max(0, Math.min(Math.max(0, rows - 1), pos.r))
    const c = Math.max(0, Math.min(Math.max(0, cols - 1), pos.c))
    return { r, c }
  }

  const focusRoot = () => {
    rootRef.current?.focus?.()
  }

  const isCellSelected = (r: number, c: number): boolean => {
    if (!selectionRange) return false
    return r >= selectionRange.r0 && r <= selectionRange.r1 && c >= selectionRange.c0 && c <= selectionRange.c1
  }

  const cellDisplayText = (raw: unknown, column: DataColumn): string => {
    if (raw === null || raw === undefined) return ''
    if (isRefValue(raw)) {
      if (raw.kind === 'task_card') return String(raw.cardId || '')
      return String(raw.key || '')
    }
    if (typeof raw === 'object') return safeJsonString(raw)
    const baseFmt = column.format ?? 'text'
    const inferred = baseFmt === 'text' ? inferIsoDateKind(raw) : null
    return formatDataCellValue(raw, inferred ?? baseFmt)
  }

  const parseInputForColumn = (input: string, column: DataColumn): unknown => {
    const s = String(input ?? '')
    if (s.trim().length === 0) return undefined

    const t = column.dataType
    if (t === 'number') {
      const n = Number(s)
      return Number.isFinite(n) ? n : s
    }
    if (t === 'boolean') {
      const lower = s.trim().toLowerCase()
      if (['true', '1', 'yes', 'y'].includes(lower)) return true
      if (['false', '0', 'no', 'n'].includes(lower)) return false
      return s
    }
    if (t === 'json') {
      const trimmed = s.trim()
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return JSON.parse(trimmed)
        } catch {
          return s
        }
      }
      return s
    }
    if (t === 'enum') return s
    if (t === 'reference') {
      const target = column.referenceTarget
      const key = s.trim()
      if (!key) return undefined
      if (!target) return s
      if (target.kind === 'task_card') return { kind: 'task_card', cardId: key }
      return { kind: 'dataset_row', datasetIdOrSlug: target.datasetIdOrSlug, key }
    }
    if (t === 'formula') return undefined
    if (t === 'date' || t === 'datetime') return s
    return s
  }

  const updateRowInDraftData = (nextRow: Record<string, unknown>, previousRow: Record<string, unknown>): void => {
    const pk = primaryKey ? String(primaryKey).trim() : ''
    const pkVal = pk ? (nextRow as any)?.[pk] : undefined
    setDraftData((prev) => {
      const out = prev.slice()
      let idx = -1
      if (pk && pkVal !== undefined && pkVal !== null && String(pkVal).trim().length > 0) {
        idx = out.findIndex((r) => String((r as any)?.[pk] ?? '') === String(pkVal))
      }
      if (idx < 0) idx = out.findIndex((r) => r === previousRow)
      if (idx < 0) return prev
      out[idx] = nextRow
      return out
    })
  }

  const commitRows = async (rows: Array<Record<string, unknown>>, meta: RowsCommitMeta, revert?: () => void) => {
    if (typeof onCommitRows !== 'function') return
    try {
      await onCommitRows({ rows, meta })
    } catch (e) {
      revert?.()
      toast.error('Failed to save changes', { description: getSafeErrorMessage(e) })
    }
  }

  const commitCellEdit = async (pos: CellPos, value: string) => {
    if (!canEdit) return
    const row = visibleRows[pos.r]
    const col = visibleColumns[pos.c]
    if (!row || !col) return
    if (col.dataType === 'formula') return

    const pk = primaryKey ? String(primaryKey).trim() : ''
    if (!pk) return
    const pkVal = (row as any)?.[pk]
    if (pkVal === null || pkVal === undefined || String(pkVal).trim().length === 0) {
      toast.error('This dataset requires a primary key to edit rows')
      return
    }

    const parsed = parseInputForColumn(value, col)
    const prevRow = row
    const nextRow: Record<string, unknown> = { ...(row as any) }
    if (parsed === undefined) delete (nextRow as any)[col.key]
    else (nextRow as any)[col.key] = parsed

    updateRowInDraftData(nextRow, prevRow)
    await commitRows([nextRow], { reason: 'edit_cell', rowIndex: pos.r, columnKey: col.key }, () => {
      updateRowInDraftData(prevRow, nextRow)
    })
  }

  const clearSelectedCells = async () => {
    if (!canEdit) return
    if (!selectionRange) return
    const pk = primaryKey ? String(primaryKey).trim() : ''
    if (!pk) return

    const byPk = new Map<string, { prev: Record<string, unknown>; next: Record<string, unknown> }>()

    for (let r = selectionRange.r0; r <= selectionRange.r1; r++) {
      const row = visibleRows[r]
      if (!row) continue
      const pkVal = (row as any)?.[pk]
      if (pkVal === null || pkVal === undefined || String(pkVal).trim().length === 0) continue

      let nextRow: Record<string, unknown> = { ...(row as any) }
      for (let c = selectionRange.c0; c <= selectionRange.c1; c++) {
        const col = visibleColumns[c]
        if (!col) continue
        if (col.dataType === 'formula') continue
        delete (nextRow as any)[col.key]
      }

      const pkStr = String(pkVal)
      const prev = byPk.get(pkStr)?.prev ?? row
      byPk.set(pkStr, { prev, next: nextRow })
    }

    if (byPk.size === 0) return
    for (const entry of byPk.values()) updateRowInDraftData(entry.next, entry.prev)

    const rowsToCommit = Array.from(byPk.values()).map((v) => v.next)
    const topLeftColKey = visibleColumns[selectionRange.c0]?.key ?? ''
    await commitRows(
      rowsToCommit,
      { reason: 'clear_cell', rowIndex: selectionRange.r0, columnKey: topLeftColKey },
      () => {
        for (const entry of byPk.values()) updateRowInDraftData(entry.prev, entry.next)
      }
    )
  }

  const buildTsvFromSelection = (): string => {
    if (!selectionRange) return ''
    const lines: string[] = []
    for (let r = selectionRange.r0; r <= selectionRange.r1; r++) {
      const row = visibleRows[r]
      const parts: string[] = []
      for (let c = selectionRange.c0; c <= selectionRange.c1; c++) {
        const col = visibleColumns[c]
        const raw = row ? (row as any)?.[col?.key ?? ''] : undefined
        const text = col ? cellDisplayText(raw, col) : ''
        parts.push(text.replace(/\r?\n/g, ' '))
      }
      lines.push(parts.join('\t'))
    }
    return lines.join('\n')
  }

  const parseTsv = (text: string): string[][] => {
    const raw = String(text ?? '')
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n').filter((l) => l.length > 0)
    return lines.map((l) => l.split('\t'))
  }

  const renderCell = (raw: unknown, column: DataColumn): { node: React.ReactNode; title?: string } => {
    const baseFmt = column.format ?? 'text'
    const inferred = baseFmt === 'text' ? inferIsoDateKind(raw) : null
    const fmt = inferred ?? baseFmt

    if (raw === null || raw === undefined) {
      return { node: <span className="text-muted-foreground">—</span> }
    }

    if (isRefValue(raw)) {
      const label =
        typeof raw.label === 'string' && raw.label.trim().length > 0
          ? raw.label.trim()
          : raw.kind === 'task_card'
            ? String(raw.cardId || '')
            : String(raw.key || '')

      const chip = (
        <Badge variant="connected" className="gap-1 max-w-full">
          <Icon name="link" className="h-3.5 w-3.5" />
          <span className="truncate">{label}</span>
          {raw.url ? <Icon name="external-link" className="h-3.5 w-3.5 opacity-70" /> : null}
        </Badge>
      )

      if (raw.url) {
        return {
          node: (
            <a
              href={raw.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full hover:opacity-90"
              onClick={(e) => e.stopPropagation()}
            >
              {chip}
            </a>
          ),
          title: label,
        }
      }

      return { node: chip, title: label }
    }

    if (typeof raw === 'boolean') {
      const label = raw ? 'Yes' : 'No'
      return {
        node: (
          <Badge
            variant="secondary"
            className={cn(
              'border-transparent',
              raw ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
            )}
          >
            {label}
          </Badge>
        ),
        title: label,
      }
    }

    if (typeof raw === 'object') {
      const full = safeJsonString(raw)
      const preview = full.length > 200 ? `${full.slice(0, 200)}…` : full
      return {
        node: (
          <code className="block max-w-[42rem] rounded-md border bg-muted/30 px-2 py-1 text-xs font-mono text-foreground/90 line-clamp-2">
            {preview}
          </code>
        ),
        title: full,
      }
    }

    const text = formatDataCellValue(raw, fmt)

    if (fmt === 'date') {
      return {
        node: (
          <span className="inline-flex items-center gap-1.5 tabular-nums text-foreground">
            <Icon name="calendar" className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="line-clamp-1">{text}</span>
          </span>
        ),
        title: text,
      }
    }

    if (fmt === 'datetime') {
      return {
        node: (
          <span className="inline-flex items-center gap-1.5 tabular-nums text-foreground">
            <Icon name="clock" className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="line-clamp-1">{text}</span>
          </span>
        ),
        title: text,
      }
    }

    if (fmt === 'currency' || fmt === 'number' || fmt === 'percentage') {
      const n = Number(raw)
      return {
        node: (
          <span className={cn('tabular-nums', Number.isFinite(n) && n < 0 && 'text-destructive')}>
            {text}
          </span>
        ),
        title: text,
      }
    }

    return {
      node: <span className="block max-w-[52rem] line-clamp-2">{text}</span>,
      title: text,
    }
  }

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

        <div
          ref={rootRef}
          tabIndex={excelLike ? 0 : -1}
          className={cn(
            'w-full max-w-none rounded-md border overflow-auto outline-none',
            excelLike && 'focus-visible:ring-2 focus-visible:ring-ring'
          )}
          onKeyDown={(e) => {
            if (!excelLike) return
            if (editing) return
            if (visibleRows.length === 0 || visibleColumns.length === 0) return

            const key = e.key
            const metaKey = e.metaKey || e.ctrlKey
            const base = clampCell(selection?.focus ?? { r: 0, c: 0 })

            const setNext = (next: CellPos, extend: boolean) => {
              const clamped = clampCell(next)
              setSelection((prev) => {
                if (!prev) return { anchor: clamped, focus: clamped }
                if (extend) return { anchor: prev.anchor, focus: clamped }
                return { anchor: clamped, focus: clamped }
              })
            }

            if (metaKey && (key === 'c' || key === 'C')) return

            if (key === 'Enter' || key === 'F2') {
              if (!canEdit) return
              const r = base.r
              const c = base.c
              const row = visibleRows[r]
              const col = visibleColumns[c]
              if (!row || !col) return
              if (col.dataType === 'formula') return
              const current = cellDisplayText((row as any)?.[col.key], col)
              setEditing({ r, c, value: current })
              e.preventDefault()
              return
            }

            if (key === 'Backspace' || key === 'Delete') {
              if (!canEdit) return
              clearSelectedCells()
              e.preventDefault()
              return
            }

            if (key === 'ArrowUp') return void (e.preventDefault(), setNext({ r: base.r - 1, c: base.c }, e.shiftKey))
            if (key === 'ArrowDown') return void (e.preventDefault(), setNext({ r: base.r + 1, c: base.c }, e.shiftKey))
            if (key === 'ArrowLeft') return void (e.preventDefault(), setNext({ r: base.r, c: base.c - 1 }, e.shiftKey))
            if (key === 'ArrowRight') return void (e.preventDefault(), setNext({ r: base.r, c: base.c + 1 }, e.shiftKey))
            if (key === 'Tab') return void (e.preventDefault(), setNext({ r: base.r, c: base.c + (e.shiftKey ? -1 : 1) }, e.shiftKey))
          }}
          onCopy={(e) => {
            if (!excelLike) return
            if (!selectionRange) return
            const tsv = buildTsvFromSelection()
            if (!tsv) return
            e.preventDefault()
            e.clipboardData.setData('text/plain', tsv)
          }}
          onPaste={async (e) => {
            if (!excelLike) return
            if (!canEdit) return
            if (!selection) return
            const text = e.clipboardData.getData('text/plain')
            if (!text) return
            e.preventDefault()

            const grid = parseTsv(text)
            if (grid.length === 0) return

            const start = clampCell(selection.focus)
            const pk = primaryKey ? String(primaryKey).trim() : ''
            if (!pk) return

            const rowPatchesByPk = new Map<string, { prev: Record<string, unknown>; next: Record<string, unknown> }>()

            for (let dr = 0; dr < grid.length; dr++) {
              const vr = start.r + dr
              if (vr >= visibleRows.length) break
              const row = visibleRows[vr]
              if (!row) continue
              const pkVal = (row as any)?.[pk]
              if (pkVal === null || pkVal === undefined || String(pkVal).trim().length === 0) continue

              const nextRow: Record<string, unknown> = { ...(row as any) }
              for (let dc = 0; dc < grid[dr]!.length; dc++) {
                const vc = start.c + dc
                if (vc >= visibleColumns.length) break
                const col = visibleColumns[vc]
                if (!col) continue
                if (col.dataType === 'formula') continue
                const input = grid[dr]![dc] ?? ''
                const parsed = parseInputForColumn(input, col)
                if (parsed === undefined) delete (nextRow as any)[col.key]
                else (nextRow as any)[col.key] = parsed
              }

              const pkStr = String(pkVal)
              const prev = rowPatchesByPk.get(pkStr)?.prev ?? row
              rowPatchesByPk.set(pkStr, { prev, next: nextRow })
            }

            if (rowPatchesByPk.size === 0) return

            for (const entry of rowPatchesByPk.values()) updateRowInDraftData(entry.next, entry.prev)

            const rowsToCommit = Array.from(rowPatchesByPk.values()).map((v) => v.next)
            const startColumnKey = visibleColumns[start.c]?.key ?? ''
            await commitRows(
              rowsToCommit,
              { reason: 'paste', startRowIndex: start.r, startColumnKey, rows: grid.length, cols: grid[0]?.length ?? 0 },
              () => {
                for (const entry of rowPatchesByPk.values()) updateRowInDraftData(entry.prev, entry.next)
              }
            )
          }}
        >
          <table className="w-full min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/50">
              <tr>
                {excelLike && (
                  <th
                    scope="col"
                    className="sticky left-0 z-20 border-b border-r px-2 py-2.5 whitespace-nowrap font-medium text-muted-foreground bg-muted/60"
                    aria-label="Row numbers"
                  >
                    #
                  </th>
                )}
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
                  <td
                    colSpan={Math.max(1, visibleColumns.length) + (excelLike ? 1 : 0)}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
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
                    {excelLike && (
                      <td className="sticky left-0 z-10 border-r px-2 py-2.5 text-right tabular-nums text-muted-foreground bg-background/60">
                        {pageStart + tableRowIndex + 1}
                      </td>
                    )}
                    {visibleColumns.map((column, colIndex) => {
                      const isNumeric = column.format === 'number' || column.format === 'currency' || column.format === 'percentage'
                      const raw = (row as any)[column.key]
                      const rendered = renderCell(raw, column)
                      const selected = excelLike ? isCellSelected(tableRowIndex, colIndex) : false
                      const isEditingThis = Boolean(editing && editing.r === tableRowIndex && editing.c === colIndex)
                      return (
                        <td
                          key={`${pageStart + tableRowIndex}-${column.key}`}
                          className={cn(
                            'px-4 py-2.5 align-top',
                            isNumeric ? 'text-right tabular-nums' : 'text-left',
                            excelLike ? 'whitespace-nowrap' : 'whitespace-normal break-words',
                            excelLike && 'relative',
                            selected && 'bg-primary/10',
                            selected && 'outline outline-2 outline-primary/40 -outline-offset-2'
                          )}
                          title={rendered.title}
                          onMouseDown={(e) => {
                            if (!excelLike) return
                            // Prevent text selection while selecting ranges.
                            e.preventDefault()
                          }}
                          onClick={(e) => {
                            if (!excelLike) return
                            e.stopPropagation()
                            focusRoot()
                            const next = { r: tableRowIndex, c: colIndex }
                            setSelection((prev) => {
                              if (e.shiftKey && prev) return { anchor: prev.anchor, focus: next }
                              return { anchor: next, focus: next }
                            })
                          }}
                          onDoubleClick={(e) => {
                            if (!canEdit) return
                            if (column.dataType === 'formula') return
                            e.stopPropagation()
                            const current = cellDisplayText(raw, column)
                            setEditing({ r: tableRowIndex, c: colIndex, value: current })
                          }}
                        >
                          {isEditingThis ? (
                            <input
                              autoFocus
                              value={editing?.value ?? ''}
                              onChange={(e) => setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
                              onBlur={async () => {
                                const pos = { r: tableRowIndex, c: colIndex }
                                const val = editing?.value ?? ''
                                setEditing(null)
                                await commitCellEdit(pos, val)
                              }}
                              onKeyDown={async (e) => {
                                const key = e.key
                                const pos = { r: tableRowIndex, c: colIndex }
                                if (key === 'Escape') {
                                  setEditing(null)
                                  e.preventDefault()
                                  return
                                }
                                if (key === 'Enter' || key === 'Tab') {
                                  const val = editing?.value ?? ''
                                  setEditing(null)
                                  await commitCellEdit(pos, val)
                                  setSelection(() => {
                                    const next =
                                      key === 'Tab'
                                        ? clampCell({ r: pos.r, c: pos.c + (e.shiftKey ? -1 : 1) })
                                        : clampCell({ r: pos.r + 1, c: pos.c })
                                    return { anchor: next, focus: next }
                                  })
                                  e.preventDefault()
                                  return
                                }
                              }}
                              className={cn(
                                'w-full min-w-[6rem] rounded-sm border border-ring bg-background px-2 py-1 text-sm text-foreground shadow-sm',
                                isNumeric && 'text-right tabular-nums'
                              )}
                            />
                          ) : (
                            rendered.node
                          )}
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
