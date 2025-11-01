'use client'

import { NavigationItem } from '@/components/navigation/NavigationItem'
import { motion } from 'motion/react'

interface NavigationSectionItem {
  href: string
  label: string
  icon: string
  isActive?: boolean
  onClick?: () => void
  special?: boolean
}

type RenderAfterFn = (item: NavigationSectionItem, index: number) => React.ReactNode

interface NavigationSectionProps {
  title: string
  items: NavigationSectionItem[]
  pathname: string
  renderAfter?: RenderAfterFn
  showLabels?: boolean
  expanded?: boolean
}

export function NavigationSection({ title, items, pathname, renderAfter, showLabels = false, expanded = false }: NavigationSectionProps) {
  return (
    <div className="space-y-1 w-full">
      {items.map((item, index) => {
        const { isActive: itemOverrideActive, ...rest } = item
        const isActive = itemOverrideActive ?? pathname === item.href

        return (
          <div key={item.href} className="w-full">
            <NavigationItem {...rest} isActive={isActive} showLabels={showLabels} expanded={expanded} onClick={item.onClick} special={item.special} />
            {renderAfter ? renderAfter(item, index) : null}
          </div>
        )
      })}
    </div>
  )
}
