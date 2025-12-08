'use client'

import React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'

export type StandardSelectMode = 'single' | 'multiple'

export interface StandardSelectOption {
  value: string
  label?: React.ReactNode
  /**
   * Additional text used for filtering/search, e.g. description, aliases, etc.
   */
  keywords?: string
}

interface StandardSelectProps {
  mode?: StandardSelectMode
  value?: string | string[] | null
  onChange?: (value: string | string[]) => void
  /**
   * Optional callback fired when an option is toggled on/off.
   * Useful when selection needs side‑effects (e.g. server mutations).
   */
  onOptionToggle?: (value: string, wasSelected: boolean) => void
  options: StandardSelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  searchPlaceholder?: string
  emptyLabel?: string
  'aria-label'?: string
  /**
   * Custom trigger renderer. If omitted, a simple text summary is shown.
   */
  renderTriggerLabel?: (params: { selectedOptions: StandardSelectOption[]; mode: StandardSelectMode }) => React.ReactNode
  /**
   * Custom option renderer. If omitted, the option's label/value is rendered as plain text.
   */
  renderOptionLabel?: (option: StandardSelectOption, isSelected: boolean) => React.ReactNode
}

export const StandardSelect: React.FC<StandardSelectProps> = ({
  mode = 'single',
  value,
  onChange,
  onOptionToggle,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  triggerClassName,
  searchPlaceholder = 'Search...',
  emptyLabel = 'No options found.',
  'aria-label': ariaLabel,
  renderTriggerLabel,
  renderOptionLabel,
}) => {
  const [open, setOpen] = React.useState(false)

  const selectedValues = React.useMemo<string[]>(() => {
    if (value == null) return []
    if (Array.isArray(value)) return value
    return [value]
  }, [value])

  const byValue = React.useMemo(() => {
    const map = new Map<string, StandardSelectOption>()
    for (const opt of options) {
      map.set(opt.value, opt)
    }
    return map
  }, [options])

  const selectedOptions = React.useMemo(
    () => selectedValues.map(v => byValue.get(v)).filter(Boolean) as StandardSelectOption[],
    [selectedValues, byValue]
  )

  const handleSelect = (val: string) => {
    if (disabled) return

    const alreadySelected = selectedValues.includes(val)

    if (mode === 'single') {
      if (!alreadySelected) {
        onChange?.(val)
      }
      onOptionToggle?.(val, alreadySelected)
      setOpen(false)
      return
    }

    if (mode === 'multiple') {
      const next = alreadySelected ? selectedValues.filter(v => v !== val) : [...selectedValues, val]
      onChange?.(next)
      onOptionToggle?.(val, alreadySelected)
      return
    }
  }

  const defaultTriggerContent = () => {
    if (selectedOptions.length === 0) {
      return <span className="text-xs text-muted-foreground">{placeholder}</span>
    }

    if (mode === 'single') {
      const first = selectedOptions[0]
      return (
        <span className="text-xs truncate max-w-full">
          {first.label ?? first.value}
        </span>
      )
    }

    return (
      <span className="text-xs truncate max-w-full">
        {selectedOptions.map(o => (typeof o.label === 'string' ? o.label : o.value)).join(', ')}
      </span>
    )
  }

  return (
    <div className={cn('inline-flex', className)}>
      <Popover
        open={open}
        onOpenChange={next => {
          if (disabled) return
          setOpen(next)
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              'flex items-center justify-between rounded-xl h-7 px-2 border border-border/20 bg-background/80 text-left text-xs transition-colors',
              'hover:bg-muted/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              disabled && 'opacity-60 cursor-not-allowed hover:bg-background/80 hover:shadow-none',
              triggerClassName
            )}
            disabled={disabled}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {renderTriggerLabel ? renderTriggerLabel({ selectedOptions, mode }) : defaultTriggerContent()}
            </div>
            <Icon name="chevron-down" className="w-3 h-3 opacity-60 ml-1 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[360px] max-w-[90vw] p-1 frosted-glass-card rounded-xl shadow-frosted-lg"
        >
          <Command className="bg-transparent">
            <CommandInput placeholder={searchPlaceholder} />
            <CommandEmpty className="text-xs">{emptyLabel}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {options.map(opt => {
                  const isSelected = selectedValues.includes(opt.value)
                  const fallbackText = (() => {
                    if (typeof opt.label === 'string') return opt.label
                    if (React.isValidElement(opt.label)) return opt.value
                    return opt.value
                  })()

                  const searchValue = [opt.value, fallbackText, opt.keywords || ''].join(' ').trim()

                  return (
                    <CommandItem
                      key={opt.value}
                      value={searchValue}
                      onSelect={() => handleSelect(opt.value)}
                      className="text-xs px-2 py-1"
                    >
                      {renderOptionLabel ? (
                        renderOptionLabel(opt, isSelected)
                      ) : (
                        <div className="flex items-center gap-1">
                          {mode === 'multiple' && (
                            <Icon
                              name="check"
                              className={cn(
                                'w-3 h-3 text-primary transition-opacity',
                                isSelected ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                          )}
                          <span>{opt.label ?? opt.value}</span>
                        </div>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}


