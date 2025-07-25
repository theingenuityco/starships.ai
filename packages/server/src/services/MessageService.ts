/**
 * Message Service - Messaging and Communication Layer
 *
 * Handles all business logic for expedition messaging including message creation,
 * thread management, real-time broadcasting, and integration with First Officer.
 */

import {
  ExpeditionMessage,
  MessageRole,
  MessageType,
  SendMessageRequest,
  ExpeditionError,
  ExpeditionErrorCode
} from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { FirstOfficerService } from './FirstOfficerService';
import { ExpeditionService } from './ExpeditionService';
import { VirtualFirstOfficer } from './VirtualFirstOfficer';
import { ContextBuilder } from './ContextBuilder';
import { chat as agentChat } from '@starships/agent-engine';
import type { ChatRequest } from '@starships/protocol';
import getStore from '../store';
import { env } from '../config/environment';

export interface UpdateMessageRequest {
  content?: string;
  messageType?: MessageType;
  metadata?: Record<string, any>;
}

export interface MessageFilters {
  role?: MessageRole[];
  messageType?: MessageType[];
  agentId?: string;
  userId?: string;
  threadId?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string;
}

export interface MessageThread {
  threadId: string;
  title: string;
  messageCount: number;
  participants: Array<{
    id: string;
    role: MessageRole;
    name: string;
  }>;
  lastMessage: {
    content: string;
    timestamp: string;
    role: MessageRole;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MessageSearchResult {
  messages: ExpeditionMessage[];
  total: number;
  highlights: Record<string, string[]>;
}

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export class MessageService {
  private static instance: MessageService;
  private firstOfficerService: FirstOfficerService;
  private expeditionService: ExpeditionService;

  private constructor() {
    this.firstOfficerService = FirstOfficerService.getInstance();
    this.expeditionService = ExpeditionService.getInstance();
  }


  static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  /**
   * Send a message in an expedition
   *
   * Phase 2.1 - Simplified routing:
   * - Routes based on participantId only (no messageType routing)
   * - Defaults to 'first-officer' if no participant specified
   * - Stores participantId as agentId in database
   */
  async sendMessage(
    userId: string,
    request: SendMessageRequest
  ): Promise<{ userMessage: ExpeditionMessage; participantMessage?: ExpeditionMessage }> {
    
    // Validate expedition access
    await this.validateExpeditionAccess(request.expeditionId, userId);

    // Determine participant - default to 'first-officer' if not provided
    const participantId = request.participantId || 'first-officer';

    // Create user message
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    const userMessage = await messageRepo.create({
      expeditionId: request.expeditionId,
      role: 'user',
      userId,
      content: request.content,
      messageType: 'user-input',
      timestamp: new Date().toISOString(),
      threadId: request.threadId,
      parentMessageId: request.parentMessageId,
      agentId: participantId, // Store participantId as agentId in database
      metadata: request.metadata || {}
    });

    // Route to participant
    let participantMessage: ExpeditionMessage | undefined = undefined;

    // Check if participantId is a valid UUID (specific agent) or 'first-officer'
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(participantId);
    
    if (participantId === 'first-officer' || !isValidUUID) {
      // Route to First Officer
      const response = await this.handleFirstOfficerMessage(
        request.expeditionId,
        request.content,
        'user-input',
        userId
      );

      if (response?.reply) {
        participantMessage = await messageRepo.create({
          expeditionId: request.expeditionId,
          role: 'first-officer',
          agentId: 'first-officer',
          content: response.reply,
          messageType: 'coordination',
          timestamp: new Date().toISOString(),
          threadId: request.threadId,
          parentMessageId: userMessage.id,
          metadata: { usage: response.usage }
        });
      }
    } else {
      // Route to specific agent
      const response = await this.handleAgentMessage(
        request.expeditionId,
        participantId,
        request.content,
        userId
      );

      if (response?.reply) {
        participantMessage = await messageRepo.create({
          expeditionId: request.expeditionId,
          role: 'agent',
          agentId: participantId,
          content: response.reply,
          messageType: 'task-work',
          timestamp: new Date().toISOString(),
          threadId: request.threadId,
          parentMessageId: userMessage.id,
          metadata: { usage: response.usage }
        });
      }
    }

    return { userMessage, participantMessage };
  }

  /**
   * Get message by ID
   */
  async getMessage(messageId: string, userId: string): Promise<ExpeditionMessage> {
    try {
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const message = await messageRepo.findById(messageId);

      if (!message) {
        throw this.createError('VALIDATION_ERROR', `Message not found: ${messageId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(message.expeditionId, userId);

      return message;
    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to get message:', error);
      throw this.handleError(error, 'GET_MESSAGE_FAILED');
    }
  }

  /**
   * Get messages for an expedition
   */
  async getExpeditionMessages(
    expeditionId: string,
    userId: string,
    filters?: MessageFilters,
    limit: number = 50,
    offset: number = 0
  ): Promise<ExpeditionMessage[]> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      let messages = await messageRepo.findByExpedition(expeditionId);

      // Apply filters
      if (filters) {
        messages = this.applyMessageFilters(messages, filters);
      }

      // Apply pagination
      messages = messages
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(offset, offset + limit);

      return messages;
    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to get expedition messages:', error);
      throw this.handleError(error, 'GET_MESSAGES_FAILED');
    }
  }

  /**
   * Update message
   */
  async updateMessage(
    messageId: string,
    userId: string,
    updates: UpdateMessageRequest
  ): Promise<ExpeditionMessage> {
    try {
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const message = await messageRepo.findById(messageId);

      if (!message) {
        throw this.createError('VALIDATION_ERROR', `Message not found: ${messageId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(message.expeditionId, userId);

      // Validate message ownership for user messages
      if (message.role === 'user' && message.userId !== userId) {
        throw this.createError('EXPEDITION_ACCESS_DENIED', 'Cannot edit another user\'s message');
      }

      // Update message
      const updatedMessage = await messageRepo.update(messageId, updates);

      if (!updatedMessage) {
        throw this.createError('UPDATE_FAILED', 'Failed to update message');
      }


      console.log(`[MESSAGE-SERVICE] Message updated: ${messageId}`);
      return updatedMessage;
    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to update message:', error);
      throw this.handleError(error, 'UPDATE_MESSAGE_FAILED');
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    try {
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const message = await messageRepo.findById(messageId);

      if (!message) {
        throw this.createError('VALIDATION_ERROR', `Message not found: ${messageId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(message.expeditionId, userId);

      // Validate message ownership for user messages
      if (message.role === 'user' && message.userId !== userId) {
        throw this.createError('EXPEDITION_ACCESS_DENIED', 'Cannot delete another user\'s message');
      }

      // Delete message
      await messageRepo.delete(messageId);


      console.log(`[MESSAGE-SERVICE] Message deleted: ${messageId}`);
    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to delete message:', error);
      throw this.handleError(error, 'DELETE_MESSAGE_FAILED');
    }
  }

  /**
   * Create a new message thread
   */
  async createThread(
    expeditionId: string,
    userId: string,
    title: string,
    initialMessage?: string
  ): Promise<MessageThread> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const threadId = this.generateThreadId();
      const now = new Date().toISOString();

      // Create initial message if provided
      if (initialMessage) {
        const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
        await messageRepo.create({
          expeditionId,
          role: 'user',
          userId,
          content: initialMessage,
          messageType: 'user-input',
          timestamp: now,
          threadId,
          metadata: { threadTitle: title }
        });
      }

      const thread: MessageThread = {
        threadId,
        title,
        messageCount: initialMessage ? 1 : 0,
        participants: [{
          id: userId,
          role: 'user',
          name: 'User' // Would be fetched from user service in real implementation
        }],
        lastMessage: initialMessage ? {
          content: initialMessage,
          timestamp: now,
          role: 'user'
        } : {
          content: '',
          timestamp: now,
          role: 'system'
        },
        createdAt: now,
        updatedAt: now
      };

      console.log(`[MESSAGE-SERVICE] Thread created: ${threadId}`);
      return thread;
    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to create thread:', error);
      throw this.handleError(error, 'CREATE_THREAD_FAILED');
    }
  }

  /**
   * Get message threads for an expedition
   */
  async getExpeditionThreads(
    expeditionId: string,
    userId: string
  ): Promise<MessageThread[]> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const messages = await messageRepo.findByExpedition(expeditionId);

      // Group messages by thread
      const threadMap = new Map<string, ExpeditionMessage[]>();
      
      messages.forEach(message => {
        if (message.threadId) {
          if (!threadMap.has(message.threadId)) {
            threadMap.set(message.threadId, []);
          }
          threadMap.get(message.threadId)!.push(message);
        }
      });

      // Convert to thread objects
      const threads: MessageThread[] = [];
      
      for (const [threadId, threadMessages] of threadMap.entries()) {
        const sortedMessages = threadMessages.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const lastMessage = sortedMessages[sortedMessages.length - 1];
        const firstMessage = sortedMessages[0];
        
        threads.push({
          threadId,
          title: firstMessage.metadata?.threadTitle || `Thread ${threadId.slice(0, 8)}`,
          messageCount: threadMessages.length,
          participants: this.extractParticipants(threadMessages),
          lastMessage: {
            content: lastMessage.content,
            timestamp: lastMessage.timestamp,
            role: lastMessage.role
          },
          createdAt: firstMessage.timestamp,
          updatedAt: lastMessage.timestamp
        });
      }

      return threads.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to get expedition threads:', error);
      throw this.handleError(error, 'GET_THREADS_FAILED');
    }
  }

  /**
   * Search messages within an expedition
   */
  async searchMessages(
    expeditionId: string,
    userId: string,
    query: string,
    filters?: MessageFilters
  ): Promise<MessageSearchResult> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      let messages = await messageRepo.findByExpedition(expeditionId);

      // Apply filters
      if (filters) {
        messages = this.applyMessageFilters(messages, filters);
      }

      // Perform text search
      const searchResults = messages.filter(message => 
        message.content.toLowerCase().includes(query.toLowerCase())
      );

      // Generate highlights (simple implementation)
      const highlights: Record<string, string[]> = {};
      searchResults.forEach(message => {
        const content = message.content.toLowerCase();
        const queryLower = query.toLowerCase();
        const index = content.indexOf(queryLower);
        
        if (index !== -1) {
          const start = Math.max(0, index - 50);
          const end = Math.min(content.length, index + query.length + 50);
          highlights[message.id] = [content.slice(start, end)];
        }
      });

      return {
        messages: searchResults,
        total: searchResults.length,
        highlights
      };
    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to search messages:', error);
      throw this.handleError(error, 'SEARCH_MESSAGES_FAILED');
    }
  }

  /**
   * Handle file attachment upload
   */
  async uploadAttachment(
    expeditionId: string,
    userId: string,
    file: {
      name: string;
      type: string;
      size: number;
      buffer: Buffer;
    }
  ): Promise<FileAttachment> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      // Validate file
      this.validateFileAttachment(file);

      // Generate file ID and URL (placeholder implementation)
      const fileId = this.generateFileId();
      const fileUrl = `/api/files/${fileId}`;

      const attachment: FileAttachment = {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        url: fileUrl,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString()
      };

      // In a real implementation, you would:
      // 1. Upload file to storage service (S3, etc.)
      // 2. Store file metadata in database
      // 3. Generate secure URL

      console.log(`[MESSAGE-SERVICE] File uploaded: ${fileId}`);
      return attachment;
    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to upload attachment:', error);
      throw this.handleError(error, 'UPLOAD_ATTACHMENT_FAILED');
    }
  }

  /**
   * Start typing indicator
   */
  async startTyping(expeditionId: string, userId: string, threadId?: string): Promise<void> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to start typing:', error);
    }
  }

  /**
   * Stop typing indicator
   */
  async stopTyping(expeditionId: string, userId: string, threadId?: string): Promise<void> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

    } catch (error) {
      console.error('[MESSAGE-SERVICE] Failed to stop typing:', error);
    }
  }

  // Private helper methods

  private async validateExpeditionAccess(expeditionId: string, userId: string): Promise<void> {
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const expedition = await expeditionRepo.findById(expeditionId);

    if (!expedition) {
      throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
    }

    // Validate starship ownership
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(expedition.starshipId);

    if (!starship || starship.ownerId !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to expedition');
    }
  }

  private async validateThreadAccess(threadId: string, expeditionId: string): Promise<void> {
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    const messages = await messageRepo.findByExpedition(expeditionId);
    
    const threadExists = messages.some(message => message.threadId === threadId);
    if (!threadExists) {
      throw this.createError('VALIDATION_ERROR', `Thread not found: ${threadId}`);
    }
  }
/**
 * Check if any active First Officer agents exist
 */
private async checkActiveFirstOfficer(expeditionId: string): Promise<boolean> {
  try {
    const expedition = await RepositoryFactory.getExpeditionRepository().findById(expeditionId);
    if (!expedition) {
      return false;
    }

    // Get available first officer agents
    const agentRepo = RepositoryFactory.getAgentRepository();
    const starshipAgents = await agentRepo.findByStarship(expedition.starshipId);
    
    // Look for a First Officer agent
    const firstOfficerAgent = starshipAgents.find(agent =>
      agent.tags.includes('first-officer') ||
      agent.name.toLowerCase().includes('first officer') ||
      agent.category === 'support'
    );
    
    return !!firstOfficerAgent;
  } catch (error) {
    console.error('[MESSAGE-SERVICE] Error checking active First Officer:', error);
    return false;
  }
}

/**
 * Get response from Virtual First Officer
 */
private async getVirtualFirstOfficerResponse(
  expeditionId: string,
  starshipId: string,
  message: string,
  userId: string
): Promise<string> {
  try {
    // Get or create a Virtual First Officer instance
    const virtualFirstOfficer = await this.firstOfficerService.getOrCreateVirtualFirstOfficer(
      starshipId
    );

    // Build context using ContextBuilder
    const contextBuilder = new ContextBuilder();
    const expeditionContext = await contextBuilder.buildContext(expeditionId, starshipId);

    // Convert to the format expected by VirtualFirstOfficer
    const context = {
      expeditionId: expeditionContext.expeditionDetails.id,
      starshipId: starshipId,
      state: expeditionContext.expeditionDetails.status as any,
      title: expeditionContext.expeditionDetails.title,
      objective: expeditionContext.expeditionDetails.description,
      createdAt: expeditionContext.expeditionDetails.createdAt,
      assignedAgents: expeditionContext.agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status === 'active' ? 'online' as const : 'offline' as const
      })),
      tasks: expeditionContext.taskSummaries.map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedAgent,
        createdAt: task.createdAt,
        completedAt: task.completedAt
      })),
      results: expeditionContext.recentResults.map(result => ({
        id: result.id,
        taskId: result.taskId || '',
        content: JSON.stringify(result.data || {}),
        createdAt: result.createdAt,
        createdBy: result.agentId || 'system'
      })),
      recentMessages: expeditionContext.recentMessages.map(msg => ({
        id: msg.id,
        sender: msg.userId || msg.agentId || 'system',
        content: msg.content,
        timestamp: msg.timestamp,
        type: msg.role === 'user' ? 'user' as const : msg.role === 'agent' ? 'agent' as const : 'system' as const
      })),
      statistics: {
        totalTasks: expeditionContext.statistics.totalTasks,
        completedTasks: expeditionContext.statistics.completedTasks,
        activeTasks: expeditionContext.statistics.inProgressTasks,
        failedTasks: expeditionContext.statistics.failedTasks,
        totalMessages: expeditionContext.statistics.totalMessages,
        averageCompletionTime: expeditionContext.statistics.averageCompletionTime
      }
    };

    // Update the Virtual First Officer's context
    virtualFirstOfficer.updateContext(context);

    // Process the message and get response
    const response = await virtualFirstOfficer.processMessage(message, userId);

    return response;
  } catch (error) {
    console.error('[MESSAGE-SERVICE] Error getting Virtual First Officer response:', error);
    throw error;
  }
}

private async handleAgentMessage(
  expeditionId: string,
  agentId: string,
  content: string,
  userId: string
): Promise<{ reply: string; usage?: any }> {
    try {
      console.log(`[MESSAGE-SERVICE] ===== HANDLING AGENT MESSAGE =====`);
      console.log(`[MESSAGE-SERVICE] Expedition: ${expeditionId}`);
      console.log(`[MESSAGE-SERVICE] Agent ID: ${agentId}`);
      console.log(`[MESSAGE-SERVICE] User ID: ${userId}`);
      console.log(`[MESSAGE-SERVICE] Message Length: ${content?.length}`);
      
      // Use the agent engine's chat function (same as crew chat)
      const chatRequest: ChatRequest = {
        agent_id: agentId,
        user_id: userId,
        message: content,
        channel_id: `expedition-${expeditionId}`,
        stream: false
      };

      console.log(`[MESSAGE-SERVICE] Sending request to agent engine...`);
      const store = getStore();
      const result = await agentChat(chatRequest, store);

      console.log(`[MESSAGE-SERVICE] Agent response generated:`, {
        replyLength: result.reply?.length,
        usage: result.usage
      });
      console.log(`[MESSAGE-SERVICE] Agent reply preview: ${result.reply?.substring(0, 100)}...`);
      console.log(`[MESSAGE-SERVICE] ===== AGENT MESSAGE HANDLED SUCCESSFULLY =====`);

      return {
        reply: result.reply || 'I apologize, I was unable to generate a response.',
        usage: result.usage
      };
    } catch (error) {
      console.error('[MESSAGE-SERVICE] ===== AGENT MESSAGE HANDLING FAILED =====');
      console.error('[MESSAGE-SERVICE] Error details:', error);
      throw error;
    }
  }

  private async handleFirstOfficerMessage(
    expeditionId: string,
    message: string,
    messageType: MessageType,
    userId?: string
  ): Promise<{ reply: string; usage?: any } | null> {
    try {
      console.log(`[MESSAGE-SERVICE] ===== HANDLING FIRST OFFICER MESSAGE =====`);
      console.log(`[MESSAGE-SERVICE] Expedition: ${expeditionId}`);
      console.log(`[MESSAGE-SERVICE] Message Type: ${messageType}`);
      console.log(`[MESSAGE-SERVICE] User ID: ${userId}`);
      console.log(`[MESSAGE-SERVICE] Message Length: ${message?.length}`);
      
      // Get expedition details to check status
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        console.error(`[MESSAGE-SERVICE] Expedition ${expeditionId} not found`);
        throw new Error(`Expedition ${expeditionId} not found`);
      }

      console.log(`[MESSAGE-SERVICE] Expedition found - Status: ${expedition.status}`);

      // Auto-start expedition if it's not started and this is a user message
      if (messageType === 'user-input' && expedition.status === 'draft' && userId) {
        console.log(`[MESSAGE-SERVICE] Auto-starting expedition ${expeditionId} for user message`);
        try {
          await this.expeditionService.startExpedition(expeditionId, userId);
          console.log(`[MESSAGE-SERVICE] Expedition ${expeditionId} auto-started successfully`);
        } catch (startError) {
          console.error(`[MESSAGE-SERVICE] Failed to auto-start expedition ${expeditionId}:`, startError);
          // Continue with message handling even if auto-start fails
        }
      }

      // Handle user messages to First Officer
      if (messageType === 'user-input' && userId) {
        console.log(`[MESSAGE-SERVICE] Handling First Officer message for expedition`);
        
        // Check for active First Officer agents
        const hasActiveFirstOfficer = await this.checkActiveFirstOfficer(expeditionId);

        if (!hasActiveFirstOfficer) {
          // Use Virtual First Officer as fallback
          console.log(`[MESSAGE-SERVICE] Using Virtual First Officer for expedition ${expeditionId}`);
          
          const virtualResponse = await this.getVirtualFirstOfficerResponse(
            expeditionId,
            expedition.starshipId,
            message,
            userId
          );

          console.log(`[MESSAGE-SERVICE] Virtual First Officer response generated`);
          console.log(`[MESSAGE-SERVICE] ===== FIRST OFFICER MESSAGE HANDLED SUCCESSFULLY (Virtual) =====`);

          return {
            reply: virtualResponse,
            usage: undefined
          };
        }

        // Traditional agent handling
        const agentRepo = RepositoryFactory.getAgentRepository();
        const starshipAgents = await agentRepo.findByStarship(expedition.starshipId);
        
        // Look for a First Officer agent
        const firstOfficerAgent = starshipAgents.find(agent =>
          agent.tags.includes('first-officer') ||
          agent.name.toLowerCase().includes('first officer') ||
          agent.category === 'support'
        );
        
        if (!firstOfficerAgent) {
          console.error(`[MESSAGE-SERVICE] No First Officer agent found for starship ${expedition.starshipId}`);
          return {
            reply: 'I apologize, but there is no First Officer assigned to this starship. Please assign a First Officer agent to handle expedition coordination.',
            usage: undefined
          };
        }
        
        console.log(`[MESSAGE-SERVICE] Using First Officer agent: ${firstOfficerAgent.name} (${firstOfficerAgent.id})`);
        
        // Use the agent engine's chat function with the First Officer agent ID
        const chatRequest: ChatRequest = {
          agent_id: firstOfficerAgent.id,
          user_id: userId,
          message: message,
          channel_id: `expedition-${expeditionId}`,
          stream: false
        };

        console.log(`[MESSAGE-SERVICE] Sending request to agent engine for First Officer...`);
        const store = getStore();
        const result = await agentChat(chatRequest, store);

        console.log(`[MESSAGE-SERVICE] First Officer response generated:`, {
          replyLength: result.reply?.length,
          usage: result.usage
        });
        console.log(`[MESSAGE-SERVICE] First Officer reply preview: ${result.reply?.substring(0, 100)}...`);
        console.log(`[MESSAGE-SERVICE] ===== FIRST OFFICER MESSAGE HANDLED SUCCESSFULLY =====`);

        return {
          reply: result.reply || 'I apologize, I was unable to generate a response.',
          usage: result.usage
        };
      }
      
      console.log(`[MESSAGE-SERVICE] No First Officer handling needed for messageType: ${messageType}`);
      console.log(`[MESSAGE-SERVICE] ===== FIRST OFFICER MESSAGE HANDLING SKIPPED =====`);
      return null;
    } catch (error) {
      console.error('[MESSAGE-SERVICE] ===== FIRST OFFICER MESSAGE HANDLING FAILED =====');
      console.error('[MESSAGE-SERVICE] Error details:', error);
      // Don't throw error - message was still sent successfully
      return null;
    }
  }

  private applyMessageFilters(messages: ExpeditionMessage[], filters: MessageFilters): ExpeditionMessage[] {
    return messages.filter(message => {
      if (filters.role && !filters.role.includes(message.role)) return false;
      if (filters.messageType && !filters.messageType.includes(message.messageType)) return false;
      if (filters.agentId && message.agentId !== filters.agentId) return false;
      if (filters.userId && message.userId !== filters.userId) return false;
      if (filters.threadId && message.threadId !== filters.threadId) return false;
      
      if (filters.dateRange) {
        const messageTime = new Date(message.timestamp).getTime();
        const startTime = new Date(filters.dateRange.start).getTime();
        const endTime = new Date(filters.dateRange.end).getTime();
        if (messageTime < startTime || messageTime > endTime) return false;
      }
      
      if (filters.search && !message.content.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }

  private extractParticipants(messages: ExpeditionMessage[]): Array<{
    id: string;
    role: MessageRole;
    name: string;
  }> {
    const participantMap = new Map<string, { role: MessageRole; name: string }>();
    
    messages.forEach(message => {
      const id = message.userId || message.agentId || 'system';
      if (!participantMap.has(id)) {
        participantMap.set(id, {
          role: message.role,
          name: this.getParticipantName(message)
        });
      }
    });
    
    return Array.from(participantMap.entries()).map(([id, info]) => ({
      id,
      role: info.role,
      name: info.name
    }));
  }

  private getParticipantName(message: ExpeditionMessage): string {
    if (message.role === 'user') return 'User';
    if (message.role === 'first-officer') return 'First Officer';
    if (message.role === 'agent') return `Agent ${message.agentId?.slice(0, 8) || 'Unknown'}`;
    return 'System';
  }

  private validateFileAttachment(file: { name: string; type: string; size: number }): void {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'text/plain', 'text/markdown',
      'application/json', 'text/csv'
    ];

    if (file.size > maxSize) {
      throw this.createError('VALIDATION_ERROR', 'File size exceeds 10MB limit');
    }

    if (!allowedTypes.includes(file.type)) {
      throw this.createError('VALIDATION_ERROR', 'File type not allowed');
    }
  }

  private generateThreadId(): string {
    return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createError(code: ExpeditionErrorCode, message: string): ExpeditionError {
    return {
      code,
      message,
      details: undefined
    };
  }

  private handleError(error: any, fallbackCode: string): ExpeditionError {
    if (error.code) {
      return error;
    }

    return {
      code: fallbackCode as ExpeditionErrorCode,
      message: error.message || 'Unknown error occurred',
      details: error
    };
  }
}