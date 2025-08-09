/**
 * Mission System Types
 * 
 * Clean, minimal types for the new mission system.
 * Starting with just the essentials for a blank canvas approach.
 */

// ============================================================================
// CORE MISSION TYPES
// ============================================================================

/**
 * Main mission entity - simplified and clean
 */
export interface Mission {
  id: string;
  starshipId: string;
  name: string;
  description: string;
  status: MissionStatus;
  agentIds: string[]; // Assigned agent IDs from starship's crew
  createdAt: string;
  updatedAt: string;
  createdBy: string; // User ID
}

/**
 * Mission status - simplified lifecycle
 */
export type MissionStatus = 
  | 'draft'        // Created but not started
  | 'active'       // Currently running
  | 'completed'    // Successfully finished
  | 'failed'       // Failed to complete
  | 'cancelled';   // Cancelled by user

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new mission
 */
export interface CreateMissionRequest {
  starshipId: string;
  name: string;
  description: string;
  agentIds: string[]; // Agent IDs to assign to this mission
}

/**
 * Request to update a mission
 */
export interface UpdateMissionRequest {
  name?: string;
  description?: string;
  status?: MissionStatus;
  agentIds?: string[]; // Update agent assignments
}

/**
 * Response containing mission data
 */
export interface MissionResponse {
  mission: Mission;
}

/**
 * Response for mission list
 */
export interface MissionListResponse {
  missions: Mission[];
  total: number;
}

// ============================================================================
// FILTER AND QUERY TYPES
// ============================================================================

/**
 * Filters for querying missions
 */
export interface MissionFilters {
  status?: MissionStatus[];
  createdBy?: string;
  starshipId?: string;
}

/**
 * Sorting options for missions
 */
export interface MissionSort {
  field: 'createdAt' | 'updatedAt' | 'status' | 'name';
  direction: 'asc' | 'desc';
}