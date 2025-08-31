import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { SocketEvents, ChatRequest, ChatStreamChunk } from '@starships/protocol';
import { AutopilotAgentExecutionService } from '../services/AutopilotAgentExecutionService';
import { AgentService } from '../services/AgentService';
import { SocketIOService } from '../services/SocketIOService';
import { RepositoryFactory } from '@starships/models';
import getStore from '../store';

export function setupAgentHandlers(io: SocketIOServer<SocketEvents>) {
  // Helper functions for agent chat session management (following sibil pattern)
  const getOrCreateAgentChatSession = async (userId: string, agentId: string): Promise<any> => {
    const chatSessionRepo = RepositoryFactory.getChatSessionRepository();
    
    // Get agent to retrieve starship_id for proper session association
    const agent = await AgentService.getAgent(agentId);
    if (!agent) {
      console.error(`❌ [AGENT SESSION] Agent not found: ${agentId}`);
      return null;
    }

    // CRITICAL FIX: Ensure agent has a starshipId before creating session
    if (!agent.starshipId) {
      console.error(`❌ [AGENT SESSION] Agent ${agentId} has no starshipId assigned - cannot create session`);
      return null;
    }
    
    // Try to find active session for this agent/starship combination
    const activeSessions = await chatSessionRepo.findByStarship(agent.starshipId, 10);
    const existingSession = activeSessions.find((session: any) =>
      session.agent_id === agentId &&
      session.source === 'agent' &&
      isSessionActive(session)
    );
    
    if (existingSession) {
      await chatSessionRepo.updateActivity(existingSession.id);
      return existingSession;
    }
    
    console.log(`✅ [AGENT SESSION] Creating new session for agent ${agentId} on starship ${agent.starshipId}`);
    
    // Create new session with proper starship relationship
    return await chatSessionRepo.create({
      source: 'agent',
      agent_id: agentId,
      starship_id: agent.starshipId  // Required - no undefined check
    });
  };
  
  const isSessionActive = (session: any): boolean => {
    const lastActivity = new Date(session.last_activity_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    return diffMinutes < 30; // 30 minute timeout
  };
  
  const storeMessage = async (sessionId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: any): Promise<void> => {
    const chatMessageRepo = RepositoryFactory.getChatMessageRepository();
    await chatMessageRepo.create({
      session_id: sessionId,
      role,
      content,
      structured_content: metadata?.structured_content,
      stream_id: metadata?.stream_id
    });
  };

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const socketService = SocketIOService.getInstance();

    // Handle agent stream start
    socket.on('chat:start-stream', async (request: ChatRequest) => {
      if (request.source !== 'agent' || !request.agent_id) return;
      console.log(`[AGENT SOCKET] Starting stream for user ${userId}, agent ${request.agent_id}:`, request.stream_id);

      try {
        // Validate request
        if (!request.message || !request.agent_id) {
          socket.emit('agent:stream-error', {
            stream_id: request.stream_id,
            agent_id: request.agent_id,
            error_code: 'INVALID_REQUEST',
            message: 'Message and agent_id are required',
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Get or create chat session in database
        const chatSession = await getOrCreateAgentChatSession(userId, request.agent_id);
        if (!chatSession) {
          socket.emit('agent:stream-error', {
            stream_id: request.stream_id,
            agent_id: request.agent_id,
            error_code: 'SESSION_CREATION_FAILED',
            message: 'Failed to create or retrieve chat session',
            timestamp: Date.now(),
            recoverable: true
          });
          return;
        }

        console.log(`✅ [AGENT SESSION] Using session: ${chatSession.id} for agent ${request.agent_id}`);

        // Store user message
        await storeMessage(chatSession.id, 'user', request.message, {
          stream_id: request.stream_id
        });

        // Verify agent exists
        const agent = await AgentService.getAgent(request.agent_id);
        if (!agent) {
          socket.emit('agent:stream-error', {
            stream_id: request.stream_id,
            agent_id: request.agent_id,
            error_code: 'AGENT_NOT_FOUND',
            message: `Agent ${request.agent_id} not found`,
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Send stream start confirmation
        socket.emit('chat:stream-start', { streamId: request.stream_id, source: 'agent', agentId: request.agent_id });
        socket.emit('chat:typing-start', { source: 'agent', agentId: request.agent_id });

        // Track agent usage
        try {
          await AgentService.trackUsage(request.agent_id);
        } catch (error) {
          console.warn(`[AGENT SOCKET] Failed to track usage for agent ${request.agent_id}:`, error);
          // Continue with streaming - don't fail on analytics
        }

        // Convert to ChatRequest for agent engine with proper session_id
        const chatRequest: ChatRequest = {
          source: 'agent',
          agent_id: request.agent_id,
          user_id: userId,
          message: request.message,
          session_id: chatSession.id, // Use the actual database session ID
          stream: true // Enable true streaming
        };

        // Get memory store
        const store = getStore();

        // Use the full agent engine with all features (vision, tools, memory)
        const typingSpeed = request.typing_speed || 75; // chars per second
        const typewriterEnabled = request.typewriter_enabled !== false;
        
        try {
          // Call the full agent engine
          const response = await AutopilotAgentExecutionService.executeChat(chatRequest);
          const fullResponse = response.content;

          // Simulate streaming with typewriter effect for better UX
          if (typewriterEnabled && fullResponse) {
            const characters = fullResponse.split('');
            for (let i = 0; i < characters.length; i++) {
              const char = characters[i];
              const delay = 1000 / typingSpeed; // milliseconds per character

              const typewriterChunk: ChatStreamChunk = {
                source: 'agent' as const,
                stream_id: request.stream_id,
                agent_id: request.agent_id,
                type: 'content',
                content: char,
                typewriter: {
                  type: 'character',
                  content: char,
                  position: i,
                  total_length: fullResponse.length,
                  delay,
                  is_code: false, // TODO: Add code detection if needed
                  is_markdown: false // TODO: Add markdown detection if needed
                },
                timestamp: Date.now()
              };

              socket.emit('chat:stream-chunk', typewriterChunk);

              // Add small delay for typewriter effect
              if (i < characters.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          } else {
            // Send all content at once if typewriter is disabled
            const streamChunk: ChatStreamChunk = {
              source: 'agent' as const,
              stream_id: request.stream_id,
              agent_id: request.agent_id,
              type: 'content',
              content: fullResponse,
              timestamp: Date.now()
            };
            socket.emit('chat:stream-chunk', streamChunk);
          }

          // Store assistant message
          await storeMessage(chatSession.id, 'assistant', fullResponse, {
            stream_id: request.stream_id,
            usage: response.usage
          });

          // Send completion
          socket.emit('chat:typing-stop', { source: 'agent', agentId: request.agent_id });
          socket.emit('chat:stream-complete', {
            content: fullResponse,
            agent_id: request.agent_id,
            session_id: chatSession.id, // Use the actual database session ID
            timestamp: new Date().toISOString(),
            source: 'agent',
            usage: response.usage
          });
        } catch (agentError) {
          console.error(`[AGENT SOCKET] Agent engine error:`, agentError);
          throw agentError;
        }

        console.log(`[AGENT SOCKET] Stream completed for user ${userId}, agent ${request.agent_id}`);

      } catch (error) {
        console.error(`[AGENT SOCKET] Stream error for user ${userId}, agent ${request.agent_id}:`, error);
        socket.emit('chat:typing-stop', { source: 'agent', agentId: request.agent_id });
        socket.emit('chat:stream-error', {
          stream_id: request.stream_id,
          agent_id: request.agent_id,
          error_code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown server error',
          timestamp: Date.now(),
          recoverable: true
        });
      }
    });

    // Handle agent stream stop
    socket.on('agent:stop-stream', (streamId: string) => {
      console.log(`[AGENT SOCKET] Stream stopped by user ${userId}:`, streamId);
      // TODO: Implement stream cancellation logic
      // For now, just stop typing indicator
      socket.emit('chat:typing-stop', { source: 'agent', agentId: 'unknown' });
    });

    // Handle agent room management
    socket.on('chat:join-room', (data: { userId: string, agentId?: string, source: string }) => {
      // Only allow users to join their own agent rooms
      if (data.userId === userId && data.source === 'agent' && data.agentId) {
        socketService.joinAgentRoom(socket, data.agentId, userId);
      } else {
        console.warn(`[AGENT SOCKET] User ${userId} attempted to join room for user ${data.userId}`);
      }
    });

    socket.on('chat:leave-room', (data: { userId: string, agentId?: string, source: string }) => {
      if (data.userId === userId && data.source === 'agent' && data.agentId) {
        socketService.leaveAgentRoom(socket, data.agentId, userId);
      } else {
        console.warn(`[AGENT SOCKET] User ${userId} attempted to leave room for user ${data.userId}`);
      }
    });
  });
}