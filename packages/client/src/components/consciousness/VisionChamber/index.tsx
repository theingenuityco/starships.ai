'use client';

import { useState, useEffect, useCallback } from 'react';
import { VisionCore } from './VisionCore';
import { GoalsMatrix } from './GoalsMatrix';
import { ConstraintsGrid } from './ConstraintsGrid';
import { SuggestionPanel } from './shared/SuggestionPanel';
import { AutoInfluenceEngine, InfluenceSuggestion } from './shared/auto-influence';
import { GoalFormData, ConstraintFormData } from './shared/types';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

interface VisionChamberProps {
  className?: string;
  moduleId?: string;
}

export function VisionChamber({ className, moduleId }: VisionChamberProps) {
  const {
    vision,
    goals,
    constraints,
    loading,
    error,
    createConstraint,
    updateConstraint,
    deleteConstraint,
    createGoal,
    updateGoal,
    deleteGoal
  } = useStarshipStore();

  const [suggestions, setSuggestions] = useState<InfluenceSuggestion[]>([]);
  const [lastAnalyzedVision, setLastAnalyzedVision] = useState<string>('');

  // Auto-influence: Analyze vision changes
  const analyzeVisionChanges = useCallback(() => {
    if (!vision.statement || vision.statement === lastAnalyzedVision) {
      return;
    }

    // Only analyze if vision has meaningful content (more than 20 characters)
    if (vision.statement.trim().length < 20) {
      return;
    }

    console.log('🔮 Analyzing vision for auto-influence suggestions...');
    
    // Get goal suggestions from vision
    const goalSuggestions = AutoInfluenceEngine.analyzeVisionForGoals(vision.statement, goals);
    
    // Get constraint suggestions from vision + goals
    const constraintSuggestions = AutoInfluenceEngine.analyzeForConstraints(
      vision.statement, 
      goals, 
      constraints
    );

    const newSuggestions = [...goalSuggestions, ...constraintSuggestions];
    
    if (newSuggestions.length > 0) {
      console.log(`💡 Generated ${newSuggestions.length} auto-influence suggestions:`, newSuggestions);
      setSuggestions(prev => [...prev, ...newSuggestions]);
    }

    setLastAnalyzedVision(vision.statement);
  }, [vision.statement, goals, constraints, lastAnalyzedVision]);

  // Trigger analysis when vision changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      analyzeVisionChanges();
    }, 2000); // Debounce for 2 seconds

    return () => clearTimeout(timeoutId);
  }, [analyzeVisionChanges]);

  // Handle goal completion for constraint updates
  useEffect(() => {
    const completedGoals = goals.filter(goal => goal.status === 'completed');
    
    completedGoals.forEach(goal => {
      const constraintUpdates = AutoInfluenceEngine.analyzeGoalCompletion(goal, constraints);
      if (constraintUpdates.length > 0) {
        console.log(`🎯 Goal completion "${goal.description}" generated constraint suggestions:`, constraintUpdates);
        setSuggestions(prev => [...prev, ...constraintUpdates]);
      }
    });
  }, [goals, constraints]);

  // Handle accepting suggestions
  const handleAcceptSuggestion = async (suggestion: InfluenceSuggestion) => {
    try {
      if (suggestion.type === 'goal') {
        await createGoal(suggestion.suggestion as GoalFormData);
        console.log('✅ Accepted goal suggestion:', suggestion.suggestion.description);
      } else if (suggestion.type === 'constraint') {
        await createConstraint(suggestion.suggestion as ConstraintFormData);
        console.log('✅ Accepted constraint suggestion:', suggestion.suggestion.description);
      }
      
      // Remove the accepted suggestion
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    } catch (error) {
      console.error('Failed to accept suggestion:', error);
    }
  };

  // Handle dismissing suggestions
  const handleDismissSuggestion = (suggestionId: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
  };

  const handleDismissAllSuggestions = () => {
    setSuggestions([]);
  };

  return (
    <div className={cn("h-full flex flex-col space-y-4 p-4 overflow-y-auto", className)}>
      {/* Auto-Influence Suggestions Panel */}
      {suggestions.length > 0 && (
        <div className="flex-shrink-0">
          <SuggestionPanel
            suggestions={suggestions}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            onDismissAll={handleDismissAllSuggestions}
            className="w-full"
          />
        </div>
      )}

      {/* Vision Core - Primary consciousness interface */}
      <div className="flex-shrink-0">
        <VisionCore className="w-full" />
      </div>
      
      {/* Goals Matrix - Goals management interface */}
      <div className="flex-shrink-0">
        <GoalsMatrix className="w-full" />
      </div>
      
      {/* Constraints Grid - Constraints management interface */}
      <div className="flex-shrink-0">
        <ConstraintsGrid
          className="w-full"
          constraints={constraints}
          onConstraintCreate={createConstraint}
          onConstraintUpdate={updateConstraint}
          onConstraintDelete={deleteConstraint}
          loading={loading}
          error={error || undefined}
        />
      </div>
    </div>
  );
} 