'use client'

import * as React from 'react'
import Icon from '@/components/primitives/Icon'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type FilterOption = { value: string; label: string }

export function MobileBottomFilterBar(props: {
  /** Current filter value */
  filterValue: string
  /** Called when user selects a filter option */
  onFilterChange: (value: string) => void
  /** Options shown in the dropdown */
  filterOptions: FilterOption[]
  /** Optional label shown when no value */
  filterPlaceholder?: string
  /** Optional search value; when provided, renders the search input */
  searchValue?: string
  /** Search change handler (required when searchValue is provided) */
  onSearchChange?: (next: string) => void
  /** Search placeholder */
  searchPlaceholder?: string
  /** Max content width (defaults to ship pages width) */
  maxWidthClassName?: string
  className?: string
}) {
  const {
    filterValue,
    onFilterChange,
    filterOptions,
    filterPlaceholder = 'Filter',
    searchValue,
    onSearchChange,
    searchPlaceholder = 'Search',
    maxWidthClassName = 'max-w-4xl',
    className,
  } = props

  const showSearch = typeof searchValue === 'string'

  return (
    <div
      className={cn(
        'md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/60',
        'bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75',
        className
      )}
    >
      <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className={cn('mx-auto w-full', maxWidthClassName)}>
          <div className="flex items-center gap-2 min-w-0">
            {showSearch ? (
              <div className="relative min-w-0 flex-1">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                <Input
                  value={searchValue}
                  onChange={e => onSearchChange?.(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="pl-9 h-10 py-2 text-[13px] rounded-2xl border-border/60 bg-background/80 shadow-sm"
                  aria-label={searchPlaceholder}
                />
              </div>
            ) : (
              <div className="min-w-0 flex-1 text-xs text-muted-foreground px-1">{filterPlaceholder}</div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center justify-center h-10 w-10 rounded-2xl border border-border/60 bg-background/80 shadow-sm',
                    'text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors'
                  )}
                  aria-label={filterPlaceholder}
                  title={filterPlaceholder}
                >
                  <Icon name="filter" className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={10} className="w-56">
                <DropdownMenuRadioGroup value={filterValue} onValueChange={onFilterChange}>
                  {filterOptions.map(opt => (
                    <DropdownMenuRadioItem key={opt.value} value={opt.value} className="cursor-pointer">
                      {opt.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}

