'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import Icon from '@/components/primitives/Icon'

export function CapabilitiesLegendTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="What do the capability colors mean?"
        >
          <Icon name="info" className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-xs p-3 space-y-2 text-left bg-popover border border-border text-popover-foreground shadow-md">
        <p className="text-xs font-medium">Permission defaults—editable after you deploy.</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            <span>Always allow</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
            <span>Ask first</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden />
            <span>Never</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
