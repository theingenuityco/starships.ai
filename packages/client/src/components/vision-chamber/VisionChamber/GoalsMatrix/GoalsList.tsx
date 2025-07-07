'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import { GoalItem } from './GoalItem';
import type { Goal, GoalFilters, GoalSortBy } from '../shared/types';

interface GoalsListProps {
  goals: Goal[];
  filters: GoalFilters;
  sortBy: GoalSortBy;
  onUpdateGoal: (id: string, changes: Partial<Goal>) => void;
  onDeleteGoal: (id: string) => void;
  loading?: boolean;
  showFilters: boolean;
  onFiltersChange: (filters: GoalFilters) => void;
  onSortChange: (sortBy: GoalSortBy) => void;
}

export function GoalsList({
  goals,
  filters,
  sortBy,
  onUpdateGoal,
  onDeleteGoal,
  loading,
  showFilters,
  onFiltersChange,
  onSortChange
}: GoalsListProps) {
  // Filter and sort goals
  const filteredAndSortedGoals = useMemo(() => {
    let filtered = [...goals];

    // Apply filters
    if (filters.status?.length) {
      filtered = filtered.filter(goal => filters.status!.includes(goal.status));
    }
    
    if (filters.type?.length) {
      filtered = filtered.filter(goal => filters.type!.includes(goal.type));
    }
    
    if (filters.priority) {
      filtered = filtered.filter(goal => 
        goal.priority >= filters.priority!.min && 
        goal.priority <= filters.priority!.max
      );
    }
    
    if (filters.hasTargetDate !== undefined) {
      filtered = filtered.filter(goal => 
        filters.hasTargetDate ? !!goal.targetDate : !goal.targetDate
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return b.priority - a.priority; // Higher priority first
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'targetDate':
          if (!a.targetDate && !b.targetDate) return 0;
          if (!a.targetDate) return 1;
          if (!b.targetDate) return -1;
          return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
        case 'description':
          return a.description.localeCompare(b.description);
        default:
          return 0;
      }
    });

    return filtered;
  }, [goals, filters, sortBy]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-16 bg-white/5 border border-white/10 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (filteredAndSortedGoals.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-white/60 mb-2">
          {goals.length === 0 ? 'No goals yet' : 'No goals match your filters'}
        </p>
        <p className="text-xs text-white/40">
          {goals.length === 0 
            ? 'Add your first goal to get started'
            : 'Try adjusting your filters or create a new goal'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter Panel */}
      {showFilters && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="p-4 bg-black/20 border border-white/10 rounded-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div>
              <label className="text-xs text-white/60 mb-2 block">Status</label>
              <select
                className="w-full text-sm bg-black/30 border border-white/10 rounded text-white"
                value={filters.status?.[0] || ''}
                onChange={(e) => 
                  onFiltersChange({
                    ...filters,
                    status: e.target.value ? [e.target.value as Goal['status']] : undefined
                  })
                }
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Type Filter */}
            <div>
              <label className="text-xs text-white/60 mb-2 block">Type</label>
              <select
                className="w-full text-sm bg-black/30 border border-white/10 rounded text-white"
                value={filters.type?.[0] || ''}
                onChange={(e) => 
                  onFiltersChange({
                    ...filters,
                    type: e.target.value ? [e.target.value as Goal['type']] : undefined
                  })
                }
              >
                <option value="">All</option>
                <option value="short_term">Short Term</option>
                <option value="long_term">Long Term</option>
                <option value="milestone">Milestone</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="text-xs text-white/60 mb-2 block">Sort By</label>
              <select
                className="w-full text-sm bg-black/30 border border-white/10 rounded text-white"
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as GoalSortBy)}
              >
                <option value="priority">Priority</option>
                <option value="createdAt">Created Date</option>
                <option value="targetDate">Target Date</option>
                <option value="description">Description</option>
              </select>
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <button
                onClick={() => onFiltersChange({})}
                className="text-xs text-white/60 hover:text-white/80 underline"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Goals List */}
      <div className="space-y-2">
        {filteredAndSortedGoals.map((goal, index) => (
          <motion.div
            key={goal.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <GoalItem
              goal={goal}
              onUpdate={onUpdateGoal}
              onDelete={onDeleteGoal}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
} 