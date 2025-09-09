'use client'

import { NavigationItem } from '@/components/navigation/NavigationItem'
import { motion } from 'motion/react'

interface NavigationSectionProps {
  title: string
  items: Array<{
    href: string
    label: string
    icon: React.ComponentType<{ className?: string }>
  }>
  pathname: string
}

export function NavigationSection({ title, items, pathname }: NavigationSectionProps) {
  return (
    <motion.div className="space-y-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="space-y-1">
        {items.map((item, index) => (
          <motion.div key={item.href} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: index * 0.05 }}>
            <NavigationItem {...item} isActive={pathname === item.href} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
