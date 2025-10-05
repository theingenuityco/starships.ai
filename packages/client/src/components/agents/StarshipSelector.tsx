'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUserStarships } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'
import type { StarshipModel } from '@starships/protocol'
import { AlertCircle, Loader2, Rocket } from 'lucide-react'

interface StarshipSelectorProps {
  value?: string
  onValueChange: (starshipId: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

export function StarshipSelector({ value, onValueChange, placeholder = 'Select a starship', disabled = false, className }: StarshipSelectorProps) {
  const { userId } = useAuth()
  const { data: starships = [], isLoading: loading, error } = useUserStarships(userId || '', !!userId)

  if (loading) {
    return (
      <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/5">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading starships...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2 p-3 border rounded-md bg-destructive/5 border-destructive/20">
        <AlertCircle className="w-4 h-4 text-destructive" />
        <span className="text-sm text-destructive">{error?.message || 'Failed to load starships'}</span>
      </div>
    )
  }

  if (starships.length === 0) {
    return (
      <div className="flex flex-col items-center space-y-2 p-4 border rounded-md bg-muted/5 text-center">
        <Rocket className="w-8 h-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">No starships available</p>
          <p className="text-xs text-muted-foreground mt-1">Create a starship first to deploy agents</p>
        </div>
      </div>
    )
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {starships.map((starship: StarshipModel) => (
          <SelectItem key={starship.id} value={starship.id}>
            <div className="flex items-center space-x-3 py-1">
              <span className="text-lg">🚀</span>
              <div className="font-medium">{starship.name}</div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
