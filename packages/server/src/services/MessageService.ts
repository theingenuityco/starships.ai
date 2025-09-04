/**
 * Message Service
 *
 * Provides business logic APIs for message management and conversation operations.
 * Orchestrates between database persistence (MessageRepository) and business logic.
 */

import { MessageRepository } from '@starships/models';
import type {
  MessageModel,
  CreateMessageRequest,
  UpdateMessageRequest,
  MessageListResponse,
  SearchMessagesRequest,
  SearchMessagesResponse,
  MessageFilters,
  GetMessageThreadRequest,
  MessageThreadResponse,
  GetConversationRequest,
  ConversationResponse,
  BulkMessageRequest,
  BulkMessageResponse,
} from '@starships/protocol';

export interface MessageServiceOptions {
  includeStats?: boolean;
  includeThread?: boolean;
  maxDepth?: number;
}

export interface ConversationContext {
  starshipId: string;
  agentId?: string;
  userId?: string;
  sessionId?: string;
}

/**
 * Service class for managing messages and conversations
 */
export class MessageService {
  private messageRepository: MessageRepository;

  constructor() {
    this.messageRepository = new MessageRepository();
  }

  // ============================================================================
  // MESSAGE MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new message
   */
  async createMessage(
    request: CreateMessageRequest,
    options: MessageServiceOptions = {}
  ): Promise<MessageModel> {
    console.log('📝 [MESSAGE-SERVICE] Creating message:', {
      role: request.role,
      starshipId: request.starshipId,
      agentId: request.agentId,
      conversationId: request.conversationId,
      contentLength: request.content.length,
      timestamp: new Date().toISOString(),
    });

    const message = await this.messageRepository.create({
      ...request,
      timestamp: (request.metadata?.timestamp as string) || new Date().toISOString(),
      version: '1.0.0',
      // Provide defaults for required fields
      threadDepth: request.threadDepth ?? 0,
      processingStatus: request.processingStatus || 'pending',
      messageType: request.messageType || 'user_input',
      importance: request.importance || 'medium',
      hasAttachments: request.hasAttachments || false,
    });

    console.log('✅ [MESSAGE-SERVICE] Message created:', message.id);
    return message;
  }

  /**
   * Get message by ID
   */
  async getMessage(
    messageId: string,
    options: MessageServiceOptions = {}
  ): Promise<MessageModel | null> {
    const message = await this.messageRepository.findById(messageId);

    if (!message) {
      return null;
    }

    // Include thread information if requested
    if (options.includeThread && (message.parentMessageId || message.conversationId)) {
      // This would extend the message with thread info - keeping simple for now
      console.log(`📖 [MESSAGE-SERVICE] Retrieved message ${messageId} with thread context`);
    }

    return message;
  }

  /**
   * Update message
   */
  async updateMessage(
    messageId: string,
    updates: UpdateMessageRequest,
    options: MessageServiceOptions = {}
  ): Promise<MessageModel | null> {
    console.log('✏️ [MESSAGE-SERVICE] Updating message:', {
      messageId,
      updates: Object.keys(updates),
      timestamp: new Date().toISOString(),
    });

    const updatedMessage = await this.messageRepository.update(
      messageId,
      updates as Partial<MessageModel>
    );

    if (updatedMessage) {
      console.log('✅ [MESSAGE-SERVICE] Message updated:', messageId);
    }

    return updatedMessage;
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    console.log('🗑️ [MESSAGE-SERVICE] Deleting message:', messageId);

    const deleted = await this.messageRepository.delete(messageId);

    if (deleted) {
      console.log('✅ [MESSAGE-SERVICE] Message deleted:', messageId);
    }

    return deleted;
  }

  // ============================================================================
  // CONVERSATION MANAGEMENT APIs
  // ============================================================================

  /**
   * Start a new conversation
   */
  async startConversation(
    context: ConversationContext,
    systemMessage?: string
  ): Promise<{
    conversationId: string;
    systemMessage?: MessageModel;
  }> {
    // Generate conversation ID using timestamp + random suffix for uniqueness
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('💬 [MESSAGE-SERVICE] Starting conversation:', {
      conversationId,
      starshipId: context.starshipId,
      agentId: context.agentId,
      userId: context.userId,
      timestamp: new Date().toISOString(),
    });

    let systemMessageModel: MessageModel | undefined;

    // Create system message if provided
    if (systemMessage) {
      systemMessageModel = await this.createMessage({
        role: 'system',
        content: systemMessage,
        starshipId: context.starshipId,
        agentId: context.agentId,
        conversationId,
        messageType: 'system_message',
        importance: 'medium',
      });
    }

    return {
      conversationId,
      systemMessage: systemMessageModel,
    };
  }

  /**
   * Get conversation messages
   */
  async getConversation(request: GetConversationRequest): Promise<ConversationResponse> {
    console.log('📖 [MESSAGE-SERVICE] Getting conversation:', {
      conversationId: request.conversationId,
      limit: request.limit,
      offset: request.offset,
      timestamp: new Date().toISOString(),
    });

    const messages = await this.messageRepository.getConversationMessages(
      request.conversationId,
      request.orderBy,
      request.orderDirection
    );

    // Apply pagination if specified
    const paginatedMessages = request.limit
      ? messages.slice(request.offset || 0, (request.offset || 0) + request.limit)
      : messages;

    // Extract participants (unique agent IDs)
    const participants = [
      ...new Set(
        messages.filter((m: MessageModel) => m.agentId).map((m: MessageModel) => m.agentId!)
      ),
    ];

    // Get conversation metadata
    const startedAt = messages.length > 0 ? messages[0].timestamp : new Date().toISOString();
    const lastActivityAt =
      messages.length > 0 ? messages[messages.length - 1].timestamp : new Date().toISOString();

    return {
      conversationId: request.conversationId,
      messages: paginatedMessages,
      total: messages.length,
      participants: participants as string[],
      startedAt,
      lastActivityAt,
    };
  }

  /**
   * Add message to existing conversation
   */
  async addToConversation(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    context: ConversationContext,
    metadata?: Record<string, unknown>
  ): Promise<MessageModel> {
    return await this.createMessage({
      role,
      content,
      starshipId: context.starshipId,
      agentId: context.agentId,
      conversationId,
      messageType:
        role === 'system' ? 'system_message' : role === 'user' ? 'user_input' : 'agent_response',
      metadata,
    });
  }

  /**
   * Get message thread (parent-child relationships)
   */
  async getMessageThread(request: GetMessageThreadRequest): Promise<MessageThreadResponse> {
    console.log('🧵 [MESSAGE-SERVICE] Getting message thread:', {
      messageId: request.messageId,
      includeParents: request.includeParents,
      includeChildren: request.includeChildren,
      maxDepth: request.maxDepth,
      timestamp: new Date().toISOString(),
    });

    const thread = await this.messageRepository.getMessageThread(
      request.messageId,
      request.includeParents,
      request.includeChildren,
      request.maxDepth
    );

    if (thread.length === 0) {
      throw new Error(`Message thread not found for message: ${request.messageId}`);
    }

    // Find the root message (the one that was requested)
    const rootMessage = thread.find((m: MessageModel) => m.id === request.messageId);
    if (!rootMessage) {
      throw new Error(`Root message not found in thread: ${request.messageId}`);
    }

    // Calculate total depth
    const maxThreadDepth = Math.max(...thread.map((m: MessageModel) => m.threadDepth || 0));

    return {
      rootMessage,
      thread,
      totalDepth: maxThreadDepth,
    };
  }

  // ============================================================================
  // SEARCH AND FILTER APIs
  // ============================================================================

  /**
   * Search messages with advanced filters
   */
  async searchMessages(request: SearchMessagesRequest): Promise<SearchMessagesResponse> {
    console.log('🔍 [MESSAGE-SERVICE] Searching messages:', {
      query: request.query.substring(0, 50) + (request.query.length > 50 ? '...' : ''),
      filters: {
        starshipId: request.starshipId,
        agentId: request.agentId,
        role: request.role,
        messageType: request.messageType,
      },
      timestamp: new Date().toISOString(),
    });

    const messages = await this.messageRepository.searchMessages(request.query, {
      starshipId: request.starshipId,
      agentId: request.agentId,
      memoryId: request.memoryId,
      conversationId: request.conversationId,
      role: request.role,
      messageType: request.messageType,
      importance: request.importance,
      dateFrom: request.dateFrom,
      dateTo: request.dateTo,
      limit: request.limit,
      offset: request.offset,
    });

    return {
      messages,
      total: messages.length,
      searchQuery: request.query,
    };
  }

  /**
   * Get messages by filters
   */
  async getMessagesByFilters(
    filters: MessageFilters,
    limit?: number,
    offset?: number
  ): Promise<MessageModel[]> {
    console.log('🎯 [MESSAGE-SERVICE] Getting messages by filters:', {
      filters,
      limit,
      offset,
      timestamp: new Date().toISOString(),
    });

    // Use search with empty query to get filtered results
    const messages = await this.messageRepository.searchMessages('', {
      starshipId: filters.starshipId,
      agentId: filters.agentId,
      memoryId: filters.memoryId,
      conversationId: filters.conversationId,
      role: filters.role,
      messageType: filters.messageType,
      importance: filters.importance,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit,
      offset,
    });

    return messages;
  }

  // ============================================================================
  // BULK OPERATIONS APIs
  // ============================================================================

  /**
   * Perform bulk operations on messages
   */
  async bulkOperation(request: BulkMessageRequest): Promise<BulkMessageResponse> {
    console.log('📦 [MESSAGE-SERVICE] Performing bulk operation:', {
      operation: request.operation,
      messageCount: request.messageIds.length,
      timestamp: new Date().toISOString(),
    });

    try {
      switch (request.operation) {
        case 'delete':
          return await this.messageRepository.bulkDelete(request.messageIds);

        case 'update_status': {
          if (!request.operationData?.processingStatus) {
            throw new Error('processingStatus required for update_status operation');
          }

          const results = await Promise.allSettled(
            request.messageIds.map((id) =>
              this.messageRepository.update(id, {
                processingStatus: request.operationData!.processingStatus as
                  | 'pending'
                  | 'processing'
                  | 'completed'
                  | 'failed',
              })
            )
          );

          const processed = results.filter((r) => r.status === 'fulfilled').length;
          const failed = results.length - processed;
          const errors = results
            .map((r, i) => ({ result: r, messageId: request.messageIds[i] }))
            .filter(({ result }) => result.status === 'rejected')
            .map(({ result, messageId }) => ({
              messageId,
              error: (result as PromiseRejectedResult).reason.message || 'Unknown error',
            }));

          return { processed, failed, errors };
        }

        case 'assign_conversation': {
          if (!request.operationData?.conversationId) {
            throw new Error('conversationId required for assign_conversation operation');
          }

          const assignResults = await Promise.allSettled(
            request.messageIds.map((id) =>
              this.messageRepository.update(id, {
                conversationId: request.operationData!.conversationId as string,
              })
            )
          );

          const assignProcessed = assignResults.filter((r) => r.status === 'fulfilled').length;
          const assignFailed = assignResults.length - assignProcessed;
          const assignErrors = assignResults
            .map((r, i) => ({ result: r, messageId: request.messageIds[i] }))
            .filter(({ result }) => result.status === 'rejected')
            .map(({ result, messageId }) => ({
              messageId,
              error: (result as PromiseRejectedResult).reason.message || 'Unknown error',
            }));

          return { processed: assignProcessed, failed: assignFailed, errors: assignErrors };
        }

        default:
          throw new Error(`Unsupported bulk operation: ${request.operation}`);
      }
    } catch (error) {
      console.error('❌ [MESSAGE-SERVICE] Bulk operation failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // ANALYTICS AND STATS APIs
  // ============================================================================

  /**
   * Get message statistics
   */
  async getMessageStats(filters?: {
    starshipId?: string;
    agentId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    console.log('📊 [MESSAGE-SERVICE] Getting message statistics:', {
      filters,
      timestamp: new Date().toISOString(),
    });

    return await this.messageRepository.getMessageStats(filters);
  }

  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(conversationId: string) {
    console.log('📈 [MESSAGE-SERVICE] Getting conversation analytics:', {
      conversationId,
      timestamp: new Date().toISOString(),
    });

    const messages = await this.messageRepository.findByConversationId(conversationId);

    if (messages.length === 0) {
      return null;
    }

    // Calculate analytics
    const messagesByRole = { system: 0, user: 0, assistant: 0 };
    let totalContentLength = 0;
    let totalTokens = 0;
    let totalProcessingTime = 0;
    const participants = new Set<string>();

    for (const message of messages) {
      if (Object.prototype.hasOwnProperty.call(messagesByRole, message.role)) {
        messagesByRole[message.role as keyof typeof messagesByRole]++;
      }

      totalContentLength += message.contentLength;

      if (message.tokenCount) {
        totalTokens += message.tokenCount;
      }

      if (message.processingTimeMs) {
        totalProcessingTime += message.processingTimeMs;
      }

      if (message.agentId) {
        participants.add(message.agentId);
      }
    }

    return {
      conversationId,
      totalMessages: messages.length,
      messagesByRole,
      averageMessageLength: Math.round(totalContentLength / messages.length),
      totalTokens,
      averageTokensPerMessage: totalTokens > 0 ? Math.round(totalTokens / messages.length) : 0,
      totalProcessingTime,
      averageProcessingTime:
        totalProcessingTime > 0 ? Math.round(totalProcessingTime / messages.length) : 0,
      participantCount: participants.size,
      participants: Array.from(participants),
      startedAt: messages[0].timestamp,
      lastActivityAt: messages[messages.length - 1].timestamp,
      duration:
        new Date(messages[messages.length - 1].timestamp).getTime() -
        new Date(messages[0].timestamp).getTime(),
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get messages by starship
   */
  async getMessagesByStarship(
    starshipId: string,
    limit?: number,
    offset?: number
  ): Promise<MessageModel[]> {
    const messages = await this.messageRepository.findByStarshipId(starshipId);

    if (limit) {
      return messages.slice(offset || 0, (offset || 0) + limit);
    }

    return messages;
  }

  /**
   * Get messages by agent
   */
  async getMessagesByAgent(
    agentId: string,
    limit?: number,
    offset?: number
  ): Promise<MessageModel[]> {
    const messages = await this.messageRepository.findByAgentId(agentId);

    if (limit) {
      return messages.slice(offset || 0, (offset || 0) + limit);
    }

    return messages;
  }

  /**
   * Get messages by memory
   */
  async getMessagesByMemory(memoryId: string): Promise<MessageModel[]> {
    return await this.messageRepository.findByMemoryId(memoryId);
  }

  /**
   * Get messages by role
   */
  async getMessagesByRole(
    role: 'system' | 'user' | 'assistant',
    starshipId?: string
  ): Promise<MessageModel[]> {
    return await this.messageRepository.findByRole(role, starshipId);
  }
}
