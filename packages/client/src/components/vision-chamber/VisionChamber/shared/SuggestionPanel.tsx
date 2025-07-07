'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Target, Shield, CheckCircle, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfluenceSuggestion } from './auto-influence';
import { ConstraintSeverityIndicator } from '../ConstraintsGrid/ConstraintSeverityIndicator';
import { ConstraintFormData, VisionRefinementFormData } from './types';

interface SuggestionPanelProps {
  suggestions: InfluenceSuggestion[];
  onAcceptSuggestion: (suggestion: InfluenceSuggestion) => void;
  onDismissSuggestion: (suggestionId: string) => void;
  onDismissAll: () => void;
  className?: string;
}

export function SuggestionPanel({
  suggestions,
  onAcceptSuggestion,
  onDismissSuggestion,
  onDismissAll,
  className
}: SuggestionPanelProps) {
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());

  const toggleExpanded = (suggestionId: string) => {
    const newExpanded = new Set(expandedSuggestions);
    if (newExpanded.has(suggestionId)) {
      newExpanded.delete(suggestionId);
    } else {
      newExpanded.add(suggestionId);
    }
    setExpandedSuggestions(newExpanded);
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'constraint':
        return Shield;
      case 'vision_refinement':
        return Lightbulb;
      default:
        return Info;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'vision_change':
        return 'Vision Analysis';
      case 'constraint_activation':
        return 'Constraint Update';
      case 'agent_observation':
        return 'Agent Analysis';
      default:
        return 'Auto-Influence';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 bg-green-100 border-green-200';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-100 border-yellow-200';
    return 'text-red-600 bg-red-100 border-red-200';
  };

  // Type guards
  const isConstraintSuggestion = (suggestion: InfluenceSuggestion): suggestion is InfluenceSuggestion & { suggestion: ConstraintFormData } => {
    return suggestion.type === 'constraint';
  };

  const isVisionRefinementSuggestion = (suggestion: InfluenceSuggestion): suggestion is InfluenceSuggestion & { suggestion: VisionRefinementFormData } => {
    return suggestion.type === 'vision_refinement';
  };

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Card className={cn('border-blue-200 bg-blue-50/50', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-sm font-medium text-blue-900">
              Auto-Influence Suggestions
            </CardTitle>
            <Badge variant="outline" className="h-5 text-xs">
              {suggestions.length}
            </Badge>
          </div>
          
          {suggestions.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismissAll}
              className="h-6 text-xs text-blue-600 hover:text-blue-800"
            >
              Dismiss All
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-3">
        {suggestions.map((suggestion) => {
          const Icon = getSuggestionIcon(suggestion.type);
          const isExpanded = expandedSuggestions.has(suggestion.id);
          
          return (
            <Card
              key={suggestion.id}
              className="border border-blue-200 bg-white/80 hover:bg-white/90 transition-colors"
            >
              <CardContent className="p-3">
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <Icon className="h-4 w-4 text-blue-600" />
                      {isConstraintSuggestion(suggestion) && (
                        <ConstraintSeverityIndicator 
                          severity={suggestion.suggestion.severity}
                          size="sm"
                        />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-900">
                            {isConstraintSuggestion(suggestion)
                              ? suggestion.suggestion.description
                              : isVisionRefinementSuggestion(suggestion)
                                ? `Vision refinement: ${suggestion.suggestion.improvementType}`
                                : 'Unknown suggestion type'
                            }
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <Badge variant="outline" className="h-4 px-1">
                              {suggestion.type}
                            </Badge>
                            <span>•</span>
                            <span>{getSourceLabel(suggestion.source)}</span>
                            <span>•</span>
                            <Badge 
                              className={cn('h-4 px-1 border text-xs', getConfidenceColor(suggestion.confidence))}
                            >
                              {suggestion.confidence}% confidence
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(suggestion.id)}
                            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                          >
                            <Info className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDismissSuggestion(suggestion.id)}
                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-600 space-y-2">
                          <div>
                            <span className="font-medium">Reasoning:</span> {suggestion.reasoning}
                          </div>
                          <div>
                            <span className="font-medium">Triggers:</span> {suggestion.triggers.join(', ')}
                          </div>
                          <div>
                            <span className="font-medium">Generated:</span> {new Date(suggestion.timestamp).toLocaleString()}
                          </div>
                          
                          {/* Vision refinement details */}
                          {isVisionRefinementSuggestion(suggestion) && (
                            <div className="space-y-1">
                              <div><span className="font-medium">Current:</span> {suggestion.suggestion.currentStatement.substring(0, 100)}...</div>
                              <div><span className="font-medium">Suggested:</span> {suggestion.suggestion.suggestedStatement.substring(0, 100)}...</div>
                              <div><span className="font-medium">Improvement:</span> {suggestion.suggestion.improvementType}</div>
                            </div>
                          )}
                          
                          {/* Constraint-specific details */}
                          {isConstraintSuggestion(suggestion) && (
                            <div className="space-y-1">
                              <div><span className="font-medium">Category:</span> {suggestion.suggestion.type}</div>
                              <div><span className="font-medium">Severity:</span> {suggestion.suggestion.severity}</div>
                              <div><span className="font-medium">Active:</span> {suggestion.suggestion.isActive ? 'Yes' : 'No'}</div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Action Button */}
                      <div className="mt-3">
                        <Button
                          size="sm"
                          onClick={() => onAcceptSuggestion(suggestion)}
                          className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Accept {suggestion.type === 'constraint' ? 'Constraint' : 'Vision Refinement'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
} 