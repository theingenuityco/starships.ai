import { z } from 'zod';
import {
  Repository,
  BaseEntity,
  TemporalFields,
  AggregateRoot,
  UuidSchema,
  DateTimeSchema,
  ScoreSchema
} from './shared';

/**
 * Vision Entity (Vision Statement Context - Aggregate Root)
 * 
 * Represents a vision statement for a starship with quality metrics,
 * refinement tracking, and assessment scores. This is an aggregate root
 * that manages vision statement lifecycle and quality assessment.
 */
export interface Vision extends BaseEntity, TemporalFields, AggregateRoot {
  /** Unique identifier for the vision */
  id: string;
  
  /** 
   * @deprecated Use (:Vision)-[:BELONGS_TO]->(:Starship) relationship instead
   * Foreign key to Starship - will be removed in favor of graph relationships
   */
  starshipId: string;
  
  /** The vision statement text */
  statement: string;
  
  /** Confidence level in the vision (0-1) */
  confidence: number;
  
  /** Number of times the vision has been refined */
  refinementCount: number;
  
  /** Timestamp when the vision was last refined */
  lastRefined: string;
  
  /** Whether this vision is currently active for the starship */
  isActive: boolean;
  
  // Vision Quality Metrics (0-1 scale)
  /** How clear and understandable the vision statement is */
  clarityScore?: number;
  
  /** How specific and concrete the vision statement is */
  specificityScore?: number;
  
  /** How actionable and implementable the vision statement is */
  actionabilityScore?: number;
  
  /** How inspiring and motivating the vision statement is */
  inspirationalScore?: number;
  
  /** Overall quality score derived from other metrics */
  overallQuality?: number;
  
  // Vision Component Flags
  /** Whether the vision includes specific objectives */
  hasObjectives?: boolean;
  
  /** Whether the vision includes a timeframe */
  hasTimeframe?: boolean;
  
  /** Whether the vision includes measurable outcomes */
  hasMeasurables?: boolean;
  
  /** Timestamp when the vision was created */
  createdAt: string;
  
  /** Timestamp when the vision was last updated */
  updatedAt: string;
  
  // Aggregate root marker
  readonly _aggregateRoot: true;
}

/**
 * Vision Validation Schema
 * 
 * Comprehensive Zod validation schema for Vision entity with quality metrics
 * validation and business rules for the Vision Statement Context.
 */
export const VisionSchema = z.object({
  id: UuidSchema,
  starshipId: UuidSchema,
  statement: z.string()
    .min(10, 'Vision statement must be at least 10 characters')
    .max(2000, 'Vision statement must be at most 2000 characters'),
  confidence: ScoreSchema,
  refinementCount: z.number()
    .int('Refinement count must be an integer')
    .min(0, 'Refinement count cannot be negative')
    .max(100, 'Refinement count cannot exceed 100'),
  lastRefined: DateTimeSchema,
  isActive: z.boolean(),
  
  // Quality metrics (all optional, 0-1 scale)
  clarityScore: ScoreSchema.optional(),
  specificityScore: ScoreSchema.optional(),
  actionabilityScore: ScoreSchema.optional(),
  inspirationalScore: ScoreSchema.optional(),
  overallQuality: ScoreSchema.optional(),
  
  // Component flags
  hasObjectives: z.boolean().optional(),
  hasTimeframe: z.boolean().optional(),
  hasMeasurables: z.boolean().optional(),
  
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  _aggregateRoot: z.literal(true),
}).strict().superRefine((data: any, ctx: any) => {
  // Validate that overall quality is consistent with component scores
  if (data.overallQuality !== undefined) {
    const componentScores = [
      data.clarityScore,
      data.specificityScore,
      data.actionabilityScore,
      data.inspirationalScore
    ].filter(score => score !== undefined) as number[];
    
    if (componentScores.length > 0) {
      const expectedOverall = componentScores.reduce((sum, score) => sum + score, 0) / componentScores.length;
      const tolerance = 0.1;
      
      if (Math.abs(data.overallQuality - expectedOverall) > tolerance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['overallQuality'],
          message: `Overall quality score should be approximately ${expectedOverall.toFixed(2)} based on component scores`,
        });
      }
    }
  }
  
  // Validate confidence level consistency with quality scores
  if (data.confidence !== undefined && data.overallQuality !== undefined) {
    if (data.confidence > data.overallQuality + 0.2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confidence'],
        message: 'Confidence level should not significantly exceed overall quality score',
      });
    }
  }
});

/**
 * Vision Creation Schema
 */
export const CreateVisionSchema = VisionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  _aggregateRoot: true,
}).extend({
  refinementCount: z.number().default(0),
  isActive: z.boolean().default(true),
});

/**
 * Vision Update Schema
 */
export const UpdateVisionSchema = VisionSchema.partial().omit({
  id: true,
  createdAt: true,
  starshipId: true, // Starship cannot be changed after creation
  _aggregateRoot: true,
});

/**
 * Vision Repository Interface (Vision Statement Context)
 * 
 * Repository interface for managing Vision entities with domain-specific
 * query methods for vision statement management and quality tracking.
 */
export interface VisionRepository {
  findAll(): Promise<Vision[]>;
  findById(id: string): Promise<Vision | null>;
  create(entity: Omit<Vision, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vision>;
  update(id: string, updates: Partial<Vision>): Promise<Vision | null>;
  delete(id: string): Promise<boolean>;
  
  /**
   * Find the active vision for a specific starship
   * @param starshipId - The starship ID
   * @returns Promise resolving to the active vision or null if none exists
   */
  findByStarship(starshipId: string): Promise<Vision | null>;
  
  /**
   * Update the vision statement for a starship
   * @param starshipId - The starship ID
   * @param statement - The new vision statement
   * @returns Promise resolving to the updated vision or null if not found
   */
  updateStatement(starshipId: string, statement: string): Promise<Vision | null>;
  
  /**
   * Get the vision statement for a starship (legacy method)
   * @deprecated Use findByStarship instead
   * @param starshipId - The starship ID
   * @returns Promise resolving to vision object or null if not found
   */
  getVisionByStarshipId(starshipId: string): Promise<{ vision: string } | null>;
  
  /**
   * Update the vision for a starship (legacy method)
   * @deprecated Use updateStatement instead
   * @param starshipId - The starship ID
   * @param newVision - The new vision statement
   * @returns Promise resolving to the updated vision or null if not found
   */
  updateVision(starshipId: string, newVision: string): Promise<Vision | null>;
  
  /**
   * Find all vision statements for a starship (including inactive ones)
   * @param starshipId - The starship ID
   * @returns Promise resolving to array of visions
   */
  findAllByStarship(starshipId: string): Promise<Vision[]>;
  
  /**
   * Find visions by quality score range
   * @param minScore - Minimum overall quality score
   * @param maxScore - Maximum overall quality score
   * @returns Promise resolving to array of visions
   */
  findByQualityRange(minScore: number, maxScore: number): Promise<Vision[]>;
  
  /**
   * Find visions that need refinement (low confidence or quality)
   * @param confidenceThreshold - Minimum confidence threshold (default: 0.7)
   * @param qualityThreshold - Minimum quality threshold (default: 0.6)
   * @returns Promise resolving to array of visions needing refinement
   */
  findNeedingRefinement(confidenceThreshold?: number, qualityThreshold?: number): Promise<Vision[]>;
  
  /**
   * Get vision refinement history for a starship
   * @param starshipId - The starship ID
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of vision history
   */
  getRefinementHistory(starshipId: string, limit?: number): Promise<Vision[]>;
  
  /**
   * Update quality metrics for a vision
   * @param id - The vision ID
   * @param metrics - Quality metrics to update
   * @returns Promise resolving to the updated vision or null if not found
   */
  updateQualityMetrics(
    id: string,
    metrics: {
      clarityScore?: number;
      specificityScore?: number;
      actionabilityScore?: number;
      inspirationalScore?: number;
      hasObjectives?: boolean;
      hasTimeframe?: boolean;
      hasMeasurables?: boolean;
    }
  ): Promise<Vision | null>;
  
  /**
   * Increment refinement count for a vision
   * @param id - The vision ID
   * @returns Promise resolving to the updated vision or null if not found
   */
  incrementRefinementCount(id: string): Promise<Vision | null>;
  
  /**
   * Set vision as active (and deactivate others for the same starship)
   * @param id - The vision ID
   * @returns Promise resolving to the updated vision or null if not found
   */
  setAsActive(id: string): Promise<Vision | null>;
  
  /**
   * Find visions with specific component flags
   * @param flags - Component flags to filter by
   * @returns Promise resolving to array of matching visions
   */
  findWithComponents(flags: {
    hasObjectives?: boolean;
    hasTimeframe?: boolean;
    hasMeasurables?: boolean;
  }): Promise<Vision[]>;
  
  /**
   * Get average quality scores across all visions
   * @returns Promise resolving to average quality metrics
   */
  getAverageQualityMetrics(): Promise<{
    clarity: number;
    specificity: number;
    actionability: number;
    inspirational: number;
    overall: number;
  }>;
  
  /**
   * Find top-quality visions for inspiration
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of high-quality visions
   */
  findTopQuality(limit?: number): Promise<Vision[]>;
}

/**
 * Vision Domain Events
 */

export interface VisionCreatedEvent {
  eventType: 'VisionCreated';
  aggregateId: string;
  vision: Vision;
  occurredAt: string;
  version: number;
}

export interface VisionUpdatedEvent {
  eventType: 'VisionUpdated';
  aggregateId: string;
  visionId: string;
  changes: Partial<Vision>;
  occurredAt: string;
  version: number;
}

export interface VisionRefinedEvent {
  eventType: 'VisionRefined';
  aggregateId: string;
  visionId: string;
  previousStatement: string;
  newStatement: string;
  refinementCount: number;
  occurredAt: string;
  version: number;
}

export interface VisionQualityAssessedEvent {
  eventType: 'VisionQualityAssessed';
  aggregateId: string;
  visionId: string;
  qualityMetrics: {
    clarityScore?: number;
    specificityScore?: number;
    actionabilityScore?: number;
    inspirationalScore?: number;
    overallQuality?: number;
  };
  occurredAt: string;
  version: number;
}

export interface VisionActivatedEvent {
  eventType: 'VisionActivated';
  aggregateId: string;
  visionId: string;
  starshipId: string;
  occurredAt: string;
  version: number;
}

/**
 * Vision Aggregate Business Rules
 */

export const VisionBusinessRules = {
  /**
   * Validates that a vision statement is ready for activation
   */
  isReadyForActivation: (vision: Vision): boolean => {
    return !!(
      vision.statement.length >= 10 &&
      vision.confidence >= 0.5 &&
      (vision.overallQuality === undefined || vision.overallQuality >= 0.5)
    );
  },

  /**
   * Validates that a vision needs refinement
   */
  needsRefinement: (vision: Vision): boolean => {
    return (
      vision.confidence < 0.7 ||
      (vision.overallQuality !== undefined && vision.overallQuality < 0.6) ||
      vision.refinementCount === 0
    );
  },

  /**
   * Validates that a vision has high quality
   */
  isHighQuality: (vision: Vision): boolean => {
    return (
      vision.confidence >= 0.8 &&
      (vision.overallQuality === undefined || vision.overallQuality >= 0.8) &&
      vision.statement.length >= 50
    );
  },

  /**
   * Validates that a vision is comprehensive (has all components)
   */
  isComprehensive: (vision: Vision): boolean => {
    return !!(
      vision.hasObjectives &&
      vision.hasTimeframe &&
      vision.hasMeasurables
    );
  },

  /**
   * Calculates the overall quality score from component scores
   */
  calculateOverallQuality: (
    clarityScore?: number,
    specificityScore?: number,
    actionabilityScore?: number,
    inspirationalScore?: number
  ): number | undefined => {
    const scores = [clarityScore, specificityScore, actionabilityScore, inspirationalScore]
      .filter(score => score !== undefined) as number[];
    
    if (scores.length === 0) {
      return undefined;
    }
    
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }
};

/**
 * Type exports for external use
 */
export type CreateVisionInput = z.infer<typeof CreateVisionSchema>;
export type UpdateVisionInput = z.infer<typeof UpdateVisionSchema>;
export type VisionValidationResult = { success: true; data: Vision } | { success: false; error: z.ZodError };

/**
 * Vision Utility Functions
 */
export const VisionUtils = {
  /**
   * Validates a Vision entity against the schema
   */
  validate: (vision: any): VisionValidationResult => {
    return VisionSchema.safeParse(vision);
  },

  /**
   * Creates a new Vision entity with validation and auto-generated fields
   */
  create: (input: CreateVisionInput): Vision => {
    const vision: Vision = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _aggregateRoot: true,
    };
    
    const validation = VisionSchema.safeParse(vision);
    if (!validation.success) {
      throw new Error(`Invalid vision data: ${validation.error.message}`);
    }
    
    return validation.data;
  },

  /**
   * Analyzes vision statement text for component flags
   */
  analyzeStatementComponents: (statement: string): {
    hasObjectives: boolean;
    hasTimeframe: boolean;
    hasMeasurables: boolean;
  } => {
    const lowerStatement = statement.toLowerCase();
    
    // Look for objective indicators
    const objectiveKeywords = ['goal', 'objective', 'aim', 'target', 'achieve', 'accomplish', 'deliver'];
    const hasObjectives = objectiveKeywords.some(keyword => lowerStatement.includes(keyword));
    
    // Look for timeframe indicators
    const timeframeKeywords = ['by', 'within', 'year', 'month', 'quarter', 'deadline', 'timeline'];
    const hasTimeframe = timeframeKeywords.some(keyword => lowerStatement.includes(keyword));
    
    // Look for measurable indicators
    const measurableKeywords = ['%', 'percent', 'number', 'metric', 'measure', 'count', 'increase', 'decrease'];
    const hasMeasurables = measurableKeywords.some(keyword => lowerStatement.includes(keyword));
    
    return {
      hasObjectives,
      hasTimeframe,
      hasMeasurables
    };
  },

  /**
   * Estimates statement quality based on content analysis
   */
  estimateQualityScores: (statement: string): {
    clarityScore: number;
    specificityScore: number;
    actionabilityScore: number;
    inspirationalScore: number;
  } => {
    const length = statement.length;
    const words = statement.split(/\s+/).length;
    const sentences = statement.split(/[.!?]+/).filter(s => s.trim()).length;
    
    // Basic heuristic scoring (0-1 scale)
    const clarityScore = Math.min(1, Math.max(0, (sentences * 0.2) + (words > 10 ? 0.5 : 0)));
    const specificityScore = Math.min(1, Math.max(0, length / 200));
    const actionabilityScore = Math.min(1, VisionUtils.analyzeStatementComponents(statement).hasObjectives ? 0.8 : 0.3);
    const inspirationalScore = Math.min(1, Math.max(0, (length > 100 ? 0.7 : 0.4) + (words > 50 ? 0.2 : 0)));
    
    return {
      clarityScore,
      specificityScore,
      actionabilityScore,
      inspirationalScore
    };
  },

  /**
   * Generates suggestions for improving a vision statement
   */
  generateImprovementSuggestions: (vision: Vision): string[] => {
    const suggestions: string[] = [];
    
    if (vision.statement.length < 50) {
      suggestions.push('Consider expanding the vision statement to be more descriptive');
    }
    
    if (vision.clarityScore !== undefined && vision.clarityScore < 0.6) {
      suggestions.push('Make the vision statement clearer and easier to understand');
    }
    
    if (vision.specificityScore !== undefined && vision.specificityScore < 0.6) {
      suggestions.push('Add more specific details about what you want to achieve');
    }
    
    if (!vision.hasObjectives) {
      suggestions.push('Include specific objectives or goals in your vision');
    }
    
    if (!vision.hasTimeframe) {
      suggestions.push('Consider adding a timeframe for when you want to achieve this vision');
    }
    
    if (!vision.hasMeasurables) {
      suggestions.push('Include measurable outcomes or metrics to track progress');
    }
    
    if (vision.confidence < 0.7) {
      suggestions.push('Refine the vision to increase confidence and clarity');
    }
    
    return suggestions;
  }
};