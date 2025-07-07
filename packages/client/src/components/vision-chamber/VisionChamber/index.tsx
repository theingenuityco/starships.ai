'use client';

import { useState, useEffect, useCallback } from 'react';
import { VisionCore } from './VisionCore';
import { ConstraintsGrid } from './ConstraintsGrid';
import { SuggestionPanel } from './shared/SuggestionPanel';
import { AutoInfluenceEngine, InfluenceSuggestion } from './shared/auto-influence';
import { ConstraintFormData, VisionRefinementFormData } from './shared/types';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

interface VisionChamberProps {
  className?: string;
  moduleId?: string;
}

export function VisionChamber({ className, moduleId }: VisionChamberProps) {
  const {
    vision,
    constraints,
    loading,
    error,
    createConstraint,
    updateConstraint,
    deleteConstraint
  } = useStarshipStore();

  const [suggestions, setSuggestions] = useState<InfluenceSuggestion[]>([]);
  const [lastAnalyzedVision, setLastAnalyzedVision] = useState<string>('');

  // Auto-influence: Analyze vision changes
  const analyzeVisionChanges = useCallback(() => {
    if (!vision.statement || vision.statement === lastAnalyzedVision) {
      return;
    }

    // Only analyze if vision has meaningful content (more than 200 characters)
    if (vision.statement.trim().length < 200) {
      return;
    }

    console.log('🔮 Analyzing vision for auto-influence suggestions...');
    
    // Get vision refinement suggestions
    const visionRefinementSuggestions = AutoInfluenceEngine.analyzeVisionForRefinement(vision.statement);
    
    // Get constraint suggestions from vision only
    const constraintSuggestions = AutoInfluenceEngine.analyzeForConstraints(
      vision.statement,
      [], // No goals array
      constraints
    );

    const newSuggestions = [...visionRefinementSuggestions, ...constraintSuggestions];
    
    if (newSuggestions.length > 0) {
      console.log(`💡 Generated ${newSuggestions.length} auto-influence suggestions:`, newSuggestions);
      setSuggestions(prev => [...prev, ...newSuggestions]);
    }

    setLastAnalyzedVision(vision.statement);
  }, [vision.statement, constraints, lastAnalyzedVision]);

  // Trigger analysis when vision changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      analyzeVisionChanges();
    }, 2000); // Debounce for 2 seconds

    return () => clearTimeout(timeoutId);
  }, [analyzeVisionChanges]);


  // Handle accepting suggestions
  const handleAcceptSuggestion = async (suggestion: InfluenceSuggestion) => {
    try {
      if (suggestion.type === 'constraint') {
        const constraintData = suggestion.suggestion as ConstraintFormData;
        await createConstraint(constraintData);
        console.log('✅ Accepted constraint suggestion:', constraintData.description);
      } else if (suggestion.type === 'vision_refinement') {
        // For vision refinement, we would update the vision statement
        // This would integrate with the VisionCore component's update mechanism
        const refinement = suggestion.suggestion as VisionRefinementFormData;
        console.log('💡 Vision refinement suggested:', refinement.suggestedStatement);
        // Note: Vision refinement acceptance would be handled by VisionCore component
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
    <div className={cn("h-full flex flex-col lg:flex-row gap-4 p-4", className)}>
      {/* Main content area - Vision + Suggestions */}
      <div className="flex-1 space-y-4">
        {/* Vision Core - Primary consciousness interface */}
        <VisionCore className="w-full" />
        
        {/* Auto-Influence Suggestions Panel */}
        {suggestions.length > 0 && (
          <SuggestionPanel
            suggestions={suggestions}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            onDismissAll={handleDismissAllSuggestions}
            className="w-full"
          />
        )}
      </div>
      
      {/* Constraints sidebar on desktop, bottom on mobile */}
      <div className="lg:w-96 w-full">
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