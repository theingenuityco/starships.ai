/**
 * Chat message types for client-side messaging
 */

export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: string
  conversationId: string
  agentId: string
  streaming?: boolean
  sending?: boolean
}
