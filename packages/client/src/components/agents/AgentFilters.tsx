'use client'

import { Agent } from '@starships/protocol'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X, Filter } from 'lucide-react'

interface FilterState {
  category?: Agent['category']
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
  const updateFilter = (key: keyof FilterState, value: any) => {
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

  const hasActiveFilters =
    filters.category || filters.tags.length > 0 || filters.isPublic !== undefined

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        {hasActiveFilters && (
          <Button onClick={clearFilters} size="sm" variant="ghost">
            Clear All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Category Filter */}
        <div>
          <label className="block text-xs font-medium mb-1">Category</label>
          <Select
            value={filters.category || ''}
            onValueChange={value => updateFilter('category', value || undefined)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="coding">Coding</SelectItem>
              <SelectItem value="creative">Creative</SelectItem>
              <SelectItem value="analysis">Analysis</SelectItem>
              <SelectItem value="support">Support</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Visibility Filter */}
        <div>
          <label className="block text-xs font-medium mb-1">Visibility</label>
          <Select
            value={filters.isPublic === undefined ? '' : filters.isPublic.toString()}
            onValueChange={value =>
              updateFilter('isPublic', value === '' ? undefined : value === 'true')
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All agents</SelectItem>
              <SelectItem value="true">Public only</SelectItem>
              <SelectItem value="false">Private only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tags Filter */}
        <div>
          <label className="block text-xs font-medium mb-1">Tags</label>
          <Select onValueChange={addTag}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Add tag filter" />
            </SelectTrigger>
            <SelectContent>
              {availableTags
                .filter(tag => !filters.tags.includes(tag))
                .map(tag => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Tag Filters */}
      {filters.tags.length > 0 && (
        <div>
          <label className="block text-xs font-medium mb-2">Active tag filters:</label>
          <div className="flex flex-wrap gap-1">
            {filters.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <button onClick={() => removeTag(tag)}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
