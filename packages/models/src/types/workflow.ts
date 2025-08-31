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

