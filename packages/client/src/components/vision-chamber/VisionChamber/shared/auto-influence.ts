import { Constraint, ConstraintFormData, VisionRefinementFormData } from './types';

// Vision refinement patterns
const VISION_REFINEMENT_PATTERNS = {
  clarity: [
    {
      triggers: ['vague', 'maybe', 'might', 'possibly', 'unclear'],
      template: 'Consider being more specific about {target}',
      improvementType: 'clarity'
    }
  ],
  scope: [
    {
      triggers: ['everything', 'all', 'anything', 'universal'],
      template: 'Define the specific scope of {target}',
      improvementType: 'scope'
    }
  ],
  purpose: [
    {
      triggers: ['to do', 'for', 'about'],
      template: 'Strengthen the purpose statement around {target}',
      improvementType: 'purpose'
    }
  ],
  action: [
    {
      triggers: ['is', 'are', 'being', 'static'],
      template: 'Add actionable verbs to describe {target}',
      improvementType: 'action'
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
  type: 'constraint' | 'vision_refinement';
  source: 'vision_change' | 'constraint_activation' | 'agent_observation';
  suggestion: ConstraintFormData | VisionRefinementFormData;
  confidence: number; // 0-100
  reasoning: string;
  timestamp: string;
  triggers: string[]; // Keywords that triggered this suggestion
}

export class AutoInfluenceEngine {
  // Analyze vision text for refinement suggestions
  static analyzeVisionForRefinement(visionText: string): InfluenceSuggestion[] {
    const suggestions: InfluenceSuggestion[] = [];
    const lowercaseVision = visionText.toLowerCase();
    
    Object.entries(VISION_REFINEMENT_PATTERNS).forEach(([type, patterns]) => {
      patterns.forEach((pattern) => {
        const matchedTriggers = pattern.triggers.filter(trigger =>
          lowercaseVision.includes(trigger)
        );
        
        if (matchedTriggers.length > 0) {
          suggestions.push({
            id: `vision-${Date.now()}-${type}`,
            type: 'vision_refinement',
            source: 'vision_change',
            suggestion: {
              currentStatement: visionText,
              suggestedStatement: this.generateRefinedVision(visionText, pattern),
              improvementType: pattern.improvementType,
              reasoning: pattern.template.replace('{target}', matchedTriggers[0])
            } as VisionRefinementFormData,
            confidence: Math.min(80, matchedTriggers.length * 20 + 40),
            reasoning: `Detected ${type} improvement opportunity: ${matchedTriggers.join(', ')}`,
            timestamp: new Date().toISOString(),
            triggers: matchedTriggers
          });
        }
      });
    });
    
    return suggestions.slice(0, 2);
  }
  
  // Analyze vision for constraint suggestions
  static analyzeForConstraints(
    visionText: string,
    goals: any[], // Keep parameter for compatibility but ignore
    existingConstraints: Constraint[]
  ): InfluenceSuggestion[] {
    const suggestions: InfluenceSuggestion[] = [];
    const combinedText = visionText.toLowerCase();
    
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
  
  // Generate refined vision text
  static generateRefinedVision(visionText: string, pattern: any): string {
    // Simple implementation - can be enhanced
    const words = visionText.split(' ');
    const improvements = {
      clarity: 'Specifically focused on',
      scope: 'Precisely defined to',
      purpose: 'Intentionally designed to',
      action: 'Actively working to'
    };
    
    return `${improvements[pattern.improvementType as keyof typeof improvements]} ${words.slice(1).join(' ')}`;
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