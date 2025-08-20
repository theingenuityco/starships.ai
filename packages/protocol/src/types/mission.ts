/**
 * Mission System Types
 * 
 * Clean, minimal types for the new mission system.
 * Starting with just the essentials for a blank canvas approach.
 */

import type { Agent } from '../index';

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
// MISSION WORKFLOW TYPES
// ============================================================================

/**
 * Mission workflow - executable workflow DSL for mission execution
 */
export interface MissionWorkflow {
  id: string;
  missionId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
}

/**
 * Individual node in the workflow graph
 */
export interface WorkflowNode {
  id: string;
  type: 'start' | 'agent' | 'end';
  name: string;
  description: string;
  parameters: Record<string, any>;
}

/**
 * Edge connecting workflow nodes
 */
export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
}

/**
 * Request to create a new mission workflow
 */
export interface CreateWorkflowRequest {
  missionId: string;
  nodes: (Omit<WorkflowNode, 'id'> & { aiId?: string })[];
  edges: Omit<WorkflowEdge, 'id'>[];
}

/**
 * Request to update workflow approval status
 */
export interface UpdateWorkflowApprovalRequest {
  approvalStatus: 'approved' | 'rejected';
  rejectionReason?: string;
}

/**
 * Response containing workflow data with associated agent details
 */
export interface WorkflowResponse {
  workflow: MissionWorkflow;
  agents: Record<string, Agent>; // agentId -> Agent details
}