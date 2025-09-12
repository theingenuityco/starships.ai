'use client'

import { useState } from 'react'
import { AgentModel } from '@starships/protocol'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X, Filter, ChevronDown } from 'lucide-react'

interface FilterState {
  category?: 'general' | 'coding' | 'creative' | 'analysis' | 'support'
  tags: string[]
  isPublic?: boolean
  searchQuery: string
}

interface AgentFiltersProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  availableTags: string[]
}

export function AgentFilters({ filters, onFiltersChange, availableTags }: AgentFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const updateFilter = (key: keyof FilterState, value: FilterState[keyof FilterState]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const addTag = (tag: string) => {
    if (!filters.tags.includes(tag)) {
      updateFilter('tags', [...filters.tags, tag])
    }
  }

  const removeTag = (tag: string) => {
    updateFilter(
      'tags',
      filters.tags.filter(t => t !== tag)
    )
  }

  const clearFilters = () => {
    onFiltersChange({
      tags: [],
      searchQuery: filters.searchQuery, // Keep search query
    })
  }

  const hasActiveFilters = filters.category || filters.tags.length > 0 || filters.isPublic !== undefined

  return (
    <div className="border rounded-lg bg-muted/10 shadow-sm overflow-hidden">
      {/* Filter Header */}
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-2 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              {(filters.category ? 1 : 0) + (filters.isPublic !== undefined ? 1 : 0) + filters.tags.length} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              onClick={e => {
                e.stopPropagation()
                clearFilters()
              }}
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Filter Content */}
      {isExpanded && (
        <div className="p-4 border-t border-border/50 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category Filter */}
            <div>
              <label className="block text-xs font-medium mb-2">Category</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-9 px-3">
                    <span className="truncate mr-1">{filters.category ? filters.category.charAt(0).toUpperCase() + filters.category.slice(1) : 'All categories'}</span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuRadioGroup value={filters.category || ''} onValueChange={value => updateFilter('category', value || undefined)}>
                    <DropdownMenuRadioItem value="">All categories</DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioItem value="general">General</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="coding">Coding</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="creative">Creative</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="analysis">Analysis</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="support">Support</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Visibility Filter */}
            <div>
              <label className="block text-xs font-medium mb-2">Visibility</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-9 px-3">
                    <span className="truncate mr-1">{filters.isPublic === undefined ? 'All agents' : filters.isPublic ? 'Public only' : 'Private only'}</span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuRadioGroup
                    value={filters.isPublic === undefined ? '' : filters.isPublic.toString()}
                    onValueChange={value => updateFilter('isPublic', value === '' ? undefined : value === 'true')}
                  >
                    <DropdownMenuRadioItem value="">All agents</DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioItem value="true">Public only</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="false">Private only</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Tags Filter */}
            <div>
              <label className="block text-xs font-medium mb-2">Tags</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-9 px-3">
                    <span className="truncate mr-1">Add tag filter</span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuLabel>Available Tags</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableTags.length === 0 ? (
                    <DropdownMenuItem disabled>No tags available</DropdownMenuItem>
                  ) : (
                    availableTags
                      .filter(tag => !filters.tags.includes(tag))
                      .map(tag => (
                        <DropdownMenuItem key={tag} onClick={() => addTag(tag)}>
                          {tag.charAt(0).toUpperCase() + tag.slice(1)}
                        </DropdownMenuItem>
                      ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Active Tag Filters */}
          {filters.tags.length > 0 && (
            <div>
              <label className="block text-xs font-medium mb-2">Active tag filters:</label>
              <div className="flex flex-wrap gap-1.5">
                {filters.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                    {tag.charAt(0).toUpperCase() + tag.slice(1)}
                    <button onClick={() => removeTag(tag)} className="ml-1 hover:bg-muted rounded-full">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
