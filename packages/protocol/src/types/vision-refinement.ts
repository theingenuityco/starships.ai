// Vision refinement types for real-time updates and Socket.IO events

// VisionMetrics interface for tracking vision quality
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

// Vision analysis result from AI
export interface VisionAnalysisResult {
  currentVision: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  metrics: VisionMetrics;
  overallConfidence: number;
  timestamp: string;
}

// Vision refinement proposal
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

// Vision refinement session state
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

// Socket.IO event data types for vision refinement
export interface VisionAnalyzingEventData {
  starshipId: string;
  userId: string;
  sessionId: string;
  vision: string;
  timestamp: string;
}

export interface VisionProposalEventData {
  starshipId: string;
  userId: string;
  sessionId: string;
  proposal: VisionRefinementProposal;
  timestamp: string;
}

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

export interface VisionAnalysisEventData {
  starshipId: string;
  userId: string;
  sessionId: string;
  analysis: VisionAnalysisResult;
  timestamp: string;
}

export interface VisionRefinementErrorEventData {
  starshipId: string;
  userId: string;
  sessionId?: string;
  error: string;
  errorCode: 'ANALYSIS_FAILED' | 'REFINEMENT_FAILED' | 'RATE_LIMITED' | 'INVALID_INPUT' | 'SESSION_EXPIRED';
  recoverable: boolean;
  timestamp: string;
}

// Request types for vision refinement operations
export interface VisionAnalysisRequest {
  starshipId: string;
  vision: string;
  userId: string;
  sessionId?: string;
}

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

export interface VisionUpdateRequest {
  starshipId: string;
  newVision: string;
  userId: string;
  sessionId?: string;
  source: 'user_acceptance' | 'direct_update' | 'chat_integration';
}

// Rate limiting types
export interface VisionRefinementRateLimit {
  userId: string;
  requests: number;
  windowStart: number;
  windowDurationMs: number;
  maxRequests: number;
}

// Socket.IO events for vision refinement
export interface VisionRefinementSocketEvents {
  // Client to Server events
  'vision:analyze': (request: VisionAnalysisRequest, callback?: (response: { success: boolean; error?: string; sessionId?: string }) => void) => void;
  'vision:refine': (request: VisionRefinementRequest, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:accept-proposal': (data: { starshipId: string; sessionId: string; userId: string }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:reject-proposal': (data: { starshipId: string; sessionId: string; userId: string; feedback?: string[] }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:update': (request: VisionUpdateRequest, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:get-state': (data: { starshipId: string; userId: string }, callback?: (response: { success: boolean; state?: VisionRefinementState; error?: string }) => void) => void;
  
  // Server to Client events
  'vision:analyzing': (data: VisionAnalyzingEventData) => void;
  'vision:analysis-complete': (data: VisionAnalysisEventData) => void;
  'vision:proposal': (data: VisionProposalEventData) => void;
  'vision:updated': (data: VisionUpdatedEventData) => void;
  'vision:state-changed': (data: VisionRefinementState) => void;
  'vision:error': (data: VisionRefinementErrorEventData) => void;
  
  // Room management for vision refinement
  'vision:join-starship-room': (data: { starshipId: string; userId: string }) => void;
  'vision:leave-starship-room': (data: { starshipId: string; userId: string }) => void;
}

// Utility types for vision refinement
export type VisionRefinementEventType = keyof VisionRefinementSocketEvents;

export interface VisionRefinementContext {
  sessionId: string;
  starshipId: string;
  userId: string;
  currentVision: string;
  awaitingConfirmation: boolean;
  lastActivity: Date;
}

// Combined interface for all vision refinement functionality
export interface VisionRefinementProtocol {
  events: VisionRefinementSocketEvents;
  types: {
    VisionMetrics: VisionMetrics;
    VisionAnalysisResult: VisionAnalysisResult;
    VisionRefinementProposal: VisionRefinementProposal;
    VisionRefinementState: VisionRefinementState;
    VisionRefinementContext: VisionRefinementContext;
  };
  requests: {
    VisionAnalysisRequest: VisionAnalysisRequest;
    VisionRefinementRequest: VisionRefinementRequest;
    VisionUpdateRequest: VisionUpdateRequest;
  };
  responses: {
    VisionAnalysisEventData: VisionAnalysisEventData;
    VisionProposalEventData: VisionProposalEventData;
    VisionUpdatedEventData: VisionUpdatedEventData;
    VisionRefinementErrorEventData: VisionRefinementErrorEventData;
  };
}