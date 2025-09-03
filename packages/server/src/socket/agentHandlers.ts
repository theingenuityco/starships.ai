import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { BaseSocketEvents, SessionRequest, SessionStreamChunk } from '@starships/protocol';
import { AgentService } from '../services/AgentService';
import { SocketIOService } from '../services/SocketIOService';
import { RepositoryFactory } from '@starships/models';
import { SessionService } from '../services/SessionService';
import { UserService } from '../services/UserService';
import getStore from '../store';

export function setupAgentHandlers(io: SocketIOServer<BaseSocketEvents>) {
  
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
    const socketService = SocketIOService.getInstance();

    // Handle agent stream start
    socket.on('session:start-stream', async (request: SessionRequest) => {
      if (request.source !== 'agent' || !request.agentId) return;
      
      // Get current userId (may be temporary or resolved)
      const currentUserId = socket.data.userId;
      const kindeId = socket.data.kindeId;
      const isUserResolved = socket.data.userResolved;
      
      console.log(`[AGENT SOCKET] Starting stream for user ${currentUserId} (resolved: ${isUserResolved}), agent ${request.agentId}:`, request.streamId);

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

        // Get agent first to validate and get starshipId
        const agent = await AgentService.getAgent(request.agentId);
        if (!agent || !agent.starshipId) {
          socket.emit('session:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'AGENT_NOT_FOUND',
            message: `Agent ${request.agentId} not found or has no starshipId`,
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Handle session - ONLY use provided sessionId, do NOT create sessions via socket
        let sessionId: string;
        if (!request.sessionId) {
          socket.emit('session:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'SESSION_REQUIRED',
            message: 'sessionId is required. Sessions must be created via API endpoints, not WebSocket.',
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Validate provided session belongs to user and agent
        try {
          const existingSession = await SessionService.getSessionById(request.sessionId);
          
          // Check if session exists
          if (!existingSession) {
            throw new Error('Session not found');
          }
          
          // Enhanced user validation - handle both temporary and resolved user IDs
          let userMatches = false;
          
          if (isUserResolved) {
            // If user is resolved, use direct comparison
            userMatches = existingSession.userId === currentUserId;
          } else {
            // If user is not resolved yet, try to match against Kinde ID
            // We need to get the user by Kinde ID and check if it matches the session
            try {
              const user = await UserService.getUserByKindeId(kindeId);
              if (user) {
                userMatches = existingSession.userId === user.id;
                // Update socket with resolved user ID for future requests
                socket.data.userId = user.id;
                socket.data.userResolved = true;
                console.log(`[AGENT SOCKET] Resolved user during session validation: ${kindeId} -> ${user.id}`);
              }
            } catch (userLookupError) {
              console.error(`[AGENT SOCKET] Failed to resolve user during session validation:`, userLookupError);
            }
          }
          
          // Validate session ownership and agent match
          if (!userMatches || existingSession.agentId !== request.agentId) {
            console.error(`[AGENT SOCKET] Session validation failed:`, {
              sessionUserId: existingSession.userId,
              currentUserId: currentUserId,
              kindeId: kindeId,
              userResolved: isUserResolved,
              userMatches: userMatches,
              sessionAgentId: existingSession.agentId,
              requestAgentId: request.agentId
            });
            throw new Error('Session access denied - ownership or agent mismatch');
          }
          
          sessionId = request.sessionId;
          await SessionService.updateSessionActivity(sessionId);
          console.log(`✅ [AGENT SESSION] Using existing session: ${sessionId}`);
          
        } catch (error) {
          console.error(`❌ [AGENT SESSION] Session validation failed for ${request.sessionId}:`, error);
          socket.emit('session:stream-error', {
            streamId: request.streamId,
            agentId: request.agentId,
            errorCode: 'SESSION_ACCESS_DENIED',
            message: error instanceof Error ? error.message : 'Session validation failed',
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Store user message with proper session reference
        await storeMessage(agent.starshipId, 'user', request.message, {
          streamId: request.streamId,
          sessionId: sessionId
        });

        // Send typing start indication
        socket.emit('session:typing-start', { userId: socket.data.userId, sessionId, isTyping: true });

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
          userId: socket.data.userId, // Use current (potentially updated) userId
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
          await storeMessage(agent.starshipId, 'assistant', fullResponse, {
            streamId: request.streamId,
            sessionId: sessionId,
            usage: response.usage
          });

          // Send completion with sessionId in metadata
          socket.emit('session:typing-stop', { userId: socket.data.userId, sessionId, isTyping: false });
          socket.emit('session:stream-complete', {
            source: 'agent' as const,
            streamId: request.streamId || `stream-${Date.now()}`,
            agentId: request.agentId,
            type: 'complete',
            content: fullResponse,
            timestamp: Date.now(),
            metadata: {
              sessionId: sessionId
            }
          });
        } catch (agentError) {
          console.error(`[AGENT SOCKET] Agent engine error:`, agentError);
          throw agentError;
        }

        console.log(`[AGENT SOCKET] Stream completed for user ${socket.data.userId}, agent ${request.agentId}`);

      } catch (error) {
        console.error(`[AGENT SOCKET] Stream error for user ${socket.data.userId}, agent ${request.agentId}:`, error);
        socket.emit('session:typing-stop', { userId: socket.data.userId, sessionId: 'unknown', isTyping: false });
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
      const currentUserId = socket.data.userId;
      console.log(`[AGENT SOCKET] Stream stopped by user ${currentUserId}:`, streamId);
      // TODO: Implement stream cancellation logic
      // For now, just stop typing indicator
      socket.emit('session:typing-stop', { userId: currentUserId, sessionId: 'unknown', isTyping: false });
    });

    // Handle agent room management
    socket.on('session:join-room', (data: { roomId: string, userId: string, sessionId?: string }) => {
      const currentUserId = socket.data.userId;
      // Only allow users to join their own agent rooms
      if (data.userId === currentUserId) {
        socket.join(data.roomId);
        console.log(`[AGENT SOCKET] User ${currentUserId} joined room ${data.roomId}`);
      } else {
        console.warn(`[AGENT SOCKET] User ${currentUserId} attempted to join room for user ${data.userId}`);
      }
    });

    socket.on('session:leave-room', (data: { roomId: string, userId: string, sessionId?: string }) => {
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