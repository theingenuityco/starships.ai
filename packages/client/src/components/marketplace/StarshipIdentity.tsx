'use client'

import React from 'react'

import { cn } from '@/lib/utils'
import { getStarshipInitials } from '@/lib/starshipInitials'

export type StarshipIdentity = { name?: string; slug?: string; id?: string }

export function StarshipMonogram({ starship, disabled }: { starship: StarshipIdentity; disabled?: boolean }) {
  const initials = getStarshipInitials(starship)
  return (
    <div
      className={cn(
        'h-10 w-10 shrink-0 rounded-xl border flex items-center justify-center text-[12px] font-semibold tabular-nums',
        disabled ? 'border-border/60 bg-muted/20 text-muted-foreground' : 'border-primary/25 bg-primary/10 text-primary'
      )}
      aria-hidden
    >
      {initials}
    </div>
  )
}

export function StarshipPickerIcon({ starship, disabled }: { starship: StarshipIdentity; disabled?: boolean }) {
  const initials = getStarshipInitials(starship)
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 ring-1 ring-border/40 flex-shrink-0',
        disabled && 'opacity-60'
      )}
    >
      <span className="text-sm font-semibold text-primary tabular-nums">{initials}</span>
    </div>
  )
}

