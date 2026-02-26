'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export type TextareaWidgetProps = {
  label?: string
  placeholder?: string
  value?: string
  rows?: number
  disabled?: boolean
  className?: string
  textareaClassName?: string
  onChange?: (payload: { value: string }) => void
}

export function TextareaWidget(props: TextareaWidgetProps) {
  const { label, placeholder, value, rows, disabled, className, textareaClassName, onChange } = props
  const id = React.useId()

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
      ) : null}
      <Textarea
        id={id}
        placeholder={placeholder}
        value={value ?? ''}
        rows={rows}
        disabled={disabled}
        className={textareaClassName}
        onChange={e => onChange?.({ value: e.target.value })}
      />
    </div>
  )
}

