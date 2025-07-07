'use client';

import { NavigationItem } from './NavigationItem';

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
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
        {title}
      </h4>
      <div className="space-y-2">
        {items.map((item) => (
          <NavigationItem
            key={item.href}
            {...item}
            isActive={pathname === item.href}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}