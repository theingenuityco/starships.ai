'use client';

import { useState, useEffect } from 'react';
import { Target, Plus, Filter } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useStarshipStore } from '@/store/starship-store';

// Import sub-components (to be created)
import { GoalsList } from './GoalsList';
import { GoalCreator } from './GoalCreator';
import type { GoalFilters, GoalSortBy, GoalFormData } from '../shared/types';

interface GoalsMatrixProps {
  className?: string;
}

export function GoalsMatrix({ className }: GoalsMatrixProps) {
  const {
    goals,
    loadGoalsAndConstraints,
    createGoal,
    updateGoal,
    deleteGoal,
    loading,
    error,
    activeStarshipId
  } = useStarshipStore();

  const [showCreator, setShowCreator] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<GoalFilters>({});
  const [sortBy, setSortBy] = useState<GoalSortBy>('priority');

  // Load goals when component mounts or starship changes
  useEffect(() => {
    if (activeStarshipId) {
      loadGoalsAndConstraints();
    }
  }, [activeStarshipId, loadGoalsAndConstraints]);

  const handleCreateGoal = async (data: GoalFormData) => {
    await createGoal(data);
    setShowCreator(false);
  };

  const handleUpdateGoal = async (id: string, changes: any) => {
    await updateGoal(id, changes);
  };

  const handleDeleteGoal = async (id: string) => {
    await deleteGoal(id);
  };

  if (!activeStarshipId) {
    return (
      <Card className={cn("p-6 bg-black/20 border-white/10", className)}>
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <Target className="w-8 h-8 mx-auto mb-2 text-white/40" />
            <p className="text-sm text-white/60">No active starship</p>
            <p className="text-xs text-white/40">Select a starship to manage goals</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("p-6 bg-black/20 border-white/10", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-purple-400" />
          <h3 className="font-semibold text-white">Goals Matrix</h3>
          <span className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded">
            {goals.length} goals
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="border-white/10 text-white/80 hover:bg-white/5"
          >
            <Filter className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreator(true)}
            className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Goal
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Goals List */}
      <GoalsList
        goals={goals}
        filters={filters}
        sortBy={sortBy}
        onUpdateGoal={handleUpdateGoal}
        onDeleteGoal={handleDeleteGoal}
        loading={loading}
        showFilters={showFilters}
        onFiltersChange={setFilters}
        onSortChange={setSortBy}
      />

      {/* Goal Creator Modal */}
      {showCreator && (
        <GoalCreator
          onSave={handleCreateGoal}
          onCancel={() => setShowCreator(false)}
        />
      )}
    </Card>
  );
} 