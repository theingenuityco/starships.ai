'use client'

import React from 'react'
import { CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

export interface UsageDetailsHeaderProps {
  isDaily: boolean
  modeDayModel: boolean
  onToggle: (checked: boolean) => void
}

export function UsageDetailsHeader({ isDaily, modeDayModel, onToggle }: UsageDetailsHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="text-base">Usage Details</CardTitle>
        <CardDescription>{isDaily ? 'Aggregated by Day' : 'Aggregated by Day and Model'}</CardDescription>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Day</span>
        <Switch checked={modeDayModel} onCheckedChange={onToggle} />
        <span className="text-xs text-muted-foreground">Day + Model</span>
      </div>
    </div>
  )
}

export default UsageDetailsHeader
