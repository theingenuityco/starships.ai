import { RepositoryFactory } from "@starships/models";
import type { MemoryEntry, MemorySearchResult, SessionKey, ChatSession, ChatMessage } from "@starships/protocol";

/**
 * Database-backed memory store using ChatSession and ChatMessage repositories
 * Replaces file-based LangChainMemoryStore with robust database persistence
 */
export class DatabaseMemoryStore {
  constructor() {
    console.log('🧠 [DATABASE-MEMORY] Database memory store initialized');
  }

  makeKey(agentId: string, userId: string): SessionKey {
    return `${agentId}:${userId}`;
  }

  async get(sessionKey: SessionKey): Promise<MemoryEntry[]> {
    console.log('🧠 [DATABASE-MEMORY] Getting memory for session:', sessionKey);
    
    try {
      const [agentId, userId] = sessionKey.split(':');
      if (!agentId || !userId) {
        console.error('❌ [DATABASE-MEMORY] Invalid session key format:', sessionKey);
        return [];
      }

      // Get or create chat session
      const session = await this.getOrCreateSession(agentId, userId);
      if (!session) {
        console.log('❌ [DATABASE-MEMORY] No session found for:', sessionKey);
        return [];
      }

      // Get conversation history
      const chatMessageRepo = RepositoryFactory.getChatMessageRepository();
      const messages = await chatMessageRepo.getRecentMessages(session.id, 20);

      console.log('💬 [DATABASE-MEMORY] Messages found:', messages.length);

      // Convert to MemoryEntry format
      const entries = messages.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        timestamp: new Date(msg.timestamp).getTime(),
      }));

      console.log('📝 [DATABASE-MEMORY] Returning memory entries:', entries.length);
      return entries;

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error getting memory:', error);
      return [];
    }
  }

  async append(sessionKey: SessionKey, entry: MemoryEntry): Promise<void> {
    console.log('📝 [DATABASE-MEMORY] Appending message to session:', sessionKey);

    try {
      const [agentId, userId] = sessionKey.split(':');
      if (!agentId || !userId) {
        console.error('❌ [DATABASE-MEMORY] Invalid session key format:', sessionKey);
        return;
      }

      // Get or create chat session
      const session = await this.getOrCreateSession(agentId, userId);
      if (!session) {
        console.error('❌ [DATABASE-MEMORY] Failed to get/create session for:', sessionKey);
        return;
      }

      // Store message
      const chatMessageRepo = RepositoryFactory.getChatMessageRepository();
      await chatMessageRepo.create({
        session_id: session.id,
        role: entry.role,
        content: entry.content
      });

      console.log('✅ [DATABASE-MEMORY] Message stored successfully');

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error appending message:', error);
    }
  }

  async semanticSearch(sessionKey: SessionKey, query: string, _limit: number = 5): Promise<MemorySearchResult> {
    // Not implemented for now - return empty results
    console.log('⚠️ [DATABASE-MEMORY] Semantic search not implemented');
    return { entries: [], relevanceScores: [] };
  }

  async clear(sessionKey: SessionKey): Promise<void> {
    console.log('🗑️ [DATABASE-MEMORY] Clearing session:', sessionKey);
    
    try {
      const [agentId, userId] = sessionKey.split(':');
      if (!agentId || !userId) {
        console.error('❌ [DATABASE-MEMORY] Invalid session key format:', sessionKey);
        return;
      }

      // Find session
      const session = await this.findExistingSession(agentId, userId);
      if (!session) {
        console.log('📂 [DATABASE-MEMORY] No session found to clear:', sessionKey);
        return;
      }

      // Delete all messages in session
      const chatMessageRepo = RepositoryFactory.getChatMessageRepository();
      const deletedCount = await chatMessageRepo.deleteBySession(session.id);

      console.log('💾 [DATABASE-MEMORY] Session cleared:', deletedCount, 'messages deleted');

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Failed to clear session:', error);
    }
  }

  async saveIndex(): Promise<void> {
    // No index to save - this is a no-op for database storage
    console.log('ℹ️ [DATABASE-MEMORY] No index to save for database storage');
  }

  /**
   * Get or create chat session for agent/user combination
   */
  private async getOrCreateSession(agentId: string, userId: string): Promise<ChatSession | null> {
    try {
      // Get agent to retrieve starship_id for proper session association
      const agentRepo = RepositoryFactory.getAgentRepository();
      const agent = await agentRepo.findById(agentId);
      
      if (!agent) {
        console.error('❌ [DATABASE-MEMORY] Agent not found:', agentId);
        return null;
      }

      // CRITICAL FIX: Ensure agent has a starshipId before creating session
      if (!agent.starshipId) {
        console.error('❌ [DATABASE-MEMORY] Agent has no starshipId assigned:', agentId);
        return null;
      }

      // Try to find existing active session
      const existingSession = await this.findExistingSession(agentId, userId, agent.starshipId);
      if (existingSession) {
        // Update activity timestamp
        const chatSessionRepo = RepositoryFactory.getChatSessionRepository();
        await chatSessionRepo.updateActivity(existingSession.id);
        return existingSession;
      }

      console.log('✅ [DATABASE-MEMORY] Creating new session for agent on starship:', {
        agentId: agentId,
        starshipId: agent.starshipId,
        userId: userId
      });

      // Create new session
      const chatSessionRepo = RepositoryFactory.getChatSessionRepository();
      const newSession = await chatSessionRepo.create({
        source: 'agent',
        agent_id: agentId,
        starship_id: agent.starshipId  // CRITICAL: Include starship_id for proper relationships
      });

      console.log('✅ [DATABASE-MEMORY] Created new session:', {
        sessionId: newSession.id,
        agentId: agentId,
        starshipId: agent.starshipId,
        userId: userId
      });
      return newSession;

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error getting/creating session:', error);
      return null;
    }
  }

  /**
   * Find existing active session for agent/starship combination (removed user dependency)
   */
  private async findExistingSession(agentId: string, userId: string, starshipId?: string): Promise<ChatSession | null> {
    try {
      if (!starshipId) {
        return null;
      }

      const chatSessionRepo = RepositoryFactory.getChatSessionRepository();
      const sessions = await chatSessionRepo.findByStarship(starshipId, 10);

      // Find session for this agent that's still active (within 30 minutes)
      const activeSession = sessions.find((session: any) => {
        if (session.agent_id !== agentId) return false;
        
        const lastActivity = new Date(session.last_activity_at);
        const now = new Date();
        const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
        
        return diffMinutes < 30; // 30 minute timeout
      });

      return activeSession || null;

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error finding existing session:', error);
      return null;
    }
  }
}