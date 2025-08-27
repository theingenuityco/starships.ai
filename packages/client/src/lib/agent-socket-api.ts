import { generateId } from './utils';
import SocketClient from './socket-client';
import type { ChatSocketRequest, ChatSocketStreamChunk, ChatSocketStreamError, ChatSocketResponse } from '@starships/protocol';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  sessionId: string;
  agentId?: string;
  sending?: boolean;
  streaming?: boolean;
  stream_id?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface AgentRequest {
  agentId: string;
  message: string;
  sessionId: string;
}

export const agentSocketAPI = {
  sendMessageStream: (
    agentId: string,
    request: { sessionId: string; message: string },
    callbacks: {
      onChunk: (chunk: ChatSocketStreamChunk, accumulatedContent: string) => void;
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

    const socketRequest: ChatSocketRequest = {
      source: 'agent',
      agent_id: agentId,
      session_id: request.sessionId,
      message: request.message,
      stream_id: streamId,
      user_id: 'client-user', // Overridden by server auth
      typewriter_enabled: true,
      typing_speed: 75
    };

    const handleStreamStart = (data: { streamId: string; source: 'agent' | 'sibil'; agentId?: string }) => {
      if (data.streamId === streamId && data.agentId === agentId && data.source === 'agent') {
        console.log('[AGENT API] Stream started:', streamId, 'for agent:', agentId);
      }
    };

    const handleStreamChunk = (chunk: ChatSocketStreamChunk) => {
      if (chunk.stream_id === streamId && chunk.agent_id === agentId && chunk.source === 'agent' && !isAborted) {
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

    const handleStreamComplete = (response: ChatSocketResponse) => {
      if (response.agent_id === agentId && response.source === 'agent' && !isAborted) {
        const finalMessage: Message = {
          id: generateId(),
          content: response.content,
          role: 'assistant',
          timestamp: response.timestamp,
          sessionId: response.session_id || '',
          agentId: response.agent_id,
          streaming: false,
          usage: response.usage
        };
        callbacks.onComplete(finalMessage);
        cleanup();
      }
    };

    const handleStreamError = (error: ChatSocketStreamError) => {
      if (error.stream_id === streamId && error.agent_id === agentId && error.source === 'agent' && !isAborted) {
        callbacks.onError(error.message);
        cleanup();
      }
    };

    const handleTypingStart = (data: { source: 'agent' | 'sibil'; agentId?: string }) => {
      if (data.agentId === agentId && data.source === 'agent') {
        callbacks.onTypingStart?.();
      }
    };

    const handleTypingStop = (data: { source: 'agent' | 'sibil'; agentId?: string }) => {
      if (data.agentId === agentId && data.source === 'agent') {
        callbacks.onTypingStop?.();
      }
    };

    const cleanup = () => {
      socket.off('chat:stream-start', handleStreamStart);
      socket.off('chat:stream-chunk', handleStreamChunk);
      socket.off('chat:stream-complete', handleStreamComplete);
      socket.off('chat:stream-error', handleStreamError);
      socket.off('chat:typing-start', handleTypingStart);
      socket.off('chat:typing-stop', handleTypingStop);
    };

    // Set up event listeners
    socket.on('chat:stream-start', handleStreamStart);
    socket.on('chat:stream-chunk', handleStreamChunk);
    socket.on('chat:stream-complete', handleStreamComplete);
    socket.on('chat:stream-error', handleStreamError);
    socket.on('chat:typing-start', handleTypingStart);
    socket.on('chat:typing-stop', handleTypingStop);

    // Join agent room for this session
    socketClient.joinAgentRoom(agentId, 'current-user'); // Will be overridden by server auth

    // Start the stream
    socket.emit('chat:start-stream', socketRequest);

    return {
      abort: () => {
        isAborted = true;
        socket.emit('chat:stop-stream', streamId);
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