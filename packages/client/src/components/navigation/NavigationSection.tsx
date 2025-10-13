'use client'

import { NavigationItem } from '@/components/navigation/NavigationItem'
import { motion } from 'motion/react'

interface NavigationSectionItem {
  href: string
  label: string
  icon: string
  isActive?: boolean
}

type RenderAfterFn = (item: NavigationSectionItem, index: number) => React.ReactNode

interface NavigationSectionProps {
  title: string
  items: NavigationSectionItem[]
  pathname: string
  renderAfter?: RenderAfterFn
}

export function NavigationSection({ title, items, pathname, renderAfter }: NavigationSectionProps) {
  return (
    <motion.div className="space-y-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {items.map((item, index) => {
        const { isActive: itemOverrideActive, ...rest } = item
        const isActive = itemOverrideActive ?? pathname === item.href

        return (
          <motion.div key={item.href} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: index * 0.05 }}>
            <NavigationItem {...rest} isActive={isActive} />
            {renderAfter ? renderAfter(item, index) : null}
          </motion.div>
        )
      })}
    </motion.div>
  )
}
