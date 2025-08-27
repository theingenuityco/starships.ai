import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { SocketEvents, ChatRequest, ChatStreamChunk } from '@starships/protocol';
import { chatStream } from '@starships/agent-engine';
import { AgentService } from '../services/AgentService';
import { SocketIOService } from '../services/SocketIOService';
import getStore from '../store';

export function setupAgentHandlers(io: SocketIOServer<SocketEvents>) {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const socketService = SocketIOService.getInstance();

    // Handle agent stream start
    socket.on('chat:start-stream', async (request: ChatRequest) => {
      if (request.source !== 'agent' || !request.agent_id) return;
      console.log(`[AGENT SOCKET] Starting stream for user ${userId}, agent ${request.agent_id}:`, request.stream_id);

      try {
        // Validate request
        if (!request.message || !request.agent_id || !request.session_id) {
          socket.emit('agent:stream-error', {
            stream_id: request.stream_id,
            agent_id: request.agent_id,
            error_code: 'INVALID_REQUEST',
            message: 'Message, agent_id, and session_id are required',
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

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
        socket.emit('agent:stream-start', request.stream_id, request.agent_id);
        socket.emit('agent:typing-start', request.agent_id);

        // Track agent usage
        try {
          await AgentService.trackUsage(request.agent_id);
        } catch (error) {
          console.warn(`[AGENT SOCKET] Failed to track usage for agent ${request.agent_id}:`, error);
          // Continue with streaming - don't fail on analytics
        }

        // Convert to ChatRequest for agent engine
        const chatRequest: ChatRequest = {
          source: 'agent',
          agent_id: request.agent_id,
          user_id: userId,
          message: request.message,
          stream: true // Enable true streaming
        };

        // Get memory store
        const store = getStore();

        // Use true streaming from agent engine with typewriter effect
        let fullResponse = '';
        const typingSpeed = request.typing_speed || 75; // chars per second
        const typewriterEnabled = request.typewriter_enabled !== false;
        
        try {
          for await (const chunk of chatStream(chatRequest, store)) {
            fullResponse += chunk;
            
            // Create typewriter chunks if enabled
            if (typewriterEnabled) {
              const characters = chunk.split('');
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
                    position: fullResponse.length - chunk.length + i,
                    total_length: fullResponse.length,
                    delay,
                    is_code: false, // TODO: Add code detection if needed
                    is_markdown: false // TODO: Add markdown detection if needed
                  },
                  timestamp: Date.now()
                };

                socket.emit('agent:stream-chunk', typewriterChunk);

                // Add small delay for typewriter effect
                if (i < characters.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
            } else {
              // Send chunk without typewriter effect
              const streamChunk: ChatStreamChunk = {
                source: 'agent' as const,
                stream_id: request.stream_id,
                agent_id: request.agent_id,
                type: 'content',
                content: chunk,
                timestamp: Date.now()
              };
              socket.emit('agent:stream-chunk', streamChunk);
            }
          }

          // Send completion
          socket.emit('agent:typing-stop', request.agent_id);
          socket.emit('agent:stream-complete', {
            content: fullResponse,
            agent_id: request.agent_id,
            session_id: request.session_id,
            timestamp: new Date().toISOString(),
            usage: undefined // Usage tracking will be added later
          });
        } catch (streamError) {
          console.error(`[AGENT SOCKET] Streaming error:`, streamError);
          throw streamError;
        }

        console.log(`[AGENT SOCKET] Stream completed for user ${userId}, agent ${request.agent_id}`);

      } catch (error) {
        console.error(`[AGENT SOCKET] Stream error for user ${userId}, agent ${request.agent_id}:`, error);
        socket.emit('agent:typing-stop', request.agent_id);
        socket.emit('agent:stream-error', {
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
      socket.emit('agent:typing-stop', 'unknown');
    });

    // Handle agent room management
    socket.on('agent:join-room', (requestedUserId: string, agentId: string) => {
      // Only allow users to join their own agent rooms
      if (requestedUserId === userId) {
        socketService.joinAgentRoom(socket, agentId, userId);
      } else {
        console.warn(`[AGENT SOCKET] User ${userId} attempted to join room for user ${requestedUserId}`);
      }
    });

    socket.on('agent:leave-room', (requestedUserId: string, agentId: string) => {
      if (requestedUserId === userId) {
        socketService.leaveAgentRoom(socket, agentId, userId);
      } else {
        console.warn(`[AGENT SOCKET] User ${userId} attempted to leave room for user ${requestedUserId}`);
      }
    });
  });
}