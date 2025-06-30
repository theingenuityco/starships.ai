'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Filter, RotateCcw } from 'lucide-react';
import { ConstraintsGridProps, Constraint, ConstraintFilters, ConstraintSortBy } from '../shared/types';
import { ConstraintCategories } from './ConstraintCategories';
import { ConstraintList } from './ConstraintList';
import { ConstraintCreator } from './ConstraintCreator';

export function ConstraintsGrid({
  className = '',
  constraints,
  onConstraintCreate,
  onConstraintUpdate,
  onConstraintDelete,
  loading = false,
  error
}: ConstraintsGridProps) {
  const [activeCategory, setActiveCategory] = useState<Constraint['type']>('resource');
  const [showCreator, setShowCreator] = useState(false);
  const [filters, setFilters] = useState<ConstraintFilters>({});
  const [sortBy, setSortBy] = useState<ConstraintSortBy>('severity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter and sort constraints by active category
  const filteredConstraints = useMemo(() => {
    let filtered = constraints.filter(constraint => constraint.type === activeCategory);

    // Apply filters
    if (filters.severity?.length) {
      filtered = filtered.filter(c => filters.severity!.includes(c.severity));
    }
    if (filters.isActive !== undefined) {
      filtered = filtered.filter(c => c.isActive === filters.isActive);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy];
      let bValue: any = b[sortBy];

      // Handle special sorting cases
      if (sortBy === 'severity') {
        const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        aValue = severityOrder[a.severity];
        bValue = severityOrder[b.severity];
      } else if (sortBy === 'createdAt') {
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [constraints, activeCategory, filters, sortBy, sortOrder]);

  // Category statistics
  const categoryStats = useMemo(() => {
    const stats = constraints.reduce((acc, constraint) => {
      if (!acc[constraint.type]) {
        acc[constraint.type] = { total: 0, active: 0, critical: 0 };
      }
      acc[constraint.type].total++;
      if (constraint.isActive) acc[constraint.type].active++;
      if (constraint.severity === 'critical') acc[constraint.type].critical++;
      return acc;
    }, {} as Record<Constraint['type'], { total: number; active: number; critical: number }>);

    return stats;
  }, [constraints]);

  const clearFilters = () => {
    setFilters({});
    setSortBy('severity');
    setSortOrder('desc');
  };

  const hasActiveFilters = Object.keys(filters).length > 0 || sortBy !== 'severity' || sortOrder !== 'desc';

  if (error) {
    return (
      <Card className={`border-red-200 ${className}`}>
        <CardContent className="p-4">
          <div className="text-red-600 text-sm">Error loading constraints: {error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">Constraints Grid</CardTitle>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 px-2 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreator(true)}
              className="h-7 px-2 text-xs"
              disabled={loading}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Constraint
            </Button>
          </div>
        </div>
        
        {/* Category Navigation */}
        <ConstraintCategories
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          categoryStats={categoryStats}
        />
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Constraints List */}
        <ConstraintList
          constraints={filteredConstraints}
          onConstraintUpdate={onConstraintUpdate}
          onConstraintDelete={onConstraintDelete}
          loading={loading}
          filters={filters}
          onFiltersChange={setFilters}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={setSortBy}
          onSortOrderChange={setSortOrder}
        />
        
        {/* Empty State */}
        {filteredConstraints.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-sm">No constraints found for {activeCategory} category</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreator(true)}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add your first {activeCategory} constraint
            </Button>
          </div>
        )}
      </CardContent>
      
      {/* Constraint Creator Modal */}
      {showCreator && (
        <ConstraintCreator
          isOpen={showCreator}
          onClose={() => setShowCreator(false)}
          onConstraintCreate={onConstraintCreate}
          initialCategory={activeCategory}
        />
      )}
    </Card>
  );
} 