'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export type CheckboxWidgetProps = {
  label?: string
  checked?: boolean
  disabled?: boolean
  className?: string
  onChange?: (payload: { checked: boolean }) => void
}

export function CheckboxWidget(props: CheckboxWidgetProps) {
  const { label, checked = false, disabled, className, onChange } = props
  const id = React.useId()

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={v => onChange?.({ checked: v === true })}
      />
      {label ? (
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
      ) : null}
    </div>
  )
}

