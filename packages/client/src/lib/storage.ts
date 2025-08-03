import { Message } from './api'

const STORAGE_PREFIX = 'starships-chat-'

/**
 * Get chat history for a specific session
 */
export function getChatHistory(sessionId: string): Message[] {
  try {
    const key = `${STORAGE_PREFIX}${sessionId}`
    const stored = localStorage.getItem(key)
    if (!stored) return []
    
    const messages = JSON.parse(stored) as Message[]
    return messages.filter(msg => msg.sessionId === sessionId)
  } catch (error) {
    console.error('Failed to load chat history:', error)
    return []
  }
}

/**
 * Save chat history for a specific session
 */
export function saveChatHistory(sessionId: string, messages: Message[]): void {
  try {
    const key = `${STORAGE_PREFIX}${sessionId}`
    const filteredMessages = messages.filter(msg => msg.sessionId === sessionId)
    localStorage.setItem(key, JSON.stringify(filteredMessages))
  } catch (error) {
    console.error('Failed to save chat history:', error)
  }
}

/**
 * Clear chat history for a specific session
 */
export function clearChatHistory(sessionId: string): void {
  try {
    const key = `${STORAGE_PREFIX}${sessionId}`
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Failed to clear chat history:', error)
  }
}

/**
 * Get all stored session IDs
 */
export function getAllStoredSessions(): string[] {
  try {
    const sessions: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX)) {
        sessions.push(key.replace(STORAGE_PREFIX, ''))
      }
    }
    return sessions
  } catch (error) {
    console.error('Failed to get stored sessions:', error)
    return []
  }
}

/**
 * Generate a consistent session ID for agent/user combination
 */
export function generateSessionId(agentId: string, userId: string): string {
  return `agent-${agentId}:user-${userId}`
}

/**
 * Generate a consistent session ID for Sibil/user/starship combination
 */
export function generateSibilSessionId(userId: string, starshipId?: string): string {
  if (starshipId) {
    return `sibil:user-${userId}:starship-${starshipId}`
  }
  // Fallback for non-starship contexts
  return `sibil:user-${userId}`
}