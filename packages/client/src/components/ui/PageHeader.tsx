'use client'

import React from 'react'
import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  icon?: string
  iconWeight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  title: React.ReactNode
  actions?: React.ReactNode
  // Pass false to suppress the mobile nav toggle, or a ReactNode to override it
  mobileToggle?: React.ReactNode | false
  className?: string
}

export function PageHeader({ icon, iconWeight = 'bold', title, actions, mobileToggle, className }: PageHeaderProps) {
  const toggleSlot =
    mobileToggle === false ? null : mobileToggle != null ? mobileToggle : <MobileNavToggleButton className="mx-1" />

  return (
    <div className={cn('sticky top-0 z-10 border-b border-border/60', className)}>
      <div className="h-10 px-4 flex items-center justify-between gap-2.5 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          {toggleSlot != null && <span className="flex-shrink-0 md:hidden">{toggleSlot}</span>}
          {icon && <Icon name={icon} weight={iconWeight} className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        </div>
        {actions != null && <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
