'use client'

import React from 'react'
import { Button } from '@/components/ui/button'

export type ButtonWidgetProps = {
  label?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  disabled?: boolean
  className?: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
}

/**
 * NOTE: In the dynamic view runtime, button actions are wired via event handlers + sandbox.
 * This base widget only renders the button; click wiring is added by the runtime wrapper.
 */
export function ButtonWidget(props: ButtonWidgetProps) {
  const { label = 'Button', variant, size, disabled, className, onClick } = props
  return (
    <Button type="button" variant={variant} size={size} disabled={disabled} className={className} onClick={onClick}>
      {label}
    </Button>
  )
}

