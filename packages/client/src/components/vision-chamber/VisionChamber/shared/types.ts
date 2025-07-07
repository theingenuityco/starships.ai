// Base types from backend (matching packages/models/src/types.ts)
export interface Goal {
  id: string;
  codexId: string;
  type: 'short_term' | 'long_term' | 'milestone';
  description: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  priority: number;     // 1-10
  targetDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Constraint {
  id: string;
  codexId: string;
  type: 'resource' | 'ethical' | 'technical' | 'business';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Client-side enhanced interfaces
export interface GoalWithStatus extends Goal {
  isNew?: boolean;
  isModified?: boolean;
  originalValue?: Partial<Goal>;
}

export interface ConstraintWithSeverity extends Constraint {
  isNew?: boolean;
  isModified?: boolean;
  originalValue?: Partial<Constraint>;
}

// Maker-Checker Flow Types
export interface PendingChange {
  id: string;
  type: 'vision' | 'goal' | 'constraint';
  operation: 'create' | 'update' | 'delete';
  target: string; // Entity ID or 'new' for creates
  changes: Record<string, any>; // The actual changes
  before?: Record<string, any>; // Previous state for updates/deletes
  after?: Record<string, any>;  // New state for creates/updates
  source: 'user' | 'agent' | 'system';
  timestamp: string;
  preview?: any; // Computed preview state
  conflicts?: string[]; // Potential conflicts with other changes
}

export interface ChangeQueue {
  starshipId: string;
  changes: PendingChange[];
  totalChanges: number;
  lastUpdated: string;
  hasConflicts: boolean;
}

// UI State Types
export interface VisionChamberState {
  activeTab?: 'vision' | 'goals' | 'constraints' | 'approval';
  isLoading: boolean;
  error?: string;
  expandedSections: Set<string>;
}

// Goal Creation/Editing Types
export interface GoalFormData {
  description: string;
  type: Goal['type'];
  priority: number;
  targetDate?: string;
}

export interface ConstraintFormData {
  description: string;
  type: Constraint['type'];
  severity: Constraint['severity'];
  isActive: boolean;
}

// Filter and Sort Types
export interface GoalFilters {
  status?: Goal['status'][];
  type?: Goal['type'][];
  priority?: { min: number; max: number };
  hasTargetDate?: boolean;
}

export interface ConstraintFilters {
  type?: Constraint['type'][];
  severity?: Constraint['severity'][];
  isActive?: boolean;
}

export type GoalSortBy = 'priority' | 'createdAt' | 'targetDate' | 'description';
export type ConstraintSortBy = 'severity' | 'type' | 'createdAt' | 'description';

// Auto-Influence System Types
export interface InfluenceSuggestion {
  id: string;
  type: 'goal' | 'constraint';
  source: 'vision_change' | 'goal_completion' | 'agent_observation';
  suggestion: GoalFormData | ConstraintFormData;
  confidence: number; // 0-100
  reasoning: string;
  timestamp: string;
}

// Component Props Types
export interface VisionChamberProviderProps {
  children: React.ReactNode;
  starshipId?: string;
}

export interface GoalsMatrixProps {
  className?: string;
  goals: GoalWithStatus[];
  onGoalCreate: (data: GoalFormData) => void;
  onGoalUpdate: (id: string, changes: Partial<Goal>) => void;
  onGoalDelete: (id: string) => void;
  loading?: boolean;
  error?: string;
}

export interface ConstraintsGridProps {
  className?: string;
  constraints: ConstraintWithSeverity[];
  onConstraintCreate: (data: ConstraintFormData) => void;
  onConstraintUpdate: (id: string, changes: Partial<Constraint>) => void;
  onConstraintDelete: (id: string) => void;
  loading?: boolean;
  error?: string;
} 