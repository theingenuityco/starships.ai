/**
 * Database Workflow Types
 *
 * Database-specific workflow interfaces and API contract types.
 * Imports workflow types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type {
  Blueprint,
  Node,
  Edge
} from '@starships/autopilot';

// ============================================================================
// LEGACY WORKFLOW SUPPORT TYPES (for backward compatibility)
// ============================================================================

/**
 * Legacy CreateWorkflowRequest interface for WorkflowParsingService
 * TODO: Migrate to autopilot Blueprint pattern
 */
export interface CreateWorkflowRequest {
  missionId?: string;
  expeditionId?: string;
  nodes: Array<{
    type: string;
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    aiId?: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
  }>;
}

/**
 * Legacy MissionWorkflow interface for MissionPromptBuilder
 * TODO: Migrate to autopilot Blueprint pattern
 */
export interface MissionWorkflow {
  nodes: Array<{
    id: string; // Legacy field for backward compatibility
    ref?: string; // Autopilot field
    type: string;
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
  edges: Array<{
    ref?: string; // Autopilot field
    from: string;
    to: string;
    condition?: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }>;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'modified';
  createdAt: string;
}

// ============================================================================
// RE-EXPORT AUTOPILOT TYPES
// ============================================================================

// Re-export autopilot types for convenience
export type {
  Blueprint,
  Node,
  Edge
} from '@starships/autopilot';