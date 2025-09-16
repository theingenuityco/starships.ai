import { MessageService } from '@/services/MessageService';
import { StreamingService } from '@/services/StreamingService';
import { Agent, AutopilotEvent } from '@starships/autopilot';
import { NotFoundError } from '@starships/errors';
import { ConversationRepository } from '@starships/models';
import { AgentModel, ConversationModel, ConversationStatus, Message, MessageModel, StarshipModel } from '@starships/protocol';
import { Operation } from 'fast-json-patch';

/**
 * Clean conversation service with proper error handling
 */
export class ConversationService {
  private conversationRepository: ConversationRepository;
  private messageService: MessageService;
  private streamingService: StreamingService;
  // Track accumulated content for streaming messages by conversation ID
  private streamingContent: Map<string, string> = new Map();

  constructor() {
    this.conversationRepository = new ConversationRepository();
    this.messageService = new MessageService();
    this.streamingService = new StreamingService();
  }

  /**
   * Create a new conversation
   */
  async createConversation(data: ConversationModel & { starshipId: string; agentId?: string }): Promise<ConversationModel> {
    const conversation = await this.conversationRepository.create({
      title: data.title || 'New Conversation',
      status: 'active',
      starshipId: data.starshipId,
      agentId: data.agentId,
    });

    return conversation;
  }

  /**
   * Get conversations by starship
   */
  async getConversationsByStarship(starshipId: string): Promise<ConversationModel[]> {
    return this.conversationRepository.findByStarship(starshipId);
  }

  /**
   * Link conversation to starship
   */
  async linkConversationToStarship(conversationId: string, starshipId: string): Promise<void> {
    await this.conversationRepository.linkToStarship(conversationId, starshipId);
  }

  /**
   * Get starship for conversation
   */
  async getConversationStarship(conversationId: string): Promise<StarshipModel | null> {
    return this.conversationRepository.getConversationStarship(conversationId);
  }

  /**
   * Get agents in conversation
   */
  async getConversationAgents(conversationId: string): Promise<AgentModel[]> {
    return this.conversationRepository.getConversationAgents(conversationId);
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(id: string): Promise<ConversationModel | null> {
    return this.conversationRepository.findById(id);
  }

  /**
   * Complete a conversation
   */
  async completeConversation(conversationId: string): Promise<void> {
    await this.updateConversationStatus(conversationId, 'completed');
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    await this.updateConversationStatus(conversationId, 'archived');
  }

  /**
   * Update conversation status and activity timestamp
   */
  async updateConversationStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    await this.conversationRepository.update(conversationId, {
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get messages for a conversation
   */
  async getConversationMessages(
    conversationId: string,
    orderBy: 'createdAt' = 'createdAt',
    orderDirection: 'asc' | 'desc' = 'asc'
  ): Promise<MessageModel[]> {
    return this.conversationRepository.getConversationMessages(conversationId, orderBy, orderDirection);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    return this.conversationRepository.delete(conversationId);
  }

  async addConversationMessage(data: Message & { conversationId: string }): Promise<void> {
    // Save user message to database
    const userMessage = await this.messageService.createMessage({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      messageType: data.messageType,
    });

    // Broadcast user message immediately via streaming if available
    if (this.streamingService) {
      const userMessageDelta: Operation = {
        op: 'add',
        path: '/messages/-',
        value: userMessage,
      };
      await this.streamingService.broadcastDelta(data.conversationId, userMessageDelta);
    }

    const agentModels = await this.getConversationAgents(data.conversationId);
    if (agentModels.length < 1) {
      throw new NotFoundError('Agent', `for Conversation ${data.conversationId}`);
    }
    // only first agent for now
    const agentModel = agentModels[0];

    console.log('🚀 [AGENT-SERVICE] Starting streaming conversation execution:', {
      agentId: agentModel.id,
      conversationId: data.conversationId,
      timestamp: new Date().toISOString(),
    });

    const conversation = await this.getConversationById(data.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation', data.conversationId);
    }

    // Get conversation messages from database
    const messages = await this.getConversationMessages(data.conversationId);

    const startTime = Date.now();

    try {
      // Create agent instance with enhanced options
      const agent = new Agent(agentModel, {
        eventCallback: (event) => this.eventCallback(data.conversationId, event),
      });
      messages.forEach((message) => agent.addMessageToMemory(message));

      // Execute agent with streaming-enabled execution
      await agent.execute();

      const executionTime = Date.now() - startTime;

      console.log('✅ [AGENT-SERVICE] Streaming conversation execution completed successfully:', {
        executionTime,
      });

      // Send completion event
      if (this.streamingService) {
        await this.streamingService.broadcastComplete(data.conversationId, {
          source: 'agent',
          content: 'Workflow completed',
          agentId: agentModel.id,
        });
      }
    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Streaming conversation execution failed:', {
        agentId: agentModel.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Send error via streaming if available
      if (this.streamingService) {
        await this.streamingService.broadcastError(data.conversationId, {
          streamId: data.conversationId,
          errorCode: 'AGENT_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown agent execution error',
          timestamp: new Date().toISOString(),
          recoverable: false,
        });
      }

      throw error;
    }
  }

  async eventCallback(conversationId: string, event: AutopilotEvent): Promise<void> {
    if (!this.streamingService) {
      console.log('No streaming service available for event:', event.type);
      return;
    }

    switch (event.type) {
      case 'workflow_started': {
        console.log('[STREAMING] Workflow started for conversation:', conversationId);
        // Initialize streaming content tracker
        this.streamingContent.set(conversationId, '');

        // Create initial assistant message placeholder for streaming
        const assistantMessage: MessageModel = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          content: '',
          messageType: 'agent_response',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };

        // Add placeholder message to messages array with contentChunks array for delta accumulation
        const delta: Operation = {
          op: 'add',
          path: '/messages/-',
          value: { ...assistantMessage, streaming: true, contentChunks: [] },
        };
        await this.streamingService.broadcastDelta(conversationId, delta);
        break;
      }

      case 'content_chunk': {
        // Stream content chunks in real-time
        const chunkContent = event.data?.chunk;
        if (
          chunkContent &&
          Array.isArray(chunkContent.choices) &&
          chunkContent.choices.length > 0 &&
          chunkContent.choices[0]?.delta?.content
        ) {
          const content = String(chunkContent.choices[0].delta.content);
          console.log('[STREAMING] Content chunk:', content);

          // Track accumulated content server-side for completion event
          const currentContent = this.streamingContent.get(conversationId) || '';
          const currentLength = currentContent.length;
          const newContent = currentContent + content;
          this.streamingContent.set(conversationId, newContent);

          // Send content chunk with positional information for client-side accumulation
          const delta: Operation = {
            op: 'add',
            path: '/messages/-1/contentChunks/-',
            value: {
              content: content,
              position: currentLength,
              timestamp: Date.now(),
            },
          };
          await this.streamingService.broadcastDelta(conversationId, delta);
        }
        break;
      }

      case 'content_complete': {
        console.log('[STREAMING] Content streaming complete');
        // Set the final accumulated content and mark as complete
        const finalContent = this.streamingContent.get(conversationId) || '';

        const completionOperations: Operation[] = [
          {
            op: 'replace',
            path: '/messages/-1/content',
            value: finalContent,
          },
          {
            op: 'replace',
            path: '/messages/-1/streaming',
            value: false,
          },
          {
            op: 'remove',
            path: '/messages/-1/contentChunks',
          },
        ];

        // Send all completion operations together
        for (const operation of completionOperations) {
          await this.streamingService.broadcastDelta(conversationId, operation);
        }

        // Persist the final assistant message to the database and patch stable fields
        try {
          const assistantMessage = await this.messageService.createMessage({
            conversationId,
            role: 'assistant',
            content: finalContent,
            messageType: 'agent_response',
          });

          const finalizeOps: Operation[] = [
            {
              op: 'replace',
              path: '/messages/-1/id',
              value: assistantMessage.id,
            },
            {
              op: 'replace',
              path: '/messages/-1/updatedAt',
              value: assistantMessage.updatedAt,
            },
          ];

          for (const op of finalizeOps) {
            await this.streamingService.broadcastDelta(conversationId, op);
          }
        } catch (persistError) {
          console.error('[STREAMING] Failed saving assistant message on content_complete:', persistError);
        }

        // Clear streaming content tracker
        this.streamingContent.delete(conversationId);
        break;
      }

      case 'node_started': {
        console.log('[STREAMING] Node started:', event.data?.execution?.currentNodeRef);
        // Node started
        break;
      }

      case 'node_completed': {
        console.log('[STREAMING] Node completed:', event.data?.execution?.currentNodeRef);
        // Persistence is handled on 'content_complete' to ensure final content is available and avoid race conditions.
        break;
      }

      case 'workflow_completed': {
        console.log('[STREAMING] Workflow completed successfully');
        // Final completion will be handled by the main addConversationMessage method
        break;
      }

      case 'workflow_failed': {
        console.error('[STREAMING] Workflow failed:', event.data?.execution?.error);

        // Create error message
        const errorMessage = await this.messageService.createMessage({
          conversationId,
          role: 'system',
          content: `❌ Workflow failed: ${event.data?.execution?.error || 'Unknown error'}`,
          messageType: 'error',
        });

        // Broadcast error message
        const delta: Operation = {
          op: 'add',
          path: '/messages/-',
          value: errorMessage,
        };
        await this.streamingService.broadcastDelta(conversationId, delta);
        break;
      }

      default:
        console.log('[STREAMING] Unhandled event type:', event.type);
        break;
    }
  }
}
