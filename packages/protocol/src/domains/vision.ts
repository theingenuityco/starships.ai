/**
 * Vision Refinement Collection Types
 *
 * Types for real-time vision refinement and analysis functionality.
 */

// ============================================================================
// CORE VISION ENTITY
// ============================================================================

/**
 * Core vision entity
 */
export interface VisionModel {
  id: string;
  starshipId: string; // Direct FK to Starship
  statement: string;
  confidence: number;
  refinementCount: number;
  lastRefined: string;
  isActive: boolean;
  
  // Vision Metrics
  clarityScore?: number;
  specificityScore?: number;
  actionabilityScore?: number;
  inspirationalScore?: number;
  overallQuality?: number;
  hasObjectives?: boolean;
  hasTimeframe?: boolean;
  hasMeasurables?: boolean;
  
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// VISION METRICS AND ANALYSIS
// ============================================================================

/**
 * Vision quality metrics for tracking vision clarity
 */
export interface VisionMetrics {
  // Quality scores (0-100)
  clarityScore: number;
  specificityScore: number;
  actionabilityScore: number;
  inspirationalScore: number;
  
  // Completeness checks
  hasObjectives: boolean;
  hasTimeframe: boolean;
  hasMeasurables: boolean;
  
  // Overall assessment
  overallQuality: number;
  confidence: number;
  refinementCount: number;
}

/**
 * Vision analysis result from AI
 */
export interface VisionAnalysisResult {
  currentVision: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  metrics: VisionMetrics;
  overallConfidence: number;
  timestamp: string;
}

/**
 * Vision refinement proposal
 */
export interface VisionRefinementProposal {
  originalVision: string;
  proposedVision: string;
  reasoning: string;
  keyChanges: string[];
  confidenceLevel: number;
  metrics: VisionMetrics;
  requiresConfirmation: boolean;
  timestamp: string;
}

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

/**
 * Vision refinement session state
 */
export interface VisionRefinementState {
  sessionId: string;
  starshipId: string;
  userId: string;
  currentVision: string;
  proposedVision?: string;
  awaitingConfirmation: boolean;
  refinementCount: number;
  lastUpdate: string;
  isAnalyzing: boolean;
}

/**
 * Vision refinement context for operations
 */
export interface VisionRefinementContext {
  sessionId: string;
  starshipId: string;
  userId: string;
  currentVision: string;
  awaitingConfirmation: boolean;
  lastActivity: Date;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request for vision analysis
 */
export interface VisionAnalysisRequest {
  starshipId: string;
  vision: string;
  userId: string;
  sessionId?: string;
}

/**
 * Request for vision refinement
 */
export interface VisionRefinementRequest {
  starshipId: string;
  currentVision: string;
  userMessage: string;
  userId: string;
  sessionId: string;
  conversationContext?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
}

/**
 * Request to update vision
 */
export interface VisionUpdateRequest {
  starshipId: string;
  newVision: string;
  userId: string;
  sessionId?: string;
  source: 'user_acceptance' | 'direct_update' | 'chat_integration';
}

// ============================================================================
// EVENT DATA TYPES
// ============================================================================

/**
 * Vision analyzing event data for Socket.IO
 */
export interface VisionAnalyzingEventData {
  starshipId: string;
  userId: string;
  sessionId: string;
  vision: string;
  timestamp: string;
}

/**
 * Vision proposal event data for Socket.IO
 */
export interface VisionProposalEventData {
  starshipId: string;
  userId: string;
  sessionId: string;
  proposal: VisionRefinementProposal;
  timestamp: string;
}

/**
 * Vision updated event data for Socket.IO
 */
export interface VisionUpdatedEventData {
  starshipId: string;
  userId: string;
  sessionId: string;
  oldVision: string;
  newVision: string;
  metrics: VisionMetrics;
  refinementCount: number;
  timestamp: string;
  updateSource: 'user_acceptance' | 'direct_update' | 'chat_integration';
}

/**
 * Vision analysis event data for Socket.IO
 */
export interface VisionAnalysisEventData {
  starshipId: string;
  userId: string;
  sessionId: string;
  analysis: VisionAnalysisResult;
  timestamp: string;
}

/**
 * Vision refinement error event data
 */
export interface VisionRefinementErrorEventData {
  starshipId: string;
  userId: string;
  sessionId?: string;
  error: string;
  errorCode: 'ANALYSIS_FAILED' | 'REFINEMENT_FAILED' | 'RATE_LIMITED' | 'INVALID_INPUT' | 'SESSION_EXPIRED';
  recoverable: boolean;
  timestamp: string;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Vision refinement rate limiting
 */
export interface VisionRefinementRateLimit {
  userId: string;
  requests: number;
  windowStart: number;
  windowDurationMs: number;
  maxRequests: number;
}

// ============================================================================
// VISION SOCKET EVENTS
// ============================================================================

/**
 * Vision refinement Socket.IO events
 */
export interface VisionSocketEvents {
  // Client to Server events
  'vision:analyze': (request: VisionAnalysisRequest, callback?: (response: { success: boolean; error?: string; sessionId?: string }) => void) => void;
  'vision:refine': (request: VisionRefinementRequest, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:accept-proposal': (data: { starshipId: string; sessionId: string; userId: string }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:reject-proposal': (data: { starshipId: string; sessionId: string; userId: string; feedback?: string[] }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:update': (request: VisionUpdateRequest, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:get-state': (data: { starshipId: string; userId: string }, callback?: (response: { success: boolean; state?: VisionRefinementState; error?: string }) => void) => void;
  
  // Server to Client events
  'vision:analyzing': (data: VisionAnalysisEventData) => void;
  'vision:analysis-complete': (data: VisionAnalysisEventData) => void;
  'vision:proposal': (data: VisionProposalEventData) => void;
  'vision:updated': (data: VisionUpdatedEventData) => void;
  'vision:state-changed': (data: VisionUpdatedEventData) => void;
  'vision:error': (data: VisionRefinementErrorEventData) => void;
  
  // Room management for vision refinement
  'vision:join-starship-room': (data: { starshipId: string; userId: string }) => void;
  'vision:leave-starship-room': (data: { starshipId: string; userId: string }) => void;
}
