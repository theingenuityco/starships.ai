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
        className={`group relative ${compact ? 'mx-3 px-3 py-2' : 'mx-3 px-3 py-2.5'} rounded-lg transition-all duration-300 ${
          isActive 
            ? 'bg-gradient-to-r from-primary/15 to-primary/10 backdrop-blur-sm shadow-sm border border-primary/20' 
            : 'hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm'
        }`}
        whileHover={{ scale: 1.02, x: 4 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Active indicator */}
        {isActive && (
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.3 }}
          />
        )}
        
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className={`p-2 rounded-lg transition-all duration-300 ${
              isActive 
                ? 'bg-primary/20' 
                : 'bg-muted/30 group-hover:bg-muted/50'
            }`}>
              <Icon className={`${compact ? 'w-4 h-4' : 'w-4 h-4'} ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`} />
            </div>
            {status === 'warning' && (
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse shadow-lg shadow-yellow-500/50" />
            )}
            {status === 'active' && (
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className={`font-semibold ${compact ? 'text-sm' : 'text-sm'} truncate block ${
              isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
            } transition-colors`}>
              {label}
            </span>
            {isActive && (
              <span className="text-xs text-primary/80">Active</span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}