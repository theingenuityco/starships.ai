'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type InputWidgetProps = {
  label?: string
  placeholder?: string
  value?: string
  type?: React.HTMLInputTypeAttribute
  disabled?: boolean
  className?: string
  inputClassName?: string
  onChange?: (payload: { value: string }) => void
}

export function InputWidget(props: InputWidgetProps) {
  const { label, placeholder, value, type = 'text', disabled, className, inputClassName, onChange } = props
  const id = React.useId()

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
      ) : null}
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value ?? ''}
        disabled={disabled}
        className={inputClassName}
        onChange={e => onChange?.({ value: e.target.value })}
      />
    </div>
  )
}

