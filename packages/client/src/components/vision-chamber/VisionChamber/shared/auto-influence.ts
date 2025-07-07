import { Goal, Constraint, GoalFormData, ConstraintFormData } from './types';

// Keyword patterns for goal suggestion
const GOAL_SUGGESTION_PATTERNS = {
  // Short-term goal patterns
  short_term: [
    {
      keywords: ['explore', 'survey', 'scan', 'investigate', 'analyze'],
      template: 'Conduct detailed exploration of {target}',
      priority: 7
    },
    {
      keywords: ['repair', 'fix', 'maintain', 'upgrade', 'enhance'],
      template: 'Complete {action} of ship systems',
      priority: 8
    },
    {
      keywords: ['collect', 'gather', 'acquire', 'obtain'],
      template: 'Gather required {resources}',
      priority: 6
    },
    {
      keywords: ['contact', 'communicate', 'establish', 'diplomatic'],
      template: 'Establish communication with {target}',
      priority: 7
    }
  ],
  
  // Long-term goal patterns  
  long_term: [
    {
      keywords: ['discover', 'find', 'locate', 'search'],
      template: 'Discover new {target} in uncharted space',
      priority: 5
    },
    {
      keywords: ['build', 'construct', 'establish', 'create'],
      template: 'Establish {infrastructure} for long-term operations',
      priority: 6
    },
    {
      keywords: ['peace', 'alliance', 'cooperation', 'partnership'],
      template: 'Build lasting alliances with {target}',
      priority: 4
    },
    {
      keywords: ['knowledge', 'understanding', 'research', 'study'],
      template: 'Advance understanding of {subject}',
      priority: 5
    }
  ],
  
  // Milestone patterns
  milestone: [
    {
      keywords: ['breakthrough', 'achievement', 'accomplish', 'complete'],
      template: 'Achieve major breakthrough in {field}',
      priority: 3
    },
    {
      keywords: ['first', 'pioneer', 'inaugural', 'initial'],
      template: 'Be first to {achievement}',
      priority: 4
    }
  ]
};

// Constraint suggestion patterns based on goals and vision
const CONSTRAINT_SUGGESTION_PATTERNS = {
  resource: [
    {
      triggers: ['energy', 'power', 'fuel', 'crew', 'time', 'limited'],
      template: 'Limited {resource} availability requires careful management',
      severity: 'medium' as const
    },
    {
      triggers: ['emergency', 'critical', 'urgent', 'immediate'],
      template: 'Emergency protocols limit {resource} usage',
      severity: 'high' as const
    }
  ],
  
  ethical: [
    {
      triggers: ['civilian', 'innocent', 'peaceful', 'non-combatant'],
      template: 'Must protect civilian populations and avoid harm',
      severity: 'critical' as const
    },
    {
      triggers: ['cultural', 'sacred', 'religious', 'heritage'],
      template: 'Respect for cultural and religious sites is paramount',
      severity: 'high' as const
    },
    {
      triggers: ['sovereignty', 'territory', 'borders', 'jurisdiction'],
      template: 'Must respect planetary sovereignty and territorial boundaries',
      severity: 'high' as const
    }
  ],
  
  technical: [
    {
      triggers: ['incompatible', 'interference', 'malfunction', 'limitation'],
      template: 'Technical limitations may affect {system} performance',
      severity: 'medium' as const
    },
    {
      triggers: ['experimental', 'untested', 'prototype', 'new technology'],
      template: 'Untested technology requires cautious implementation',
      severity: 'high' as const
    }
  ],
  
  business: [
    {
      triggers: ['budget', 'cost', 'expense', 'funding'],
      template: 'Budget constraints limit operational flexibility',
      severity: 'medium' as const
    },
    {
      triggers: ['regulation', 'law', 'treaty', 'agreement'],
      template: 'Must comply with relevant regulations and agreements',
      severity: 'high' as const
    },
    {
      triggers: ['partnership', 'alliance', 'contract', 'agreement'],
      template: 'Partnership obligations affect operational decisions',
      severity: 'medium' as const
    }
  ]
};

export interface InfluenceSuggestion {
  id: string;
  type: 'goal' | 'constraint';
  source: 'vision_change' | 'goal_completion' | 'constraint_activation';
  suggestion: GoalFormData | ConstraintFormData;
  confidence: number; // 0-100
  reasoning: string;
  timestamp: string;
  triggers: string[]; // Keywords that triggered this suggestion
}

export class AutoInfluenceEngine {
  // Analyze vision text and suggest goals
  static analyzeVisionForGoals(visionText: string, existingGoals: Goal[]): InfluenceSuggestion[] {
    const suggestions: InfluenceSuggestion[] = [];
    const lowercaseVision = visionText.toLowerCase();
    const words = lowercaseVision.split(/\s+/);
    
    // Check each goal type for matches
    Object.entries(GOAL_SUGGESTION_PATTERNS).forEach(([goalType, patterns]) => {
      patterns.forEach((pattern, index) => {
        const matchedKeywords = pattern.keywords.filter(keyword => 
          lowercaseVision.includes(keyword)
        );
        
        if (matchedKeywords.length > 0) {
          // Check if we already have a similar goal
          const similarExists = existingGoals.some(goal => 
            goal.type === goalType && 
            matchedKeywords.some(keyword => goal.description.toLowerCase().includes(keyword))
          );
          
          if (!similarExists) {
            const target = this.extractTarget(visionText, matchedKeywords);
            const description = pattern.template.replace('{target}', target)
              .replace('{action}', matchedKeywords[0])
              .replace('{resources}', target)
              .replace('{infrastructure}', target)
              .replace('{subject}', target)
              .replace('{field}', target)
              .replace('{achievement}', target);
            
            suggestions.push({
              id: `goal-${Date.now()}-${index}`,
              type: 'goal',
              source: 'vision_change',
              suggestion: {
                description,
                type: goalType as Goal['type'],
                priority: pattern.priority,
                targetDate: this.calculateTargetDate(goalType as Goal['type'])
              },
              confidence: Math.min(90, matchedKeywords.length * 25 + 40),
              reasoning: `Detected keywords: ${matchedKeywords.join(', ')} suggesting ${goalType} goal`,
              timestamp: new Date().toISOString(),
              triggers: matchedKeywords
            });
          }
        }
      });
    });
    
    return suggestions.slice(0, 3); // Limit to top 3 suggestions
  }
  
  // Analyze vision and goals for constraint suggestions
  static analyzeForConstraints(
    visionText: string, 
    goals: Goal[], 
    existingConstraints: Constraint[]
  ): InfluenceSuggestion[] {
    const suggestions: InfluenceSuggestion[] = [];
    const combinedText = `${visionText} ${goals.map(g => g.description).join(' ')}`.toLowerCase();
    
    Object.entries(CONSTRAINT_SUGGESTION_PATTERNS).forEach(([constraintType, patterns]) => {
      patterns.forEach((pattern, index) => {
        const matchedTriggers = pattern.triggers.filter(trigger => 
          combinedText.includes(trigger)
        );
        
        if (matchedTriggers.length > 0) {
          // Check if we already have a similar constraint
          const similarExists = existingConstraints.some(constraint => 
            constraint.type === constraintType && 
            matchedTriggers.some(trigger => constraint.description.toLowerCase().includes(trigger))
          );
          
          if (!similarExists) {
            const resource = this.extractTarget(combinedText, matchedTriggers);
            const description = pattern.template.replace('{resource}', resource)
              .replace('{system}', resource);
            
            suggestions.push({
              id: `constraint-${Date.now()}-${index}`,
              type: 'constraint',
              source: 'vision_change',
              suggestion: {
                description,
                type: constraintType as Constraint['type'],
                severity: pattern.severity,
                isActive: true
              },
              confidence: Math.min(80, matchedTriggers.length * 20 + 40),
              reasoning: `Detected triggers: ${matchedTriggers.join(', ')} indicating ${constraintType} constraints`,
              timestamp: new Date().toISOString(),
              triggers: matchedTriggers
            });
          }
        }
      });
    });
    
    return suggestions.slice(0, 2); // Limit to top 2 suggestions
  }
  
  // Analyze goal completion for constraint updates
  static analyzeGoalCompletion(completedGoal: Goal, allConstraints: Constraint[]): InfluenceSuggestion[] {
    const suggestions: InfluenceSuggestion[] = [];
    
    // When goals are completed, some constraints might become less severe or inactive
    if (completedGoal.type === 'short_term') {
      const relatedConstraints = allConstraints.filter(constraint => 
        constraint.isActive && 
        constraint.severity !== 'low' &&
        this.hasSharedKeywords(completedGoal.description, constraint.description)
      );
      
      relatedConstraints.forEach(constraint => {
        const newSeverity = this.reduceSeverity(constraint.severity);
        if (newSeverity !== constraint.severity) {
          suggestions.push({
            id: `constraint-update-${Date.now()}`,
            type: 'constraint',
            source: 'goal_completion',
            suggestion: {
              description: constraint.description,
              type: constraint.type,
              severity: newSeverity,
              isActive: newSeverity !== 'low' // Deactivate low severity constraints
            },
            confidence: 70,
            reasoning: `Goal completion "${completedGoal.description}" reduces related constraint severity`,
            timestamp: new Date().toISOString(),
            triggers: [completedGoal.description]
          });
        }
      });
    }
    
    return suggestions;
  }
  
  // Helper methods
  private static extractTarget(text: string, keywords: string[]): string {
    const words = text.split(/\s+/);
    let target = 'objectives';
    
    // Look for nouns near keywords
    for (const keyword of keywords) {
      const keywordIndex = words.findIndex(word => word.includes(keyword));
      if (keywordIndex >= 0) {
        // Look for nearby nouns
        for (let i = keywordIndex + 1; i < Math.min(keywordIndex + 4, words.length); i++) {
          const word = words[i];
          if (word.length > 3 && !['the', 'and', 'or', 'but', 'with', 'for'].includes(word)) {
            target = word;
            break;
          }
        }
      }
    }
    
    return target;
  }
  
  private static calculateTargetDate(goalType: Goal['type']): string | undefined {
    const now = new Date();
    switch (goalType) {
      case 'short_term':
        now.setDate(now.getDate() + 30); // 30 days
        break;
      case 'long_term':
        now.setMonth(now.getMonth() + 6); // 6 months
        break;
      case 'milestone':
        now.setMonth(now.getMonth() + 12); // 1 year
        break;
    }
    return now.toISOString().split('T')[0];
  }
  
  private static hasSharedKeywords(text1: string, text2: string): boolean {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    return words1.some(word => 
      word.length > 3 && 
      words2.some(w => w.includes(word) || word.includes(w))
    );
  }
  
  private static reduceSeverity(severity: Constraint['severity']): Constraint['severity'] {
    switch (severity) {
      case 'critical': return 'high';
      case 'high': return 'medium';
      case 'medium': return 'low';
      case 'low': return 'low';
    }
  }
} 