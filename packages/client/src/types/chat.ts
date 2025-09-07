/**
 * Enhanced chat message types leveraging backend capabilities
 */

export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant' | 'system'
  timestamp: string
  conversationId: string
  agentId?: string

  // Enhanced backend properties
  messageType?: 'user_input' | 'agent_response' | 'system_message' | 'workflow_output'
  importance?: 'low' | 'medium' | 'high' | 'critical'
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed'
  processingTimeMs?: number
  tokenCount?: number
  hasAttachments?: boolean
  contentLength?: number

  // Threading support
  parentMessageId?: string
  threadDepth?: number

  // Additional metadata
  metadata?: Record<string, unknown>
  processingMetadata?: Record<string, unknown>
  contentHash?: string

  // UI states
  streaming?: boolean
  sending?: boolean
}

export interface ConversationMetadata {
  id: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  messageCount: number
  totalTokens: number
  lastActivityAt: string
  createdAt: string
  updatedAt?: string
  starshipId?: string
  userId?: string
  metadata?: Record<string, unknown>
}
