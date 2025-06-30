'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { ArrowUpDown, Filter, ChevronDown } from 'lucide-react';
import { ConstraintWithSeverity, ConstraintFilters, ConstraintSortBy, Constraint } from '../shared/types';
import { ConstraintItem } from './ConstraintItem';

interface ConstraintListProps {
  constraints: ConstraintWithSeverity[];
  onConstraintUpdate: (id: string, changes: Partial<Constraint>) => void;
  onConstraintDelete: (id: string) => void;
  loading?: boolean;
  filters: ConstraintFilters;
  onFiltersChange: (filters: ConstraintFilters) => void;
  sortBy: ConstraintSortBy;
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: ConstraintSortBy) => void;
  onSortOrderChange: (order: 'asc' | 'desc') => void;
}

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-gray-600' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
  { value: 'high', label: 'High', color: 'text-orange-600' },
  { value: 'critical', label: 'Critical', color: 'text-red-600' }
] as const;

const SORT_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'createdAt', label: 'Date Created' },
  { value: 'description', label: 'Description' },
  { value: 'type', label: 'Type' }
] as const;

export function ConstraintList({
  constraints,
  onConstraintUpdate,
  onConstraintDelete,
  loading = false,
  filters,
  onFiltersChange,
  sortBy,
  sortOrder,
  onSortChange,
  onSortOrderChange
}: ConstraintListProps) {
  const hasActiveFilters = (filters.severity?.length || 0) > 0 || filters.isActive !== undefined;

  const clearFilters = () => {
    onFiltersChange({});
  };

  const toggleSeverityFilter = (severity: Constraint['severity']) => {
    const currentSeverities = filters.severity || [];
    const newSeverities = currentSeverities.includes(severity)
      ? currentSeverities.filter(s => s !== severity)
      : [...currentSeverities, severity];
    
    onFiltersChange({
      ...filters,
      severity: newSeverities.length > 0 ? newSeverities : undefined
    });
  };

  const toggleActiveFilter = (isActive: boolean | undefined) => {
    onFiltersChange({
      ...filters,
      isActive: filters.isActive === isActive ? undefined : isActive
    });
  };

  const handleSort = (newSortBy: ConstraintSortBy) => {
    if (newSortBy === sortBy) {
      onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(newSortBy);
      onSortOrderChange('desc');
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-16 bg-muted rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className={`h-7 text-xs ${hasActiveFilters ? 'bg-primary/10 border-primary/30' : ''}`}
              >
                <Filter className="h-3 w-3 mr-1" />
                Filter
                {hasActiveFilters && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full w-4 h-4 text-xs flex items-center justify-center">
                    {(filters.severity?.length || 0) + (filters.isActive !== undefined ? 1 : 0)}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Severity</div>
              {SEVERITY_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={filters.severity?.includes(option.value) || false}
                  onCheckedChange={() => toggleSeverityFilter(option.value)}
                >
                  <span className={option.color}>{option.label}</span>
                </DropdownMenuCheckboxItem>
              ))}
              
              <DropdownMenuSeparator />
              
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Status</div>
              <DropdownMenuCheckboxItem
                checked={filters.isActive === true}
                onCheckedChange={() => toggleActiveFilter(true)}
              >
                Active Only
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.isActive === false}
                onCheckedChange={() => toggleActiveFilter(false)}
              >
                Inactive Only
              </DropdownMenuCheckboxItem>
              
              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={clearFilters} className="text-xs">
                    Clear all filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                {SORT_OPTIONS.find(opt => opt.value === sortBy)?.label}
                <span className="ml-1 text-muted-foreground">
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </span>
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {SORT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleSort(option.value)}
                  className={sortBy === option.value ? 'bg-muted' : ''}
                >
                  {option.label}
                  {sortBy === option.value && (
                    <span className="ml-auto">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="text-xs text-muted-foreground">
          {constraints.length} constraint{constraints.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Constraints List */}
      <div className="space-y-2">
        {constraints.map((constraint) => (
          <ConstraintItem
            key={constraint.id}
            constraint={constraint}
            onUpdate={onConstraintUpdate}
            onDelete={onConstraintDelete}
          />
        ))}
      </div>
    </div>
  );
} 