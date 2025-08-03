import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { SocketIOEvents, SibilSocketRequest, SibilSocketStreamChunk } from '@starships/protocol';
import { SibilService } from '../services/SibilService';
import { SocketIOService } from '../services/SocketIOService';

export function setupSibilHandlers(io: SocketIOServer<SocketIOEvents>) {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const socketService = SocketIOService.getInstance();

    // Handle stream start
    socket.on('sibil:start-stream', async (request: SibilSocketRequest) => {
      console.log(`[SIBIL SOCKET] Starting stream for user ${userId}:`, request.stream_id);

      try {
        // Validate request
        if (!request.message || !request.provider) {
          socket.emit('sibil:stream-error', {
            stream_id: request.stream_id,
            error_code: 'INVALID_REQUEST',
            message: 'Message and provider are required',
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Send stream start confirmation
        socket.emit('sibil:stream-start', request.stream_id);
        socket.emit('sibil:typing-start');

        // Convert to standard SibilRequest
        const sibilRequest = {
          provider: request.provider,
          model: request.model,
          message: request.message,
          user_id: userId,
          session_id: request.session_id,
          starship_id: request.starship_id
        };

        // Start streaming with typewriter effect
        let accumulatedContent = '';
        let chunkCount = 0;
        const typingSpeed = request.typing_speed || 75; // chars per second
        const typewriterEnabled = request.typewriter_enabled !== false;

        for await (const chunk of SibilService.chatStream(sibilRequest)) {
          chunkCount++;

          if (chunk.type === 'content' && chunk.content) {
            accumulatedContent += chunk.content;

            // Create typewriter chunks if enabled
            if (typewriterEnabled) {
              const characters = chunk.content.split('');
              for (let i = 0; i < characters.length; i++) {
                const char = characters[i];
                const delay = 1000 / typingSpeed; // milliseconds per character

                const typewriterChunk: SibilSocketStreamChunk = {
                  ...chunk,
                  stream_id: request.stream_id,
                  content: char,
                  typewriter: {
                    type: 'character',
                    content: char,
                    position: accumulatedContent.length - chunk.content.length + i,
                    total_length: accumulatedContent.length,
                    delay,
                    is_code: chunk.structured_content?.some(block => block.type === 'code') || false,
                    is_markdown: chunk.structured_content?.some(block => block.type === 'markdown') || false
                  },
                  typing_speed: typingSpeed,
                  timestamp: Date.now()
                };

                socket.emit('sibil:stream-chunk', typewriterChunk);

                // Add small delay for typewriter effect
                if (i < characters.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
            } else {
              // Send chunk without typewriter effect
              const socketChunk: SibilSocketStreamChunk = {
                ...chunk,
                stream_id: request.stream_id,
                timestamp: Date.now()
              };
              socket.emit('sibil:stream-chunk', socketChunk);
            }
          } else if (chunk.type === 'complete') {
            // Send completion
            socket.emit('sibil:typing-stop');
            socket.emit('sibil:stream-complete', {
              content: chunk.content || accumulatedContent,
              structured_content: chunk.structured_content,
              provider: chunk.provider!,
              model: chunk.model!,
              usage: chunk.usage
            });
            break;
          } else if (chunk.type === 'error') {
            socket.emit('sibil:typing-stop');
            socket.emit('sibil:stream-error', {
              stream_id: request.stream_id,
              error_code: 'STREAMING_ERROR',
              message: chunk.error || 'Unknown streaming error',
              timestamp: Date.now(),
              recoverable: true
            });
            break;
          }
        }

        console.log(`[SIBIL SOCKET] Stream completed for ${userId}: ${chunkCount} chunks`);

      } catch (error) {
        console.error(`[SIBIL SOCKET] Stream error for user ${userId}:`, error);
        socket.emit('sibil:typing-stop');
        socket.emit('sibil:stream-error', {
          stream_id: request.stream_id,
          error_code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown server error',
          timestamp: Date.now(),
          recoverable: true
        });
      }
    });

    // Handle stream stop
    socket.on('sibil:stop-stream', (streamId: string) => {
      console.log(`[SIBIL SOCKET] Stream stopped by user ${userId}:`, streamId);
      socket.emit('sibil:typing-stop');
      // TODO: Implement stream cancellation logic
    });

    // Handle room management
    socket.on('sibil:join-room', (requestedUserId: string) => {
      // Only allow users to join their own room
      if (requestedUserId === userId) {
        const userRoom = socketService.getUserRoom(userId);
        socket.join(userRoom);
        console.log(`[SIBIL SOCKET] User ${userId} joined room: ${userRoom}`);
      }
    });

    socket.on('sibil:leave-room', (requestedUserId: string) => {
      if (requestedUserId === userId) {
        const userRoom = socketService.getUserRoom(userId);
        socket.leave(userRoom);
        console.log(`[SIBIL SOCKET] User ${userId} left room: ${userRoom}`);
      }
    });
  });
}