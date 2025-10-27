'use client'

import { NavigationItem } from '@/components/navigation/NavigationItem'
import { motion } from 'motion/react'

interface NavigationSectionItem {
  href: string
  label: string
  icon: string
  isActive?: boolean
  onClick?: () => void
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
    <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {items.map((item, index) => {
        const { isActive: itemOverrideActive, ...rest } = item
        const isActive = itemOverrideActive ?? pathname === item.href

        return (
          <motion.div key={item.href} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: index * 0.05 }}>
            <NavigationItem {...rest} isActive={isActive} showLabels={showLabels} expanded={expanded} onClick={item.onClick} />
            {renderAfter ? renderAfter(item, index) : null}
          </motion.div>
        )
      })}
    </motion.div>
  )
}
