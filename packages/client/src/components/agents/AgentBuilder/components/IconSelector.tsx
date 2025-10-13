'use client'


import React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DEFAULT_ICONS } from '../constants'

interface IconSelectorProps {
  selectedIcon: string
  onIconChange: (icon: string) => void
}

export const IconSelector: React.FC<IconSelectorProps> = ({ selectedIcon, onIconChange }) => {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Icon</Label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {DEFAULT_ICONS.map(icon => (
          <button
            key={icon}
            type="button"
            onClick={() => onIconChange(icon)}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all duration-200 border',
              selectedIcon === icon ? 'bg-primary/20 border-primary/50 shadow-sm scale-110' : 'bg-muted/30 border-border/40 hover:bg-muted/50 hover:border-primary/40'
            )}
          >
            {icon}
          </button>
        ))}
      </div>
      <Input placeholder="Custom emoji..." value={selectedIcon} onChange={e => onIconChange(e.target.value)} className="text-xs" maxLength={2} />
    </div>
  )
}
