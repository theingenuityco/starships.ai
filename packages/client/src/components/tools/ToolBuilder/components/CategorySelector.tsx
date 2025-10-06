'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ToolTemplateCategory } from '@starships/protocol'
import { getCategoryIcon, getCategoryColor } from '../utils/categoryHelpers'
import { CATEGORIES } from '../constants'

interface CategorySelectorProps {
  selectedCategory: ToolTemplateCategory
  onCategoryChange: (category: ToolTemplateCategory) => void
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({ selectedCategory, onCategoryChange }) => {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Category</Label>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <Badge
            key={cat}
            variant="outline"
            className={cn(
              'cursor-pointer transition-all duration-200 gap-1 px-2 py-0.5 rounded-full text-xs [&>svg]:w-3 [&>svg]:h-3',
              selectedCategory === cat ? cn('shadow-sm hover:shadow-md hover:brightness-110', getCategoryColor(cat)) : 'hover:bg-muted/50 hover:border-primary/40'
            )}
            onClick={() => onCategoryChange(cat)}
          >
            {getCategoryIcon(cat)}
            <span className="capitalize">{cat}</span>
          </Badge>
        ))}
      </div>
    </div>
  )
}
