import { RepositoryFactory } from "@starships/models";
import type { MemoryModel, MessageModel } from "@starships/protocol";

/**
 * Database-backed memory store using Memory and Message repositories
 * Migrated from old ChatSession/ChatMessage system to new Memory/Message system
 */
export class DatabaseMemoryStore {
  constructor() {
    console.log('🧠 [DATABASE-MEMORY] Database memory store initialized with Memory/Message system');
  }

  makeKey(agentId: string, userId: string): string {
    return `${agentId}:${userId}`;
  }

  async get(sessionKey: string): Promise<Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    importance?: number;
    summary?: string;
  }>> {
    console.log('🧠 [DATABASE-MEMORY] Getting memory for session:', sessionKey);
    
    try {
      const [agentId, userId] = sessionKey.split(':');
      if (!agentId || !userId) {
        console.error('❌ [DATABASE-MEMORY] Invalid session key format:', sessionKey);
        return [];
      }

      // Get or create memory for this agent
      const memory = await this.getOrCreateMemory(agentId, userId);
      if (!memory) {
        console.log('❌ [DATABASE-MEMORY] No memory found for:', sessionKey);
        return [];
      }

      // Get recent messages from memory
      const messageRepo = RepositoryFactory.getMessageRepository();
      const messages = await messageRepo.findByMemoryId(memory.id);

      // Take only the last 20 messages for context
      const recentMessages = messages.slice(-20);

      console.log('💬 [DATABASE-MEMORY] Messages found:', recentMessages.length);

      // Convert to MemoryEntry format
      const entries = recentMessages.map((msg: MessageModel) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp).getTime(),
        importance: msg.importance === 'high' ? 1 : msg.importance === 'critical' ? 2 : 0,
      }));

      console.log('📝 [DATABASE-MEMORY] Returning memory entries:', entries.length);
      return entries;

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error getting memory:', error);
      return [];
    }
  }

  async append(sessionKey: string, entry: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    importance?: number;
    summary?: string;
  }): Promise<void> {
    console.log('📝 [DATABASE-MEMORY] Appending message to session:', sessionKey);

    try {
      const [agentId, userId] = sessionKey.split(':');
      if (!agentId || !userId) {
        console.error('❌ [DATABASE-MEMORY] Invalid session key format:', sessionKey);
        return;
      }

      // Get or create memory for this agent
      const memory = await this.getOrCreateMemory(agentId, userId);
      if (!memory) {
        console.error('❌ [DATABASE-MEMORY] Failed to get/create memory for:', sessionKey);
        return;
      }

      // Create a conversation ID for this session (using memory ID as base)
      const conversationId = `conv_${memory.id}`;

      // Store message
      const messageRepo = RepositoryFactory.getMessageRepository();
      await messageRepo.create({
        version: '1.0.0',
        role: entry.role,
        content: entry.content,
        starshipId: memory.starshipId,
        agentId: memory.agentId,
        memoryId: memory.id,
        conversationId: conversationId,
        messageType: entry.role === 'user' ? 'user_input' : entry.role === 'assistant' ? 'agent_response' : 'system_event',
        importance: entry.importance === 2 ? 'critical' : entry.importance === 1 ? 'high' : 'medium',
        timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
      });

      // Update memory message count
      const messageCount = await messageRepo.findByMemoryId(memory.id);
      await this.updateMemoryMessageCount(memory.id, messageCount.length);

      console.log('✅ [DATABASE-MEMORY] Message stored successfully');

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error appending message:', error);
    }
  }

  async semanticSearch(sessionKey: string, query: string, limit: number = 5): Promise<{
    entries: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp?: number;
      importance?: number;
      summary?: string;
    }>;
    relevanceScores: number[];
  }> {
    console.log('🔍 [DATABASE-MEMORY] Performing semantic search:', query);
    
    try {
      const [agentId, userId] = sessionKey.split(':');
      if (!agentId || !userId) {
        console.error('❌ [DATABASE-MEMORY] Invalid session key format:', sessionKey);
        return { entries: [], relevanceScores: [] };
      }

      // Get memory for this agent
      const memory = await this.getOrCreateMemory(agentId, userId);
      if (!memory) {
        return { entries: [], relevanceScores: [] };
      }

      // Search messages
      const messageRepo = RepositoryFactory.getMessageRepository();
      const messages = await messageRepo.searchMessages(query, {
        memoryId: memory.id,
        limit: limit
      });

      const entries = messages.map((msg: MessageModel) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp).getTime(),
        importance: msg.importance === 'high' ? 1 : msg.importance === 'critical' ? 2 : 0,
      }));

      // Simple relevance scoring (all equal for now)
      const relevanceScores = new Array(entries.length).fill(1);

      return { entries, relevanceScores };

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error in semantic search:', error);
      return { entries: [], relevanceScores: [] };
    }
  }

  async clear(sessionKey: string): Promise<void> {
    console.log('🗑️ [DATABASE-MEMORY] Clearing session:', sessionKey);
    
    try {
      const [agentId, userId] = sessionKey.split(':');
      if (!agentId || !userId) {
        console.error('❌ [DATABASE-MEMORY] Invalid session key format:', sessionKey);
        return;
      }

      // Find memory
      const memory = await this.findExistingMemory(agentId, userId);
      if (!memory) {
        console.log('📂 [DATABASE-MEMORY] No memory found to clear:', sessionKey);
        return;
      }

      // Delete all messages in memory
      const messageRepo = RepositoryFactory.getMessageRepository();
      const messages = await messageRepo.findByMemoryId(memory.id);
      const messageIds = messages.map((msg: MessageModel) => msg.id);
      
      if (messageIds.length > 0) {
        const result = await messageRepo.bulkDelete(messageIds);
        console.log('💾 [DATABASE-MEMORY] Memory cleared:', result.processed, 'messages deleted');
      }

      // Update memory message count to 0
      await this.updateMemoryMessageCount(memory.id, 0);

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Failed to clear session:', error);
    }
  }

  async saveIndex(): Promise<void> {
    // No index to save - this is a no-op for database storage
    console.log('ℹ️ [DATABASE-MEMORY] No index to save for database storage');
  }

  /**
   * Get or create memory for agent/user combination
   */
  private async getOrCreateMemory(agentId: string, userId: string): Promise<MemoryModel | null> {
    try {
      // Get agent to retrieve starship_id for proper memory association
      const agentRepo = RepositoryFactory.getAgentRepository();
      const agent = await agentRepo.findById(agentId);
      
      if (!agent) {
        console.error('❌ [DATABASE-MEMORY] Agent not found:', agentId);
        return null;
      }

      // CRITICAL FIX: Ensure agent has a starshipId before creating memory
      if (!agent.starshipId) {
        console.error('❌ [DATABASE-MEMORY] Agent has no starshipId assigned:', agentId);
        return null;
      }

      // Try to find existing memory
      const existingMemory = await this.findExistingMemory(agentId, userId, agent.starshipId);
      if (existingMemory) {
        return existingMemory;
      }

      console.log('✅ [DATABASE-MEMORY] Creating new memory for agent on starship:', {
        agentId: agentId,
        starshipId: agent.starshipId,
        userId: userId
      });

      // Create new agent memory
      const memoryRepo = RepositoryFactory.getMemoryRepository();
      const newMemory = await memoryRepo.createAgentMemory({
        version: '1.0.0',
        starshipId: agent.starshipId,
        agentId: agentId,
        name: `Agent Memory: ${agent.name || agentId}`,
        description: `Conversation memory for agent ${agent.name || agentId} with user ${userId}`,
        tags: ['agent-conversation', `user:${userId}`, `agent:${agentId}`],
        messages: [],
        messageCount: 0,
      });

      console.log('✅ [DATABASE-MEMORY] Created new memory:', {
        memoryId: newMemory.id,
        agentId: agentId,
        starshipId: agent.starshipId,
        userId: userId
      });
      
      return newMemory;

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error getting/creating memory:', error);
      return null;
    }
  }

  /**
   * Find existing memory for agent/starship combination
   */
  private async findExistingMemory(agentId: string, userId: string, starshipId?: string): Promise<MemoryModel | null> {
    try {
      if (!starshipId) {
        return null;
      }

      const memoryRepo = RepositoryFactory.getMemoryRepository();
      const memories = await memoryRepo.findByAgentId(agentId);

      // Find memory for this agent that matches the user tag
      const userMemory = memories.find((memory: MemoryModel) => {
        return memory.tags?.includes(`user:${userId}`) && 
               memory.starshipId === starshipId;
      });

      return userMemory || null;

    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error finding existing memory:', error);
      return null;
    }
  }

  /**
   * Update memory message count
   */
  private async updateMemoryMessageCount(memoryId: string, count: number): Promise<void> {
    try {
      const memoryRepo = RepositoryFactory.getMemoryRepository();
      await memoryRepo.update(memoryId, {
        messageCount: count,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ [DATABASE-MEMORY] Error updating memory message count:', error);
    }
  }
}