'use client';

import { NavigationItem } from './NavigationItem';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

interface NavigationSectionProps {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: any;
    status: string;
  }>;
  pathname: string;
  compact?: boolean;
}

export function NavigationSection({ 
  title, 
  items, 
  pathname, 
  compact = false 
}: NavigationSectionProps) {
  return (
    <motion.div 
      className="space-y-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2 px-3 group">
        <ChevronRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {title}
        </h4>
      </div>
      <div className="space-y-1">
        {items.map((item, index) => (
          <motion.div
            key={item.href}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
          >
            <NavigationItem
              {...item}
              isActive={pathname === item.href}
              compact={compact}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}