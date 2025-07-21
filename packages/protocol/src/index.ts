export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatRequest {
  agent_id: string;
  user_id: string;
  channel_id?: string;
  message: string;
  stream?: boolean;
}

export interface ChatResponse {
  reply: string;
  usage?: UsageStats;
}

// Define Agent interface directly to avoid circular dependency
export interface Agent {
  // Existing fields
  id: string;
  name: string;
  model: string;
  systemPrompt?: string;
  createdAt: string;

  // Enhanced marketplace fields
  description?: string;
  tags: string[];
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  authorId: string;
  isPublic: boolean;
  version: string;
  updatedAt: string;
  usageCount: number;
  rating?: number;

  // Advanced configuration
  temperature?: number;
  maxTokens?: number;
  customInstructions?: string;

  // Deployment settings
  starshipId: string;
  allowedStarshipClasses?: ('scout' | 'cruiser')[];
  requiredPermissions?: string[];
}

export interface AgentConfig extends Agent {
  provider?: 'openai' | 'anthropic';
}

// ADD: New interfaces for enhanced functionality
export interface CreateAgentRequest {
  name: string;
  description?: string;
  category: Agent['category'];
  systemPrompt?: string;
  model: string;
  tags?: string[];
  isPublic?: boolean;
  temperature?: number;
  maxTokens?: number;
  customInstructions?: string;
  allowedStarshipClasses?: ('scout' | 'cruiser')[];
  authorId?: string;
  starshipId: string; // REQUIRED for new agents
}

export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  version?: string;
  starshipId?: string; // Allow updating starship assignment
}

export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface EnhancedMemoryEntry extends MemoryEntry {
  embedding?: number[];
  importance?: number;
  summary?: string;
}

export interface MemorySearchResult {
  entries: EnhancedMemoryEntry[];
  relevanceScores: number[];
}

export type SessionKey = string;

export interface LLMChatPrompt {
  messages: Array<{ role: 'system' | 'assistant' | 'user'; content: string }>;
}

export interface LLMResult {
  reply: string;
  usage?: UsageStats;
}

export interface LLMProvider {
  complete(
    prompt: LLMChatPrompt,
    opts?: {
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMResult>;
  
  completeStream(
    prompt: LLMChatPrompt,
    opts?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string, void, unknown>;
}

// NEW: Agent Templates System
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  tags: string[];

  // Template configuration
  systemPrompt: string;
  model: string; // References LLM.id
  temperature?: number;
  maxTokens?: number;

  // Template metadata
  authorId: string;
  isPublic: boolean;
  usageCount: number;
  rating?: number;

  // Template preview
  icon?: string;
  previewPrompts?: string[]; // Example prompts to show what the template can do

  createdAt: string;
  updatedAt: string;
}

// Sibil-specific interfaces
export interface ContentBlock {
  type: 'text' | 'markdown' | 'code' | 'table';
  content: string;
  metadata?: {
    language?: string;
    headers?: string[];
  };
}

export interface SibilRequest {
  provider: 'openai' | 'anthropic';
  model?: string;
  message: string;
  user_id: string;
  session_id?: string;
}

export interface SibilResponse {
  content: string;
  structured_content?: ContentBlock[];
  provider: 'openai' | 'anthropic';
  model: string;
  usage?: UsageStats;
}

// Streaming interfaces for Sibil
export interface SibilStreamRequest extends SibilRequest {
  stream: true;
}

export interface SibilStreamChunk {
  type: 'content' | 'structured' | 'complete' | 'error' | 'connected';
  content?: string;
  structured_content?: ContentBlock[];
  provider?: 'openai' | 'anthropic';
  model?: string;
  usage?: UsageStats;
  error?: string;
  chunk_id?: string;
  is_final?: boolean;
  stream_id?: string;
}

export interface SibilStreamResponse {
  stream_id: string;
  status: 'started' | 'streaming' | 'completed' | 'error';
}

// Legacy Socket.IO Event Definitions (kept for backward compatibility)
export interface SocketIOEvents {
  // Sibil Client to Server events
  'sibil:start-stream': (request: SibilSocketRequest) => void;
  'sibil:stop-stream': (streamId: string) => void;
  'sibil:join-room': (userId: string) => void;
  'sibil:leave-room': (userId: string) => void;

  // Sibil Server to Client events
  'sibil:stream-start': (streamId: string) => void;
  'sibil:stream-chunk': (chunk: SibilSocketStreamChunk) => void;
  'sibil:stream-complete': (response: SibilResponse) => void;
  'sibil:stream-error': (error: SibilStreamError) => void;
  'sibil:typing-start': () => void;
  'sibil:typing-stop': () => void;

  // Agent Chat Client to Server events
  'agent:start-stream': (request: AgentSocketRequest) => void;
  'agent:stop-stream': (streamId: string) => void;
  'agent:join-room': (userId: string, agentId: string) => void;
  'agent:leave-room': (userId: string, agentId: string) => void;

  // Agent Chat Server to Client events
  'agent:stream-start': (streamId: string, agentId: string) => void;
  'agent:stream-chunk': (chunk: AgentSocketStreamChunk) => void;
  'agent:stream-complete': (response: AgentChatResponse) => void;
  'agent:stream-error': (error: AgentStreamError) => void;
  'agent:typing-start': (agentId: string) => void;
  'agent:typing-stop': (agentId: string) => void;

  // Expedition Client to Server events
  'expedition:join': (expeditionId: string) => void;
  'expedition:leave': (expeditionId: string) => void;
  'expedition:send-message': (data: { expeditionId: string; message: string }) => void;
  'expedition:start': (expeditionId: string) => void;
  'expedition:pause': (expeditionId: string) => void;
  'expedition:cancel': (expeditionId: string) => void;

  // Expedition Server to Client events
  'expedition:created': (data: any) => void;
  'expedition:updated': (data: any) => void;
  'expedition:deleted': (data: any) => void;
  'expedition:started': (data: any) => void;
  'expedition:paused': (data: any) => void;
  'expedition:resumed': (data: any) => void;
  'expedition:cancelled': (data: any) => void;
  'expedition:completed': (data: any) => void;
  'expedition:status-update': (data: any) => void;
  'expedition:task-assigned': (data: any) => void;
  'expedition:task-completed': (data: any) => void;
  'expedition:message': (data: any) => void;
  'expedition:error': (data: any) => void;
  'expedition:phase-change': (data: any) => void;
  'expedition:result-available': (data: any) => void;

  // Common events
  'connection-status': (status: ConnectionStatus) => void;
}

// Enhanced request for Socket.IO
export interface SibilSocketRequest extends SibilRequest {
  stream_id: string;
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
}

// Typewriter-specific types
export interface TypewriterChunk {
  type: 'character' | 'word' | 'line' | 'complete';
  content: string;
  position: number;
  total_length?: number;
  delay?: number; // milliseconds
  is_code?: boolean;
  is_markdown?: boolean;
}

// Enhanced streaming chunk for Socket.IO
export interface SibilSocketStreamChunk extends SibilStreamChunk {
  stream_id: string;
  typewriter?: TypewriterChunk;
  typing_speed?: number;
  timestamp: number;
}

// Connection and error types
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

export interface SibilStreamError {
  stream_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

// Socket.IO client state
export interface SocketConnectionState {
  connected: boolean;
  authenticated: boolean;
  room_joined: boolean;
  user_id?: string;
  connection_id?: string;
  last_ping?: number;
}

// Agent Chat Socket.IO Interfaces
export interface AgentSocketRequest {
  agent_id: string;
  session_id: string;
  message: string;
  stream_id: string;
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
  user_id: string; // From auth context
}

export interface AgentSocketStreamChunk {
  stream_id: string;
  agent_id: string;
  type: 'content' | 'complete' | 'error';
  content?: string;
  typewriter?: TypewriterChunk;
  timestamp: number;
}

export interface AgentChatResponse {
  content: string;
  agent_id: string;
  session_id: string;
  timestamp: string;
  usage?: UsageStats;
}

export interface AgentStreamError {
  stream_id?: string;
  agent_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

// Export starship-related types
export * from './types/starship';

// Export expedition-related types
export * from './types/expedition';

// Export enhanced Socket.IO event types
export * from './types/socket-events';

// Export standardized error handling types and classes
export * from './types/errors';

// Export error classes with explicit naming to avoid conflicts
export {
  StandardError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  NetworkError,
  BusinessLogicError,
  ErrorFactory
} from './types/error-classes';

// Re-export specific types to resolve naming conflicts
export type {
  ExpeditionError as LegacyExpeditionError,
  ExpeditionErrorCode as LegacyExpeditionErrorCode
} from './types/expedition';

// Re-export specific types to avoid conflicts
export type {
  EnhancedSocketIOEvents,
  EventEmissionOptions,
  EventEmissionResult,
  SocketExpeditionEventType
} from './types/socket-events';
