/**
 * Memory Service
 * 
 * Provides business logic APIs for memory management and agent memory operations.
 * Orchestrates between database persistence (MemoryRepository) and business logic.
 */

import { MemoryRepository, RepositoryFactory } from '@starships/models';
import type {
  MemoryStateModel,
  AgentMemoryStateModel,
  CreateMemoryRequest,
  CreateAgentMemoryRequest,
  UpdateMemoryRequest,
  UpdateAgentMemoryRequest,
  MemoryListResponse,
  MemoryResponse,
  AgentMemoryResponse,
  SearchMemoriesRequest,
  SearchMemoriesResponse,
  MemoryFilters
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

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
  // STATIC APIs FOR BACKWARD COMPATIBILITY
  // ============================================================================

  /**
   * Create memory - Static method
   */
  static async createMemory(request: CreateMemoryRequest): Promise<MemoryStateModel> {
    const repository = RepositoryFactory.getMemoryRepository();
    
    // Process initial messages if provided and convert to Message format
    const messages = (request.initialMessages || []).map(msg => ({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata
    }));
    
    return await repository.create({
      ...request,
      messages,
      messageCount: messages.length,
      version: '1.0.0'
    });
  }

  /**
   * Create agent memory - Static method
   */
  static async createAgentMemory(request: CreateAgentMemoryRequest): Promise<AgentMemoryStateModel> {
    const repository = RepositoryFactory.getMemoryRepository();
    
    // Process initial messages if provided and convert to Message format
    const messages = (request.initialMessages || []).map(msg => ({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata
    }));
    
    return await repository.createAgentMemory({
      ...request,
      messages,
      messageCount: messages.length,
      version: '1.0.0'
    });
  }

  /**
   * Get memory by ID - Static method
   */
  static async getMemory(memoryId: string): Promise<MemoryStateModel | null> {
    const repository = RepositoryFactory.getMemoryRepository();
    return await repository.findById(memoryId);
  }

  /**
   * Update memory - Static method
   */
  static async updateMemory(memoryId: string, updates: UpdateMemoryRequest): Promise<MemoryStateModel | null> {
    const repository = RepositoryFactory.getMemoryRepository();
    return await repository.update(memoryId, updates as Partial<MemoryStateModel>);
  }

  /**
   * Delete memory - Static method
   */
  static async deleteMemory(memoryId: string): Promise<boolean> {
    const repository = RepositoryFactory.getMemoryRepository();
    return await repository.delete(memoryId);
  }

  /**
   * Get memories by starship - Static method
   */
  static async getMemoriesByStarship(starshipId: string): Promise<MemoryStateModel[]> {
    const repository = RepositoryFactory.getMemoryRepository();
    return await repository.findByStarshipId(starshipId);
  }

  /**
   * Get memories by agent - Static method
   */
  static async getMemoriesByAgent(agentId: string): Promise<MemoryStateModel[]> {
    const repository = RepositoryFactory.getMemoryRepository();
    return await repository.findByAgentId(agentId);
  }

  /**
   * Search memories - Static method
   */
  static async searchMemories(request: SearchMemoriesRequest): Promise<SearchMemoriesResponse> {
    const repository = RepositoryFactory.getMemoryRepository();
    const memories = await repository.searchMemories(request.query, {
      starshipId: request.starshipId,
      agentId: request.agentId,
      tags: request.tags
    });

    return {
      memories,
      total: memories.length,
      searchQuery: request.query
    };
  }

  // ============================================================================
  // MEMORY MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new memory
   */
  async createMemory(request: CreateMemoryRequest, options: MemoryServiceOptions = {}): Promise<MemoryStateModel> {
    console.log('🧠 [MEMORY-SERVICE] Creating memory:', {
      name: request.name,
      starshipId: request.starshipId,
      agentId: request.agentId,
      tags: request.tags,
      hasInitialMessages: !!(request.initialMessages && request.initialMessages.length > 0),
      timestamp: new Date().toISOString()
    });

    // Process initial messages if provided and convert to Message format
    const messages = (request.initialMessages || []).map(msg => ({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata
    }));
    
    const memory = await this.memoryRepository.create({
      ...request,
      messages,
      messageCount: messages.length,
      version: '1.0.0'
    });

    console.log('✅ [MEMORY-SERVICE] Memory created:', memory.id);
    return memory;
  }

  /**
   * Create a new agent memory
   */
  async createAgentMemory(request: CreateAgentMemoryRequest, options: MemoryServiceOptions = {}): Promise<AgentMemoryStateModel> {
    console.log('🤖 [MEMORY-SERVICE] Creating agent memory:', {
      name: request.name,
      starshipId: request.starshipId,
      agentId: request.agentId,
      tags: request.tags,
      hasIdentity: !!request.identity,
      hasPurpose: !!request.purpose,
      hasSpace: !!request.space,
      hasInitialMessages: !!(request.initialMessages && request.initialMessages.length > 0),
      timestamp: new Date().toISOString()
    });

    // Process initial messages if provided and convert to Message format
    const messages = (request.initialMessages || []).map(msg => ({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata
    }));
    
    const agentMemory = await this.memoryRepository.createAgentMemory({
      ...request,
      messages,
      messageCount: messages.length,
      version: '1.0.0'
    });

    console.log('✅ [MEMORY-SERVICE] Agent memory created:', agentMemory.id);
    return agentMemory;
  }

  /**
   * Get memory by ID
   */
  async getMemory(memoryId: string, options: MemoryServiceOptions = {}): Promise<MemoryStateModel | null> {
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
  async updateMemory(memoryId: string, updates: UpdateMemoryRequest, options: MemoryServiceOptions = {}): Promise<MemoryStateModel | null> {
    console.log('✏️ [MEMORY-SERVICE] Updating memory:', {
      memoryId,
      updates: Object.keys(updates),
      timestamp: new Date().toISOString()
    });

    const updatedMemory = await this.memoryRepository.update(memoryId, updates as Partial<MemoryStateModel>);
    
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
  async initializeAgentMemory(context: MemoryContext, config: {
    name?: string;
    description?: string;
    identity?: any;
    purpose?: any;
    space?: any;
    tags?: string[];
  }): Promise<AgentMemoryStateModel> {
    if (!context.agentId) {
      throw new Error('agentId is required for agent memory initialization');
    }

    console.log('🚀 [MEMORY-SERVICE] Initializing agent memory:', {
      agentId: context.agentId,
      starshipId: context.starshipId,
      name: config.name,
      timestamp: new Date().toISOString()
    });

    return await this.createAgentMemory({
      starshipId: context.starshipId,
      agentId: context.agentId,
      name: config.name || `Memory for Agent ${context.agentId}`,
      description: config.description,
      identity: config.identity,
      purpose: config.purpose,
      space: config.space,
      tags: config.tags
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
  ): Promise<MemoryStateModel | null> {
    console.log('💭 [MEMORY-SERVICE] Adding message to memory:', {
      memoryId,
      role: message.role,
      contentLength: message.content.length,
      timestamp: new Date().toISOString()
    });

    // Get current memory
    const memory = await this.memoryRepository.findById(memoryId);
    if (!memory) {
      throw new Error(`Memory ${memoryId} not found`);
    }

    // Add message to existing messages
    const updatedMessages = [...(memory.messages || []), {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...message
    }];

    // Update memory with new message
    return await this.memoryRepository.update(memoryId, {
      messages: updatedMessages,
      messageCount: updatedMessages.length,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Clear memory messages
   */
  async clearMemoryMessages(memoryId: string): Promise<MemoryStateModel | null> {
    console.log('🧹 [MEMORY-SERVICE] Clearing memory messages:', {
      memoryId,
      timestamp: new Date().toISOString()
    });

    return await this.memoryRepository.update(memoryId, {
      messages: [],
      messageCount: 0,
      updatedAt: new Date().toISOString()
    });
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
      filters: {
        starshipId: request.starshipId,
        agentId: request.agentId,
        tags: request.tags
      },
      timestamp: new Date().toISOString()
    });

    const memories = await this.memoryRepository.searchMemories(request.query, {
      starshipId: request.starshipId,
      agentId: request.agentId,
      tags: request.tags
    });

    return {
      memories,
      total: memories.length,
      searchQuery: request.query
    };
  }

  /**
   * Get memories by filters
   */
  async getMemoriesByFilters(filters: MemoryFilters, limit?: number, offset?: number): Promise<MemoryStateModel[]> {
    console.log('🎯 [MEMORY-SERVICE] Getting memories by filters:', {
      filters,
      limit,
      offset,
      timestamp: new Date().toISOString()
    });

    return await this.memoryRepository.findWithFilters({
      starshipId: filters.starshipId,
      agentId: filters.agentId,
      tags: filters.tags,
      hasMessages: filters.hasMessages,
      limit,
      offset
    });
  }

  /**
   * Get memories by tags
   */
  async getMemoriesByTags(tags: string[], starshipId?: string): Promise<MemoryStateModel[]> {
    console.log('🏷️ [MEMORY-SERVICE] Getting memories by tags:', {
      tags,
      starshipId,
      timestamp: new Date().toISOString()
    });

    let memories = await this.memoryRepository.findByTags(tags);

    // Filter by starship if provided
    if (starshipId) {
      memories = memories.filter((memory: MemoryStateModel) => memory.starshipId === starshipId);
    }

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
      timestamp: new Date().toISOString()
    });

    return await this.memoryRepository.getMemoryStats(memoryId);
  }

  /**
   * Get memory analytics for multiple memories
   */
  async getMemoryAnalytics(filters?: {
    starshipId?: string;
    agentId?: string;
    tags?: string[];
  }) {
    console.log('📈 [MEMORY-SERVICE] Getting memory analytics:', {
      filters,
      timestamp: new Date().toISOString()
    });

    // Get memories based on filters
    const memories = filters 
      ? await this.memoryRepository.findWithFilters(filters)
      : await this.memoryRepository.findAll();

    if (memories.length === 0) {
      return {
        totalMemories: 0,
        averageMessageCount: 0,
        memoriesByAgent: {},
        memoriesByTag: {},
        totalMessages: 0,
        oldestMemory: null,
        newestMemory: null
      };
    }

    // Calculate analytics
    let totalMessages = 0;
    const memoriesByAgent: Record<string, number> = {};
    const memoriesByTag: Record<string, number> = {};
    let oldestDate = new Date();
    let newestDate = new Date(0);

    for (const memory of memories) {
      totalMessages += memory.messageCount || 0;

      // Count by agent
      if (memory.agentId) {
        memoriesByAgent[memory.agentId] = (memoriesByAgent[memory.agentId] || 0) + 1;
      }

      // Count by tags
      if (memory.tags) {
        for (const tag of memory.tags) {
          memoriesByTag[tag] = (memoriesByTag[tag] || 0) + 1;
        }
      }

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
      memoriesByAgent,
      memoriesByTag,
      totalMessages,
      oldestMemory: oldestDate.toISOString(),
      newestMemory: newestDate.toISOString()
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get memories by starship
   */
  async getMemoriesByStarship(starshipId: string, limit?: number, offset?: number): Promise<MemoryStateModel[]> {
    const memories = await this.memoryRepository.findByStarshipId(starshipId);
    
    if (limit) {
      return memories.slice(offset || 0, (offset || 0) + limit);
    }
    
    return memories;
  }

  /**
   * Get memories by agent
   */
  async getMemoriesByAgent(agentId: string, limit?: number, offset?: number): Promise<MemoryStateModel[]> {
    const memories = await this.memoryRepository.findByAgentId(agentId);
    
    if (limit) {
      return memories.slice(offset || 0, (offset || 0) + limit);
    }
    
    return memories;
  }

  /**
   * Get all memories
   */
  async getAllMemories(limit?: number, offset?: number): Promise<MemoryStateModel[]> {
    const memories = await this.memoryRepository.findAll();
    
    if (limit) {
      return memories.slice(offset || 0, (offset || 0) + limit);
    }
    
    return memories;
  }

  /**
   * Clone memory
   */
  async cloneMemory(sourceMemoryId: string, targetContext: MemoryContext, options: {
    name?: string;
    includeMessages?: boolean;
    tags?: string[];
  } = {}): Promise<MemoryStateModel> {
    console.log('📋 [MEMORY-SERVICE] Cloning memory:', {
      sourceMemoryId,
      targetStarshipId: targetContext.starshipId,
      targetAgentId: targetContext.agentId,
      includeMessages: options.includeMessages,
      timestamp: new Date().toISOString()
    });

    // Get source memory
    const sourceMemory = await this.memoryRepository.findById(sourceMemoryId);
    if (!sourceMemory) {
      throw new Error(`Source memory ${sourceMemoryId} not found`);
    }

    // Create cloned memory
    const clonedMemory = await this.memoryRepository.create({
      starshipId: targetContext.starshipId,
      agentId: targetContext.agentId,
      name: options.name || `Clone of ${sourceMemory.name || sourceMemory.id}`,
      description: sourceMemory.description,
      tags: options.tags || sourceMemory.tags,
      messages: options.includeMessages ? sourceMemory.messages : [],
      messageCount: options.includeMessages ? (sourceMemory.messageCount || 0) : 0,
      version: '1.0.0'
    });

    console.log('✅ [MEMORY-SERVICE] Memory cloned:', {
      sourceId: sourceMemoryId,
      clonedId: clonedMemory.id
    });

    return clonedMemory;
  }

  /**
   * Merge memories
   */
  async mergeMemories(targetMemoryId: string, sourceMemoryIds: string[], options: {
    name?: string;
    description?: string;
    preserveSourceTags?: boolean;
  } = {}): Promise<MemoryStateModel> {
    console.log('🔀 [MEMORY-SERVICE] Merging memories:', {
      targetMemoryId,
      sourceMemoryIds,
      sourceCount: sourceMemoryIds.length,
      timestamp: new Date().toISOString()
    });

    // Get all memories
    const targetMemory = await this.memoryRepository.findById(targetMemoryId);
    if (!targetMemory) {
      throw new Error(`Target memory ${targetMemoryId} not found`);
    }

    const sourceMemories = await Promise.all(
      sourceMemoryIds.map(id => this.memoryRepository.findById(id))
    );

    // Check for missing source memories
    const missingMemories = sourceMemoryIds.filter((id, index) => !sourceMemories[index]);
    if (missingMemories.length > 0) {
      throw new Error(`Source memories not found: ${missingMemories.join(', ')}`);
    }

    // Merge messages and metadata
    const allMessages = [...(targetMemory.messages || [])];
    const allTags = new Set(targetMemory.tags || []);

    for (const sourceMemory of sourceMemories) {
      if (sourceMemory && sourceMemory.messages) {
        allMessages.push(...sourceMemory.messages);
      }
      if (options.preserveSourceTags && sourceMemory?.tags) {
        sourceMemory.tags.forEach((tag: string) => allTags.add(tag));
      }
    }

    // Update target memory
    const updatedMemory = await this.memoryRepository.update(targetMemoryId, {
      name: options.name || targetMemory.name,
      description: options.description || targetMemory.description,
      tags: Array.from(allTags),
      messages: allMessages,
      messageCount: allMessages.length,
      updatedAt: new Date().toISOString()
    });

    // Delete source memories after successful merge
    await Promise.all(
      sourceMemoryIds.map(id => this.memoryRepository.delete(id))
    );

    console.log('✅ [MEMORY-SERVICE] Memories merged successfully:', {
      targetMemoryId,
      totalMessages: allMessages.length,
      deletedSourceCount: sourceMemoryIds.length
    });

    return updatedMemory!;
  }
}