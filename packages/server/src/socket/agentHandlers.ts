import { AgentService } from '@/services/AgentService';
import { ConversationService } from '@/services/ConversationService';
import { SocketIOService } from '@/services/SocketIOService';
import getStore from '@/store';
import { AgentRepository, MessageRepository } from '@starships/models';
import type { BaseSocketEvents, ConversationRequest } from '@starships/protocol';
import type { Socket, Server as SocketIOServer } from 'socket.io';

export function setupAgentHandlers(io: SocketIOServer<BaseSocketEvents>) {
  const conversationService = new ConversationService();

  const isConversationActive = (conversation: any): boolean => {
    const lastActivity = new Date(conversation.lastActivityAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    return diffMinutes < 30; // 30 minute timeout
  };

  const storeMessage = async (
    starshipId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: any
  ): Promise<void> => {
    const messageRepo = new MessageRepository();
    await messageRepo.create({
      role,
      content,
      starshipId: starshipId,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      metadata: metadata || {},
      // Provide defaults for required fields
      threadDepth: 0,
      processingStatus: 'pending',
      messageType: role === 'system' ? 'system_message' : role === 'user' ? 'user_input' : 'agent_response',
      importance: 'medium',
      hasAttachments: false,
    });
  };

  io.on('connection', (socket: Socket) => {
    const socketService = SocketIOService.getInstance();

    // Handle conversation stream start
    socket.on('conversation:start-stream', async (request: ConversationRequest) => {
      if (request.source !== 'agent' || !request.agentId) return;

      // Get current userId
      const currentUserId = socket.data.userId;

      console.log(`[AGENT SOCKET] Starting stream for user ${currentUserId}, agent ${request.agentId}:`, request.streamId);

      try {
        // Validate request
        if (!request.message || !request.agentId) {
          socket.emit('conversation:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'INVALID_REQUEST',
            message: 'Message and agentId are required',
            timestamp: Date.now(),
            recoverable: false,
          });
          return;
        }

        // Get agent first to validate and get starshipId
        const agentRepository = new AgentRepository();
        const agent = await agentRepository.findById(request.agentId);
        if (!agent || !agent.starshipId) {
          socket.emit('conversation:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'AGENT_NOT_FOUND',
            message: `Agent ${request.agentId} not found or has no starshipId`,
            timestamp: Date.now(),
            recoverable: false,
          });
          return;
        }

        // Handle conversation - ONLY use provided conversationId, do NOT create conversations via socket
        let conversationId: string;
        if (!request.conversationId) {
          socket.emit('conversation:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'CONVERSATION_REQUIRED',
            message: 'conversationId is required. Conversations must be created via API endpoints, not WebSocket.',
            timestamp: Date.now(),
            recoverable: false,
          });
          return;
        }

        // Validate provided conversation exists
        try {
          const existingConversation = await conversationService.getConversationById(request.conversationId);

          // Check if conversation exists
          if (!existingConversation) {
            throw new Error('Conversation not found');
          }

          conversationId = request.conversationId;
          await conversationService.updateConversationActivity(conversationId);
          console.log(`✅ [AGENT CONVERSATION] Using existing conversation: ${conversationId}`);
        } catch (error) {
          console.error(`❌ [AGENT CONVERSATION] Conversation validation failed for ${request.conversationId}:`, error);
          socket.emit('conversation:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'CONVERSATION_ACCESS_DENIED',
            message: error instanceof Error ? error.message : 'Conversation validation failed',
            timestamp: Date.now(),
            recoverable: false,
          });
          return;
        }

        // Store user message with proper conversation reference
        await storeMessage(agent.starshipId, 'user', request.message, {
          streamId: request.streamId,
          conversationId: conversationId,
        });

        // Send typing start indication
        socket.emit('conversation:typing-start', {
          userId: socket.data.userId,
          conversationId,
          isTyping: true,
        });

        // Track agent usage
        try {
          await agentRepository.incrementUsageCount(request.agentId);
        } catch (error) {
          console.warn(`[AGENT SOCKET] Failed to track usage for agent ${request.agentId}:`, error);
          // Continue with streaming - don't fail on analytics
        }

        // Convert to ConversationRequest for agent engine with proper conversationId
        const conversationRequest: ConversationRequest = {
          source: 'agent',
          agentId: request.agentId,
          userId: currentUserId,
          message: request.message,
          conversationId: conversationId, // Use the conversation ID
          stream: true, // Enable true streaming
        };

        // Get memory store
        const store = getStore();

        // Use the full agent engine with all features (tools, memory)
        const typingSpeed = request.typingSpeed || 75; // chars per second
        const typewriterEnabled = request.typewriterEnabled !== false;

        try {
          // Call the full agent engine
          const response = await AgentService.executeChat(conversationRequest);
          const fullResponse = response.content;

          // Simulate streaming with typewriter effect for better UX
          if (typewriterEnabled && fullResponse) {
            const characters = fullResponse.split('');
            for (let i = 0; i < characters.length; i++) {
              const char = characters[i];
              const delay = 1000 / typingSpeed; // milliseconds per character

              const typewriterChunk = {
                source: 'agent' as const,
                streamId: request.streamId || `stream-${Date.now()}`,
                agentId: request.agentId,
                type: 'content',
                content: char,
                typewriter: {
                  type: 'character',
                  content: char,
                  position: i,
                  totalLength: fullResponse.length,
                  delay,
                  isCode: false, // TODO: Add code detection if needed
                  isMarkdown: false, // TODO: Add markdown detection if needed
                },
                timestamp: Date.now(),
              };

              socket.emit('conversation:stream-chunk', typewriterChunk);

              // Add small delay for typewriter effect
              if (i < characters.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }
          } else {
            // Send all content at once if typewriter is disabled
            const streamChunk = {
              source: 'agent' as const,
              streamId: request.streamId || `stream-${Date.now()}`,
              agentId: request.agentId,
              type: 'content',
              content: fullResponse,
              timestamp: Date.now(),
            };
            socket.emit('conversation:stream-chunk', streamChunk);
          }

          // Store assistant message
          await storeMessage(agent.starshipId, 'assistant', fullResponse, {
            streamId: request.streamId,
            conversationId: conversationId,
            usage: response.usage,
          });

          // Send completion with conversationId in metadata
          socket.emit('conversation:typing-stop', {
            userId: socket.data.userId,
            conversationId: conversationId,
            isTyping: false,
          });
          socket.emit('conversation:stream-complete', {
            source: 'agent' as const,
            streamId: request.streamId || `stream-${Date.now()}`,
            agentId: request.agentId,
            type: 'complete',
            content: fullResponse,
            timestamp: Date.now(),
            metadata: {
              conversationId: conversationId,
            },
          });
        } catch (agentError) {
          console.error(`[AGENT SOCKET] Agent engine error:`, agentError);
          throw agentError;
        }

        console.log(`[AGENT SOCKET] Stream completed for user ${socket.data.userId}, agent ${request.agentId}`);
      } catch (error) {
        console.error(`[AGENT SOCKET] Stream error for user ${socket.data.userId}, agent ${request.agentId}:`, error);
        socket.emit('conversation:typing-stop', {
          userId: socket.data.userId,
          conversationId: 'unknown',
          isTyping: false,
        });
        socket.emit('conversation:stream-error', {
          streamId: request.streamId,
          agentId: request.agentId,
          errorCode: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown server error',
          timestamp: Date.now(),
          recoverable: true,
        });
      }
    });

    // Handle conversation stream stop
    socket.on('conversation:stop-stream', (streamId: string) => {
      const currentUserId = socket.data.userId;
      console.log(`[AGENT SOCKET] Stream stopped by user ${currentUserId}:`, streamId);
      // TODO: Implement stream cancellation logic
      // For now, just stop typing indicator
      socket.emit('conversation:typing-stop', {
        userId: currentUserId,
        conversationId: 'unknown',
        isTyping: false,
      });
    });

    // Handle conversation room management
    socket.on('conversation:join-room', (data: { roomId: string; userId: string; conversationId?: string }) => {
      const currentUserId = socket.data.userId;
      // Only allow users to join their own agent rooms
      if (data.userId === currentUserId) {
        socket.join(data.roomId);
        console.log(`[AGENT SOCKET] User ${currentUserId} joined room ${data.roomId}`);
      } else {
        console.warn(`[AGENT SOCKET] User ${currentUserId} attempted to join room for user ${data.userId}`);
      }
    });

    socket.on('conversation:leave-room', (data: { roomId: string; userId: string; conversationId?: string }) => {
      const currentUserId = socket.data.userId;
      if (data.userId === currentUserId) {
        socket.leave(data.roomId);
        console.log(`[AGENT SOCKET] User ${currentUserId} left room ${data.roomId}`);
      } else {
        console.warn(`[AGENT SOCKET] User ${currentUserId} attempted to leave room for user ${data.userId}`);
      }
    });
  });
}
