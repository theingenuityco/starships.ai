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
  phase: MissionPhase;
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

/**
 * Mission phase - controls chat behavior and UI sections
 */
export type MissionPhase = 
  | 'init'         // Initial setup and context building
  | 'welcome'      // Initial welcome and mission introduction
  | 'analysis'     // Mission analysis and breakdown
  | 'plan'         // Mission execution planning and approval
  | 'converse';    // General conversation and mission guidance

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
  phase?: MissionPhase;
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

// ============================================================================
// MISSION ORCHESTRATOR MESSAGE TYPES
// ============================================================================

/**
 * Mission message roles - determines UI styling and behavior
 */
export type MissionMessageRole = 
  | 'user'         // Human user messages
  | 'orchestrator' // AI orchestrator responses
  | 'system';      // System notifications

/**
 * Core message entity for mission orchestrator communication
 */
export interface MissionMessage {
  id: string;
  missionId: string;
  role: MissionMessageRole;
  content: string;
  timestamp: string;
  
  // Neo4j relationship support
  userId?: string;        // Set when role = 'user'
  
  // Display support
  senderName?: string;    // Cached display name
  
  // Extensibility
  metadata?: Record<string, any>;
}

/**
 * Request to send a message to mission orchestrator
 */
export interface SendMissionMessageRequest {
  missionId: string;
  content: string;
}

/**
 * Response from mission orchestrator
 */
export interface MissionChatResponse {
  reply: string;
}

// ============================================================================
// MISSION CLARITY TYPES
// ============================================================================

/**
 * Mission clarity assessment - tracks 5-dimension clarity scoring
 * Used by AI to systematically assess and improve mission understanding
 */
export interface MissionClarity {
  id: string;
  missionId: string;
  objectiveClarity: number;        // 0-10: How specific and clear is the mission objective?
  successMetrics: number;          // 0-10: Are success criteria well-defined?
  timelineDefinition: number;      // 0-10: Is the timeline clear and realistic?
  scopeBoundaries: number;         // 0-10: Are the boundaries and limitations defined?
  visionAlignment: number;         // 0-10: How well does it align with the vision?
  overallScore: number;            // Calculated average of the 5 dimensions
  reasoning: string;               // AI qualitative analysis and explanation
  iteration: number;               // Which evaluation iteration (starts at 1)
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to create a new mission clarity assessment
 */
export interface CreateMissionClarityRequest {
  missionId: string;
  objectiveClarity: number;
  successMetrics: number;
  timelineDefinition: number;
  scopeBoundaries: number;
  visionAlignment: number;
  reasoning: string;
  iteration: number;
}

/**
 * Request to update an existing mission clarity assessment
 */
export interface UpdateMissionClarityRequest {
  objectiveClarity?: number;
  successMetrics?: number;
  timelineDefinition?: number;
  scopeBoundaries?: number;
  visionAlignment?: number;
  reasoning?: string;
  iteration?: number;
}

// ============================================================================
// MISSION PLAN TYPES
// ============================================================================

/**
 * Mission execution plan - contains tasks and approval status
 */
export interface MissionPlan {
  id: string;
  missionId: string;
  tasks: MissionTask[];
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalTimestamp?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Individual task within a mission plan
 */
export interface MissionTask {
  id: string;
  title: string;
  description: string;
  assignedAgentId: string;
  dependencies: string[]; // prerequisite task IDs
  deliverable: string;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Request to create a new mission plan
 */
export interface CreateMissionPlanRequest {
  missionId: string;
  tasks: Omit<MissionTask, 'id'>[];
}

/**
 * Request to update an existing mission plan
 */
export interface UpdateMissionPlanRequest {
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvalTimestamp?: string;
}

/**
 * Response for mission plan with runtime calculations
 */
export interface MissionPlanResponse extends MissionPlan {
  agentAssignments: Record<string, string[]>; // Runtime calculation
}