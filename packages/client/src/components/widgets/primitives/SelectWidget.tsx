'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type SelectOption = { value: string; label: string }

export type SelectWidgetProps = {
  label?: string
  placeholder?: string
  value?: string
  /**
   * Multiline text format:
   * - `value: Label`
   * - blank lines and lines starting with `#` are ignored
   */
  optionsText?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  onChange?: (payload: { value: string }) => void
}

function parseOptionsText(optionsText: string | undefined): SelectOption[] {
  const text = typeof optionsText === 'string' ? optionsText : ''
  const lines = text.split(/\r?\n/g)
  const out: SelectOption[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx === -1) {
      out.push({ value: line, label: line })
      continue
    }
    const value = line.slice(0, idx).trim()
    const label = line.slice(idx + 1).trim() || value
    if (!value) continue
    out.push({ value, label })
  }
  return out
}

export function SelectWidget(props: SelectWidgetProps) {
  const { label, placeholder, value, optionsText, disabled, className, triggerClassName, onChange } = props
  const id = React.useId()
  const options = React.useMemo(() => parseOptionsText(optionsText), [optionsText])

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
      ) : null}

      <Select value={value || undefined} onValueChange={v => onChange?.({ value: v })} disabled={disabled}>
        <SelectTrigger id={id} className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

