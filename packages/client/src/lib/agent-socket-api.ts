import { generateId } from './utils';
import SocketClient from './socket-client';
import type { ChatRequest, ChatStreamChunk, ChatStreamError, ChatResponse, ChatTypingData } from '@starships/protocol';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  sessionId: string;
  agentId?: string;
  sending?: boolean;
  streaming?: boolean;
  streamId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface AgentRequest {
  agentId: string;
  message: string;
  sessionId?: string;
}

export const agentSocketAPI = {
  sendMessageStream: (
    agentId: string,
    request: { sessionId?: string; message: string },
    callbacks: {
      onChunk: (chunk: ChatStreamChunk, accumulatedContent: string) => void;
      onComplete: (message: Message) => void;
      onError: (error: string) => void;
      onTypingStart?: () => void;
      onTypingStop?: () => void;
    }
  ): { abort: () => void } => {
    const socketClient = SocketClient.getInstance();
    const socket = socketClient.getSocket();
    
    if (!socket || !socketClient.isConnected()) {
      callbacks.onError('Socket.IO connection required - please check your connection');
      return { abort: () => {} };
    }

    const streamId = generateId();
    let accumulatedContent = '';
    let isAborted = false;

    const socketRequest: ChatRequest = {
      source: 'agent',
      agentId: agentId,
      sessionId: request.sessionId,
      message: request.message,
      streamId: streamId,
      userId: 'client-user', // Overridden by server auth
      typewriterEnabled: true,
      typingSpeed: 75
    };


    const handleStreamChunk = (chunk: ChatStreamChunk) => {
      if (chunk.streamId === streamId && chunk.agentId === agentId && chunk.source === 'agent' && !isAborted) {
        if (chunk.typewriter?.type === 'character') {
          accumulatedContent += chunk.typewriter.content;
          callbacks.onChunk(chunk, accumulatedContent);
        } else if (chunk.content) {
          // Handle non-typewriter content
          accumulatedContent += chunk.content;
          callbacks.onChunk(chunk, accumulatedContent);
        }
      }
    };

    const handleStreamComplete = (chunk: ChatStreamChunk) => {
      if (chunk.streamId === streamId && chunk.agentId === agentId && chunk.source === 'agent' && chunk.type === 'complete' && !isAborted) {
        const finalMessage: Message = {
          id: generateId(),
          content: chunk.content,
          role: 'assistant',
          timestamp: new Date(chunk.timestamp).toISOString(),
          sessionId: 'session-' + streamId, // Generate session ID from stream ID
          agentId: chunk.agentId,
          streaming: false,
          usage: undefined // Usage not available in stream chunks
        };
        callbacks.onComplete(finalMessage);
        cleanup();
      }
    };

    const handleStreamError = (error: ChatStreamError) => {
      if (error.streamId === streamId && error.agentId === agentId && !isAborted) {
        callbacks.onError(error.message);
        cleanup();
      }
    };

    const handleTypingStart = (data: ChatTypingData) => {
      if (data.isTyping) {
        callbacks.onTypingStart?.();
      }
    };

    const handleTypingStop = (data: ChatTypingData) => {
      if (!data.isTyping) {
        callbacks.onTypingStop?.();
      }
    };

    const cleanup = () => {
      socket.off('session:stream-chunk', handleStreamChunk);
      socket.off('session:stream-complete', handleStreamComplete);
      socket.off('session:stream-error', handleStreamError);
      socket.off('session:typing-start', handleTypingStart);
      socket.off('session:typing-stop', handleTypingStop);
    };

    // Set up event listeners
    socket.on('session:stream-chunk', handleStreamChunk);
    socket.on('session:stream-complete', handleStreamComplete);
    socket.on('session:stream-error', handleStreamError);
    socket.on('session:typing-start', handleTypingStart);
    socket.on('session:typing-stop', handleTypingStop);

    // Join agent room for this session
    socketClient.joinAgentRoom(agentId, 'current-user'); // Will be overridden by server auth

    // Start the stream
    socket.emit('session:start-stream', socketRequest);

    return {
      abort: () => {
        isAborted = true;
        socket.emit('session:stop-stream', streamId);
        socketClient.leaveAgentRoom(agentId, 'current-user');
        cleanup();
      }
    };
  },

  // Utility method to join agent room
  joinAgentRoom: (agentId: string, userId: string) => {
    const socketClient = SocketClient.getInstance();
    socketClient.joinAgentRoom(agentId, userId);
  },

  // Utility method to leave agent room
  leaveAgentRoom: (agentId: string, userId: string) => {
    const socketClient = SocketClient.getInstance();
    socketClient.leaveAgentRoom(agentId, userId);
  }
};