/**
 * Agent Communication Contract Types
 * 
 * Bidirectional communication protocol between agents and the Virtual First Officer.
 */

// ============================================================================
// AGENT-TO-OFFICER MESSAGE TYPES
// ============================================================================

/**
 * Types of messages agents can send to First Officer
 */
export type AgentToOfficerMessageType = 
  | 'clarification-request'    // Agent needs clarification on task
  | 'blocker-report'          // Agent is blocked and needs help
  | 'progress-update'         // Proactive progress report
  | 'resource-request'        // Agent needs additional resources
  | 'assistance-request'      // Agent needs help from another agent
  | 'completion-report'       // Task completed, awaiting next steps
  | 'error-report'           // Agent encountered an error
  | 'capability-update';      // Agent's capabilities have changed

/**
 * Base structure for agent-to-officer messages
 */
export interface AgentToOfficerMessage {
  id: string;
  expeditionId: string;
  agentId: string;
  agentName: string;
  messageType: AgentToOfficerMessageType;
  taskId?: string;              // Related task if applicable
  taskTitle?: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: string;
  metadata?: Record<string, any>;
  requiresResponse: boolean;
}

// ============================================================================
// OFFICER-TO-AGENT MESSAGE TYPES
// ============================================================================

/**
 * Types of messages First Officer can send to agents
 */
export type OfficerToAgentMessageType = 
  | 'task-assignment'         // Assigning a new task
  | 'clarification-response'  // Response to clarification request
  | 'guidance'               // Proactive guidance or tips
  | 'priority-update'        // Task priority has changed
  | 'resource-allocation'    // Resources allocated to agent
  | 'assistance-approval'    // Approved assistance from another agent
  | 'status-inquiry'        // Asking for status update
  | 'encouragement'         // Motivational message
  | 'strategy-update';      // Update on overall strategy

/**
 * Base structure for officer-to-agent messages
 */
export interface OfficerToAgentMessage {
  id: string;
  expeditionId: string;
  agentId: string;
  agentName: string;
  messageType: OfficerToAgentMessageType;
  taskId?: string;
  content: string;
  timestamp: string;
  inResponseTo?: string;        // ID of agent message being responded to
  actionRequired: boolean;
  metadata?: Record<string, any>;
}

// ============================================================================
// COMMUNICATION CONTEXT
// ============================================================================

/**
 * Agent's awareness context of their First Officer
 */
export interface AgentFirstOfficerContext {
  expeditionId: string;
  expeditionTitle: string;
  firstOfficerId: string;       // Virtual First Officer instance ID
  firstOfficerName: string;     // Always "First Officer" for VFO
  communicationProtocol: 'bidirectional';
  lastContactTime?: string;
  assignedTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
  }>;
  canRequestClarification: boolean;
  canReportBlockers: boolean;
  canRequestAssistance: boolean;
}

// ============================================================================
// SPECIALIZED MESSAGE STRUCTURES
// ============================================================================

/**
 * Detailed clarification request from agent
 */
export interface ClarificationRequest extends AgentToOfficerMessage {
  messageType: 'clarification-request';
  clarificationNeeded: {
    aspect: 'task-objective' | 'technical-approach' | 'requirements' | 'constraints' | 'deliverables' | 'other';
    specificQuestion: string;
    currentUnderstanding: string;
    proposedApproach?: string;
  };
}

/**
 * First Officer's clarification response
 */
export interface ClarificationResponse extends OfficerToAgentMessage {
  messageType: 'clarification-response';
  clarification: {
    answer: string;
    additionalContext?: string;
    examples?: string[];
    resources?: string[];
    modifiedRequirements?: Record<string, any>;
  };
}

/**
 * Blocker report from agent
 */
export interface BlockerReport extends AgentToOfficerMessage {
  messageType: 'blocker-report';
  blocker: {
    type: 'technical' | 'dependency' | 'resource' | 'knowledge' | 'access' | 'other';
    description: string;
    impact: 'minor' | 'major' | 'critical';
    attemptedSolutions: string[];
    suggestedResolution?: string;
    blockedSince: string;
  };
}

/**
 * Guidance from First Officer
 */
export interface GuidanceMessage extends OfficerToAgentMessage {
  messageType: 'guidance';
  guidance: {
    type: 'solution' | 'workaround' | 'approach' | 'best-practice';
    steps: string[];
    rationale?: string;
    expectedOutcome?: string;
    alternativeApproaches?: string[];
  };
}

/**
 * Progress update from agent
 */
export interface ProgressUpdate extends AgentToOfficerMessage {
  messageType: 'progress-update';
  progress: {
    percentComplete: number;
    milestonesCompleted: string[];
    currentActivity: string;
    estimatedTimeRemaining?: number; // in minutes
    confidence: 'low' | 'medium' | 'high';
    insights?: string[];          // Discoveries or learnings
  };
}

/**
 * Request for assistance from another agent
 */
export interface AssistanceRequest extends AgentToOfficerMessage {
  messageType: 'assistance-request';
  assistance: {
    type: 'collaboration' | 'review' | 'expertise' | 'pair-work';
    skillsNeeded: string[];
    estimatedDuration: number;    // in minutes
    description: string;
    preferredAgent?: string;      // Agent name if they have preference
  };
}

// ============================================================================
// COMMUNICATION HANDLERS
// ============================================================================

/**
 * Interface for handling bidirectional communication
 */
export interface BidirectionalCommunicationHandler {
  // Agent-side methods
  sendToFirstOfficer(message: AgentToOfficerMessage): Promise<void>;
  handleOfficerMessage(message: OfficerToAgentMessage): Promise<void>;
  
  // Officer-side methods
  handleAgentMessage(message: AgentToOfficerMessage): Promise<void>;
  sendToAgent(agentId: string, message: OfficerToAgentMessage): Promise<void>;
  
  // Common methods
  getConversationHistory(expeditionId: string, agentId: string): Promise<Array<AgentToOfficerMessage | OfficerToAgentMessage>>;
  subscribeToMessages(expeditionId: string, callback: (message: any) => void): void;
  unsubscribeFromMessages(expeditionId: string): void;
}

// ============================================================================
// REAL-TIME EVENTS
// ============================================================================

/**
 * Real-time event types for WebSocket communication
 */
export type CommunicationEventType = 
  | 'agent-message'
  | 'officer-message'
  | 'agent-online'
  | 'agent-offline'
  | 'officer-available'
  | 'officer-busy';

/**
 * Real-time communication event
 */
export interface CommunicationEvent {
  type: CommunicationEventType;
  expeditionId: string;
  timestamp: string;
  data: any;
}