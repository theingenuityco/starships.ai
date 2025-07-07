'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

interface NavigationItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: string;
  isActive: boolean;
  compact?: boolean;
}

export function NavigationItem({ 
  href, 
  label, 
  icon: Icon, 
  status, 
  isActive, 
  compact = false 
}: NavigationItemProps) {
  return (
    <Link href={href}>
      <motion.div
        className={`group relative ${compact ? 'px-2 py-1.5' : 'px-2 py-2'} rounded-lg transition-all duration-200 ${
          isActive 
            ? 'bg-primary/10 backdrop-blur-sm border border-primary/20' 
            : 'hover:bg-accent/30 hover:backdrop-blur-sm'
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            <Icon className={`${compact ? 'w-4 h-4' : 'w-4 h-4'} ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground transition-colors'}`} />
            {status === 'warning' && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            )}
            {status === 'active' && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </div>
          <span className={`font-medium ${compact ? 'text-sm' : 'text-sm'} truncate group-hover:text-foreground transition-colors`}>
            {label}
          </span>
        </div>
      </motion.div>
    </Link>
  );
}