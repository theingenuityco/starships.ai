'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Scale, Cog, Briefcase } from 'lucide-react';
import { Constraint } from '../shared/types';

interface ConstraintCategoriesProps {
  activeCategory: Constraint['type'];
  onCategoryChange: (category: Constraint['type']) => void;
  categoryStats: Record<Constraint['type'], { total: number; active: number; critical: number }>;
}

const CATEGORIES = [
  {
    type: 'resource' as const,
    label: 'Resource',
    icon: Zap,
    description: 'Power, crew, time limitations',
    color: 'text-yellow-600 dark:text-yellow-400'
  },
  {
    type: 'ethical' as const,
    label: 'Ethical',
    icon: Scale,
    description: 'Moral guidelines, rules of engagement',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    type: 'technical' as const,
    label: 'Technical',
    icon: Cog,
    description: 'System limitations, compatibility',
    color: 'text-gray-600 dark:text-gray-400'
  },
  {
    type: 'business' as const,
    label: 'Business',
    icon: Briefcase,
    description: 'Budget, partnerships, regulations',
    color: 'text-green-600 dark:text-green-400'
  }
];

export function ConstraintCategories({
  activeCategory,
  onCategoryChange,
  categoryStats
}: ConstraintCategoriesProps) {
  return (
    <div className="flex flex-wrap gap-1 mt-3">
      {CATEGORIES.map((category) => {
        const stats = categoryStats[category.type] || { total: 0, active: 0, critical: 0 };
        const isActive = activeCategory === category.type;
        const Icon = category.icon;
        
        return (
          <Button
            key={category.type}
            variant={isActive ? "default" : "ghost"}
            size="sm"
            onClick={() => onCategoryChange(category.type)}
            className={`
              h-auto p-2 flex flex-col items-start justify-start min-w-[120px] 
              ${isActive ? '' : 'hover:bg-muted/50'}
            `}
          >
            <div className="flex items-center gap-2 w-full">
              <Icon className={`h-4 w-4 ${isActive ? 'text-current' : category.color}`} />
              <span className="text-sm font-medium">{category.label}</span>
              {stats.total > 0 && (
                <Badge 
                  variant={isActive ? "secondary" : "outline"} 
                  className="h-5 text-xs px-1.5 ml-auto"
                >
                  {stats.total}
                </Badge>
              )}
            </div>
            
            {/* Statistics row */}
            {stats.total > 0 && (
              <div className="flex items-center gap-3 w-full mt-1 text-xs opacity-70">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  {stats.active} active
                </span>
                {stats.critical > 0 && (
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    {stats.critical} critical
                  </span>
                )}
              </div>
            )}
            
            {/* Description for empty states */}
            {stats.total === 0 && !isActive && (
              <div className="text-xs opacity-60 mt-1 text-left">
                {category.description}
              </div>
            )}
          </Button>
        );
      })}
    </div>
  );
} 