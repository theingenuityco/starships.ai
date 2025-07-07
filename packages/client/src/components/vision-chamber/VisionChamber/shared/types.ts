// Base types from backend (matching packages/models/src/types.ts)
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
export interface ConstraintWithSeverity extends Constraint {
  isNew?: boolean;
  isModified?: boolean;
  originalValue?: Partial<Constraint>;
}

// Maker-Checker Flow Types
export interface PendingChange {
  id: string;
  type: 'vision' | 'constraint';
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
  activeTab?: 'vision' | 'constraints' | 'approval';
  isLoading: boolean;
  error?: string;
  expandedSections: Set<string>;
}

// Vision Refinement Types
export interface VisionRefinementFormData {
  currentStatement: string;
  suggestedStatement: string;
  improvementType: 'clarity' | 'scope' | 'purpose' | 'action';
  reasoning: string;
}

export interface ConstraintFormData {
  description: string;
  type: Constraint['type'];
  severity: Constraint['severity'];
  isActive: boolean;
}

// Filter and Sort Types
export interface ConstraintFilters {
  type?: Constraint['type'][];
  severity?: Constraint['severity'][];
  isActive?: boolean;
}

export type ConstraintSortBy = 'severity' | 'type' | 'createdAt' | 'description';

// Auto-Influence System Types
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

// Component Props Types
export interface VisionChamberProviderProps {
  children: React.ReactNode;
  starshipId?: string;
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