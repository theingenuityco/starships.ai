/**
 * Memory Service
 *
 * Provides business logic APIs for memory management and agent memory operations.
 * Orchestrates between database persistence (MemoryRepository) and business logic.
 */

import getStore from '@/store';
import { NotFoundError } from '@starships/errors';
import { MemoryRepository } from '@starships/models';
import type {
  CreateAgentMemoryRequest,
  CreateMemoryRequest,
  MemoryFilters,
  MemoryModel,
  SearchMemoriesRequest,
  SearchMemoriesResponse,
  UpdateMemoryRequest,
} from '@starships/protocol';

export interface MemoryServiceOptions {
  includeStats?: boolean;
  includeMessages?: boolean;
  loadFullContent?: boolean;
}

export interface MemoryContext {
  starshipId: string;
  agentId?: string;
  userId?: string;
  sessionId?: string;
}

/**
 * Service class for managing memories and agent memories
 */
export class MemoryService {
  private memoryRepository: MemoryRepository;

  constructor() {
    this.memoryRepository = new MemoryRepository();
  }

  // ============================================================================
  // MEMORY MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new memory
   */
  async createMemory(request: CreateMemoryRequest, options: MemoryServiceOptions = {}): Promise<MemoryModel> {
    console.log('🧠 [MEMORY-SERVICE] Creating memory:', {
      hasInitialMessages: !!(request.initialMessages && request.initialMessages.length > 0),
      timestamp: new Date().toISOString(),
    });

    // Process initial messages if provided and convert to Message format
    const messages = (request.initialMessages || []).map((msg, index) => ({
      id: `msg_${Date.now()}_${index}`,
      timestamp: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata,
    }));

    const memory = await this.memoryRepository.create({
      state: {
        ...request.state,
        messages,
      },
      version: '1.0.0',
      starshipId: request.starshipId,
    });

    console.log('✅ [MEMORY-SERVICE] Memory created:', memory.id);
    return memory;
  }

  /**
   * Create a new agent memory
   */
  async createAgentMemory(request: CreateAgentMemoryRequest, options: MemoryServiceOptions = {}): Promise<MemoryModel> {
    console.log('🤖 [MEMORY-SERVICE] Creating agent memory:', {
      hasIdentity: !!request.identity,
      hasPurpose: !!request.purpose,
      hasSpace: !!request.space,
      hasInitialMessages: !!(request.initialMessages && request.initialMessages.length > 0),
      timestamp: new Date().toISOString(),
    });

    // Process initial messages if provided and convert to Message format
    const messages = (request.initialMessages || []).map((msg, index) => ({
      id: `msg_${Date.now()}_${index}`,
      timestamp: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata,
    }));

    const agentMemory = await this.memoryRepository.create({
      state: {
        ...request.state,
        messages,
        identity: request.identity,
        purpose: request.purpose,
        space: request.space,
      },
      version: '1.0.0',
      starshipId: request.starshipId,
    });

    console.log('✅ [MEMORY-SERVICE] Agent memory created:', agentMemory.id);
    return agentMemory;
  }

  /**
   * Get memory by ID
   */
  async getMemory(memoryId: string, options: MemoryServiceOptions = {}): Promise<MemoryModel | null> {
    const memory = await this.memoryRepository.findById(memoryId);

    if (!memory) {
      return null;
    }

    // Include additional stats if requested
    if (options.includeStats) {
      console.log(`📊 [MEMORY-SERVICE] Retrieved memory ${memoryId} with stats`);
    }

    return memory;
  }

  /**
   * Update memory
   */
  async updateMemory(memoryId: string, updates: UpdateMemoryRequest, options: MemoryServiceOptions = {}): Promise<MemoryModel | null> {
    console.log('✏️ [MEMORY-SERVICE] Updating memory:', {
      memoryId,
      updates: Object.keys(updates),
      timestamp: new Date().toISOString(),
    });

    const updatedMemory = await this.memoryRepository.update(memoryId, updates as Partial<MemoryModel>);

    if (updatedMemory) {
      console.log('✅ [MEMORY-SERVICE] Memory updated:', memoryId);
    }

    return updatedMemory;
  }

  /**
   * Delete memory
   */
  async deleteMemory(memoryId: string): Promise<boolean> {
    console.log('🗑️ [MEMORY-SERVICE] Deleting memory:', memoryId);

    const deleted = await this.memoryRepository.delete(memoryId);

    if (deleted) {
      console.log('✅ [MEMORY-SERVICE] Memory deleted:', memoryId);
    }

    return deleted;
  }

  // ============================================================================
  // AGENT MEMORY MANAGEMENT APIs
  // ============================================================================

  /**
   * Initialize agent memory for a new agent
   */
  async initializeAgentMemory(
    context: MemoryContext,
    config: {
      name?: string;
      description?: string;
      identity?: any;
      purpose?: any;
      space?: any;
      tags?: string[];
    }
  ): Promise<MemoryModel> {
    console.log('🚀 [MEMORY-SERVICE] Initializing agent memory:', {
      timestamp: new Date().toISOString(),
    });

    return await this.createAgentMemory({
      starshipId: context.starshipId,
      state: {
        identity: config.identity,
        purpose: config.purpose,
        space: config.space,
      },
    });
  }

  /**
   * Add message to memory
   */
  async addMessageToMemory(
    memoryId: string,
    message: {
      role: 'system' | 'user' | 'assistant';
      content: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<MemoryModel | null> {
    console.log('💭 [MEMORY-SERVICE] Adding message to memory:', {
      memoryId,
      role: message.role,
      contentLength: message.content.length,
      timestamp: new Date().toISOString(),
    });

    // Get current memory
    const memory = await this.memoryRepository.findById(memoryId);
    if (!memory) {
      throw new NotFoundError('Memory', memoryId);
    }

    // Add message to existing messages
    const currentMessages = (memory.state as any).messages || [];
    const updatedMessages = [
      ...currentMessages,
      {
        id: `msg_${Date.now()}_${currentMessages.length}`,
        timestamp: new Date().toISOString(),
        ...message,
      },
    ];

    // Update memory with new message
    return await this.memoryRepository.update(memoryId, {
      state: {
        ...memory.state,
        messages: updatedMessages,
      },
      messageCount: updatedMessages.length,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Clear memory messages
   */
  async clearMemoryMessages(memoryId: string): Promise<MemoryModel | null> {
    console.log('🧹 [MEMORY-SERVICE] Clearing memory messages:', {
      memoryId,
      timestamp: new Date().toISOString(),
    });

    // Get current memory
    const memory = await this.memoryRepository.findById(memoryId);
    if (!memory) {
      throw new NotFoundError('Memory', memoryId);
    }

    return await this.memoryRepository.update(memoryId, {
      state: {
        ...memory.state,
        messages: [],
      },
      messageCount: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Clear agent session memory (in-memory store)
   * Business logic for clearing session-based memory for agent-user pairs
   */
  async clearAgentSessionMemory(agentId: string, userId: string): Promise<void> {
    console.log('🧹 [MEMORY-SERVICE] Clearing agent session memory:', {
      agentId,
      userId: userId.substring(0, 8) + '...',
      timestamp: new Date().toISOString(),
    });

    // Use the store to clear session memory
    const store = getStore();
    const key = store.makeKey(agentId, userId);
    await store.clear(key);

    console.log('✅ [MEMORY-SERVICE] Agent session memory cleared successfully');
  }

  /**
   * Clear conversation session memory (in-memory store)
   * Business logic for clearing session-based memory for conversations
   */
  async clearConversationSessionMemory(conversationId: string): Promise<void> {
    console.log('🧹 [MEMORY-SERVICE] Clearing conversation session memory:', {
      conversationId,
      timestamp: new Date().toISOString(),
    });

    // Use the store to clear conversation memory
    const store = getStore();
    await store.clear(conversationId);

    console.log('✅ [MEMORY-SERVICE] Conversation session memory cleared successfully');
  }

  // ============================================================================
  // SEARCH AND FILTER APIs
  // ============================================================================

  /**
   * Search memories with advanced filters
   */
  async searchMemories(request: SearchMemoriesRequest): Promise<SearchMemoriesResponse> {
    console.log('🔍 [MEMORY-SERVICE] Searching memories:', {
      query: request.query.substring(0, 50) + (request.query.length > 50 ? '...' : ''),
      timestamp: new Date().toISOString(),
    });

    const memories = await this.memoryRepository.searchMemories(request.query, {});

    return {
      memories,
      total: memories.length,
      searchQuery: request.query,
    };
  }

  /**
   * Get memories by filters
   */
  async getMemoriesByFilters(filters: MemoryFilters, limit?: number, offset?: number): Promise<MemoryModel[]> {
    console.log('🎯 [MEMORY-SERVICE] Getting memories by filters:', {
      filters,
      limit,
      offset,
      timestamp: new Date().toISOString(),
    });

    return await this.memoryRepository.findWithFilters({
      hasMessages: filters.hasMessages,
      limit,
      offset,
    });
  }

  /**
   * Get memories by tags
   */
  async getMemoriesByTags(tags: string[], starshipId?: string): Promise<MemoryModel[]> {
    console.log('🏷️ [MEMORY-SERVICE] Getting memories by tags:', {
      tags,
      starshipId,
      timestamp: new Date().toISOString(),
    });

    const memories = await this.memoryRepository.findByTags(tags);

    return memories;
  }

  // ============================================================================
  // ANALYTICS AND STATS APIs
  // ============================================================================

  /**
   * Get memory statistics
   */
  async getMemoryStats(memoryId: string) {
    console.log('📊 [MEMORY-SERVICE] Getting memory statistics:', {
      memoryId,
      timestamp: new Date().toISOString(),
    });

    return await this.memoryRepository.getMemoryStats(memoryId);
  }

  /**
   * Get memory analytics for multiple memories
   */
  async getMemoryAnalytics(filters?: { starshipId?: string; agentId?: string; tags?: string[] }) {
    console.log('📈 [MEMORY-SERVICE] Getting memory analytics:', {
      filters,
      timestamp: new Date().toISOString(),
    });

    // Get memories based on filters
    const memories = filters ? await this.memoryRepository.findWithFilters(filters) : await this.memoryRepository.findAll();

    if (memories.length === 0) {
      return {
        totalMemories: 0,
        averageMessageCount: 0,
        memoriesByAgent: {},
        memoriesByTag: {},
        totalMessages: 0,
        oldestMemory: null,
        newestMemory: null,
      };
    }

    // Calculate analytics
    let totalMessages = 0;
    let oldestDate = new Date();
    let newestDate = new Date(0);

    for (const memory of memories) {
      totalMessages += memory.messageCount || 0;

      // Track dates
      const createdDate = new Date(memory.createdAt);
      if (createdDate < oldestDate) {
        oldestDate = createdDate;
      }
      if (createdDate > newestDate) {
        newestDate = createdDate;
      }
    }

    return {
      totalMemories: memories.length,
      averageMessageCount: Math.round(totalMessages / memories.length),
      totalMessages,
      oldestMemory: oldestDate.toISOString(),
      newestMemory: newestDate.toISOString(),
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get memories by starship
   */
  async getMemoriesByStarship(starshipId: string, limit?: number, offset?: number): Promise<MemoryModel[]> {
    const memories = await this.memoryRepository.findByStarshipId(starshipId);

    if (limit) {
      return memories.slice(offset || 0, (offset || 0) + limit);
    }

    return memories;
  }

  /**
   * Get memories by agent
   */
  async getMemoriesByAgent(agentId: string, limit?: number, offset?: number): Promise<MemoryModel[]> {
    const memories = await this.memoryRepository.findByAgentId(agentId);

    if (limit) {
      return memories.slice(offset || 0, (offset || 0) + limit);
    }

    return memories;
  }

  /**
   * Get all memories
   */
  async getAllMemories(limit?: number, offset?: number): Promise<MemoryModel[]> {
    const memories = await this.memoryRepository.findAll();

    if (limit) {
      return memories.slice(offset || 0, (offset || 0) + limit);
    }

    return memories;
  }

  /**
   * Clone memory
   */
  async cloneMemory(
    sourceMemoryId: string,
    targetContext: MemoryContext,
    options: {
      name?: string;
      includeMessages?: boolean;
      tags?: string[];
    } = {}
  ): Promise<MemoryModel> {
    console.log('📋 [MEMORY-SERVICE] Cloning memory:', {
      sourceMemoryId,
      targetStarshipId: targetContext.starshipId,
      targetAgentId: targetContext.agentId,
      includeMessages: options.includeMessages,
      timestamp: new Date().toISOString(),
    });

    // Get source memory
    const sourceMemory = await this.memoryRepository.findById(sourceMemoryId);
    if (!sourceMemory) {
      throw new NotFoundError('Memory', sourceMemoryId);
    }

    // Create cloned memory
    const sourceMessages = options.includeMessages ? (sourceMemory.state as any).messages || [] : [];
    const clonedMemory = await this.memoryRepository.create({
      state: {
        ...sourceMemory.state,
        messages: sourceMessages,
      },
      version: '1.0.0',
      starshipId: targetContext.starshipId,
    });

    console.log('✅ [MEMORY-SERVICE] Memory cloned:', {
      sourceId: sourceMemoryId,
      clonedId: clonedMemory.id,
    });

    return clonedMemory;
  }

  /**
   * Merge memories
   */
  async mergeMemories(
    targetMemoryId: string,
    sourceMemoryIds: string[],
    options: {
      name?: string;
      description?: string;
      preserveSourceTags?: boolean;
    } = {}
  ): Promise<MemoryModel> {
    console.log('🔀 [MEMORY-SERVICE] Merging memories:', {
      targetMemoryId,
      sourceMemoryIds,
      sourceCount: sourceMemoryIds.length,
      timestamp: new Date().toISOString(),
    });

    // Get all memories
    const targetMemory = await this.memoryRepository.findById(targetMemoryId);
    if (!targetMemory) {
      throw new NotFoundError('Memory', targetMemoryId);
    }

    const sourceMemories = await Promise.all(sourceMemoryIds.map((id) => this.memoryRepository.findById(id)));

    // Check for missing source memories
    const missingMemories = sourceMemoryIds.filter((id, index) => !sourceMemories[index]);
    if (missingMemories.length > 0) {
      throw new NotFoundError('Memory', missingMemories[0]);
    }

    // Merge messages and metadata
    const targetMessages = (targetMemory.state as any).messages || [];
    const allMessages = [...targetMessages];

    for (const sourceMemory of sourceMemories) {
      if (sourceMemory && (sourceMemory.state as any).messages) {
        allMessages.push(...(sourceMemory.state as any).messages);
      }
    }

    // Update target memory
    const updatedMemory = await this.memoryRepository.update(targetMemoryId, {
      state: {
        ...targetMemory.state,
        messages: allMessages,
      },
      messageCount: allMessages.length,
      updatedAt: new Date().toISOString(),
    });

    // Delete source memories after successful merge
    await Promise.all(sourceMemoryIds.map((id) => this.memoryRepository.delete(id)));

    console.log('✅ [MEMORY-SERVICE] Memories merged successfully:', {
      targetMemoryId,
      totalMessages: allMessages.length,
      deletedSourceCount: sourceMemoryIds.length,
    });

    return updatedMemory!;
  }
}
