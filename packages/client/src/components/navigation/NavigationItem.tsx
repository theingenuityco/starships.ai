'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

interface NavigationItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  compact?: boolean;
}

export function NavigationItem({ 
  href, 
  label, 
  icon: Icon, 
  isActive, 
  compact = false 
}: NavigationItemProps) {
  return (
    <Link href={href}>
      <motion.div
        className={`group relative mx-3 px-2 py-1.5 rounded-lg transition-all duration-300 ${
          isActive 
            ? 'bg-gradient-to-r from-primary/15 to-primary/10 backdrop-blur-sm shadow-sm border border-primary/20' 
            : 'hover:bg-gradient-to-r hover:from-muted/50 hover:to-muted/30 hover:shadow-sm'
        }`}
        whileHover={{ scale: 1.02, x: 4 }}
        whileTap={{ scale: 0.98 }}
      >
        
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex-shrink-0">
            <div className={`p-1.5 rounded-md transition-all duration-300 ${
              isActive 
                ? 'bg-primary/20' 
                : 'bg-muted/30 group-hover:bg-muted/50'
            }`}>
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`} />
            </div>
            {/* Status indicators removed for cleaner look */}
          </div>
          <div className="flex-1 min-w-0">
            <span className={`font-semibold ${compact ? 'text-sm' : 'text-sm'} truncate block ${
              isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
            } transition-colors`}>
              {label}
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}