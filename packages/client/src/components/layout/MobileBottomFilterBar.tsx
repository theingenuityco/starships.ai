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
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  // Expose the rendered bar height as a CSS var so pages can pad content
  // to avoid being covered by the fixed-position footer.
  React.useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const varName = '--mobile-bottom-filter-bar-height'
    const apply = () => {
      try {
        const h = Math.ceil(el.getBoundingClientRect().height)
        if (h > 0) document.documentElement.style.setProperty(varName, `${h}px`)
      } catch {
        /* ignore */
      }
    }

    apply()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => apply()) : null
    ro?.observe(el)
    window.addEventListener('resize', apply)
    return () => {
      try {
        ro?.disconnect()
      } catch {
        /* ignore */
      }
      window.removeEventListener('resize', apply)
      // Best-effort cleanup (safe even if another page sets it later).
      try {
        document.documentElement.style.removeProperty(varName)
      } catch {
        /* ignore */
      }
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className={cn(
        'md:hidden fixed inset-x-0 bottom-0 z-40',
        // Match mobile conversation composer: solid bar with subtle separation.
        'bg-card border-t border-border/40',
        className
      )}
    >
      <div className="px-0 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <div className={cn('mx-auto w-full', maxWidthClassName)}>
          <div
            className={cn(
              // Mirror `ConversationMessageInput` mobile composer container.
              // Mobile: only a top border (flush to screen edges).
              'relative bg-card shadow-sm border-t border-border/80 border-x-0 border-b-0 rounded-none',
              'focus-within:border-primary/70'
            )}
          >
            <div className="flex items-center gap-2 pl-3 pr-2 py-2.5">
              {/* Search */}
              {showSearch ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Match conversation composer icon affordances */}
                  <span className="p-1.5 rounded-lg text-muted-foreground pointer-events-none" aria-hidden="true">
                    <Icon name="search" className="h-5 w-5" />
                  </span>
                  <Input
                    value={searchValue}
                    onChange={e => onSearchChange?.(e.target.value)}
                    placeholder={searchPlaceholder}
                    className={cn(
                      // Make the input feel like the conversation composer: borderless, transparent, no shadow.
                      // Match `ConversationMessageInput` text styling (`text-sm leading-relaxed`).
                      'h-7 px-0 py-0 text-sm leading-relaxed text-foreground bg-transparent border-0 shadow-none',
                      'focus-visible:ring-0 focus-visible:ring-offset-0 outline-none',
                      // Match TipTap placeholder styling: muted foreground @ 70% opacity.
                      'placeholder:text-muted-foreground placeholder:opacity-70'
                    )}
                    aria-label={searchPlaceholder}
                  />
                </div>
              ) : (
                <div className="min-w-0 flex-1 text-xs text-muted-foreground">{filterPlaceholder}</div>
              )}

              {/* Filter (icon dropdown) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      // Match conversation input action buttons.
                      'p-1.5 rounded-lg transition-colors',
                      'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                    aria-label={filterPlaceholder}
                    title={filterPlaceholder}
                  >
                    <Icon name="filter" className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" sideOffset={12} className="w-56">
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
    </div>
  )
}

