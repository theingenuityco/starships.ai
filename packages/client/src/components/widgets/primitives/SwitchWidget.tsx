'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export type SwitchWidgetProps = {
  label?: string
  checked?: boolean
  disabled?: boolean
  size?: React.ComponentProps<typeof Switch>['size']
  className?: string
  onChange?: (payload: { checked: boolean }) => void
}

export function SwitchWidget(props: SwitchWidgetProps) {
  const { label, checked = false, disabled, size, className, onChange } = props
  const id = React.useId()

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Switch id={id} checked={checked} disabled={disabled} size={size} onCheckedChange={v => onChange?.({ checked: v })} />
      {label ? (
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
      ) : null}
    </div>
  )
}

