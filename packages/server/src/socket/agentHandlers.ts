import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { BaseSocketEvents, SessionRequest, SessionStreamChunk } from '@starships/protocol';
import { AgentService } from '../services/AgentService';
import { SocketIOService } from '../services/SocketIOService';
import { RepositoryFactory } from '@starships/models';
import getStore from '../store';

export function setupAgentHandlers(io: SocketIOServer<BaseSocketEvents>) {
  // Helper functions for agent session management using MessageRepository
  const getOrCreateAgentSession = async (userId: string, agentId: string): Promise<string> => {
    const messageRepo = RepositoryFactory.getMessageRepository();
    
    // Get agent to retrieve starship_id for proper session association
    const agent = await AgentService.getAgent(agentId);
    if (!agent) {
      console.error(`❌ [AGENT SESSION] Agent not found: ${agentId}`);
      return `session-${agentId}-${userId}-${Date.now()}`;
    }

    // CRITICAL FIX: Ensure agent has a starshipId before creating session
    if (!agent.starshipId) {
      console.error(`❌ [AGENT SESSION] Agent ${agentId} has no starshipId assigned - using fallback session`);
      return `session-${agentId}-${userId}-${Date.now()}`;
    }
    
    // For now, just return a session ID based on agent and user
    return `session-${agentId}-${userId}`;
  };
  
  const isSessionActive = (session: any): boolean => {
    const lastActivity = new Date(session.last_activity_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    return diffMinutes < 30; // 30 minute timeout
  };
  
  const storeMessage = async (starshipId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: any): Promise<void> => {
    const messageRepo = RepositoryFactory.getMessageRepository();
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
      hasAttachments: false
    });
  };

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const socketService = SocketIOService.getInstance();

    // Handle agent stream start
    socket.on('session:start-stream', async (request: SessionRequest) => {
      if (request.source !== 'agent' || !request.agentId) return;
      console.log(`[AGENT SOCKET] Starting stream for user ${userId}, agent ${request.agentId}:`, request.streamId);

      try {
        // Validate request
        if (!request.message || !request.agentId) {
          socket.emit('session:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'INVALID_REQUEST',
            message: 'Message and agentId are required',
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Get or create session ID
        const sessionId = await getOrCreateAgentSession(userId, request.agentId);
        
        console.log(`✅ [AGENT SESSION] Using session: ${sessionId} for agent ${request.agentId}`);

        // Get agent to get starshipId for message storage
        const agent = await AgentService.getAgent(request.agentId);
        const starshipId = agent?.starshipId || 'unknown';

        // Store user message
        await storeMessage(starshipId, 'user', request.message, {
          streamId: request.streamId
        });

        // Verify agent exists (reuse the agent variable from above)
        if (!agent) {
          socket.emit('session:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'AGENT_NOT_FOUND',
            message: `Agent ${request.agentId} not found`,
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Send typing start indication
        socket.emit('session:typing-start', { userId, sessionId, isTyping: true });

        // Track agent usage
        try {
          await AgentService.trackUsage(request.agentId);
        } catch (error) {
          console.warn(`[AGENT SOCKET] Failed to track usage for agent ${request.agentId}:`, error);
          // Continue with streaming - don't fail on analytics
        }

        // Convert to SessionRequest for agent engine with proper sessionId
        const sessionRequest: SessionRequest = {
          source: 'agent',
          agentId: request.agentId,
          userId: userId,
          message: request.message,
          sessionId: sessionId, // Use the session ID
          stream: true // Enable true streaming
        };

        // Get memory store
        const store = getStore();

        // Use the full agent engine with all features (tools, memory)
        const typingSpeed = request.typingSpeed || 75; // chars per second
        const typewriterEnabled = request.typewriterEnabled !== false;
        
        try {
          // Call the full agent engine
          const response = await AgentService.executeChat(sessionRequest);
          const fullResponse = response.content;

          // Simulate streaming with typewriter effect for better UX
          if (typewriterEnabled && fullResponse) {
            const characters = fullResponse.split('');
            for (let i = 0; i < characters.length; i++) {
              const char = characters[i];
              const delay = 1000 / typingSpeed; // milliseconds per character

              const typewriterChunk: SessionStreamChunk = {
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
                  isMarkdown: false // TODO: Add markdown detection if needed
                },
                timestamp: Date.now()
              };

              socket.emit('session:stream-chunk', typewriterChunk);

              // Add small delay for typewriter effect
              if (i < characters.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          } else {
            // Send all content at once if typewriter is disabled
            const streamChunk: SessionStreamChunk = {
              source: 'agent' as const,
              streamId: request.streamId || `stream-${Date.now()}`,
              agentId: request.agentId,
              type: 'content',
              content: fullResponse,
              timestamp: Date.now()
            };
            socket.emit('session:stream-chunk', streamChunk);
          }

          // Store assistant message
          await storeMessage(starshipId, 'assistant', fullResponse, {
            streamId: request.streamId,
            usage: response.usage
          });

          // Send completion
          socket.emit('session:typing-stop', { userId, sessionId, isTyping: false });
          socket.emit('session:stream-complete', {
            source: 'agent' as const,
            streamId: request.streamId || `stream-${Date.now()}`,
            agentId: request.agentId,
            type: 'complete',
            content: fullResponse,
            timestamp: Date.now()
          });
        } catch (agentError) {
          console.error(`[AGENT SOCKET] Agent engine error:`, agentError);
          throw agentError;
        }

        console.log(`[AGENT SOCKET] Stream completed for user ${userId}, agent ${request.agentId}`);

      } catch (error) {
        console.error(`[AGENT SOCKET] Stream error for user ${userId}, agent ${request.agentId}:`, error);
        socket.emit('session:typing-stop', { userId, sessionId: 'unknown', isTyping: false });
        socket.emit('session:stream-error', {
          streamId: request.streamId,
          agentId: request.agentId,
          errorCode: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown server error',
          timestamp: Date.now(),
          recoverable: true
        });
      }
    });

    // Handle agent stream stop
    socket.on('session:stop-stream', (streamId: string) => {
      console.log(`[AGENT SOCKET] Stream stopped by user ${userId}:`, streamId);
      // TODO: Implement stream cancellation logic
      // For now, just stop typing indicator
      socket.emit('session:typing-stop', { userId, sessionId: 'unknown', isTyping: false });
    });

    // Handle agent room management
    socket.on('session:join-room', (data: { roomId: string, userId: string, sessionId?: string }) => {
      // Only allow users to join their own agent rooms
      if (data.userId === userId) {
        socket.join(data.roomId);
        console.log(`[AGENT SOCKET] User ${userId} joined room ${data.roomId}`);
      } else {
        console.warn(`[AGENT SOCKET] User ${userId} attempted to join room for user ${data.userId}`);
      }
    });

    socket.on('session:leave-room', (data: { roomId: string, userId: string, sessionId?: string }) => {
      if (data.userId === userId) {
        socket.leave(data.roomId);
        console.log(`[AGENT SOCKET] User ${userId} left room ${data.roomId}`);
      } else {
        console.warn(`[AGENT SOCKET] User ${userId} attempted to leave room for user ${data.userId}`);
      }
    });
  });
}