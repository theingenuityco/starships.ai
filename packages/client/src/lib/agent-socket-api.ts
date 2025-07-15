import { generateId } from './utils';
import SocketClient from './socket-client';
import type { AgentSocketRequest, AgentSocketStreamChunk, AgentStreamError, AgentChatResponse } from '@starships/protocol';

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
      onChunk: (chunk: AgentSocketStreamChunk, accumulatedContent: string) => void;
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

    const socketRequest: AgentSocketRequest = {
      agent_id: agentId,
      session_id: request.sessionId,
      message: request.message,
      stream_id: streamId,
      user_id: 'client-user', // Overridden by server auth
      typewriter_enabled: true,
      typing_speed: 75
    };

    const handleStreamStart = (receivedStreamId: string, receivedAgentId: string) => {
      if (receivedStreamId === streamId && receivedAgentId === agentId) {
        console.log('[AGENT API] Stream started:', streamId, 'for agent:', agentId);
      }
    };

    const handleStreamChunk = (chunk: AgentSocketStreamChunk) => {
      if (chunk.stream_id === streamId && chunk.agent_id === agentId && !isAborted) {
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

    const handleStreamComplete = (response: AgentChatResponse) => {
      if (response.agent_id === agentId && !isAborted) {
        const finalMessage: Message = {
          id: generateId(),
          content: response.content,
          role: 'assistant',
          timestamp: response.timestamp,
          sessionId: response.session_id,
          agentId: response.agent_id,
          streaming: false,
          usage: response.usage
        };
        callbacks.onComplete(finalMessage);
        cleanup();
      }
    };

    const handleStreamError = (error: AgentStreamError) => {
      if (error.stream_id === streamId && error.agent_id === agentId && !isAborted) {
        callbacks.onError(error.message);
        cleanup();
      }
    };

    const handleTypingStart = (receivedAgentId: string) => {
      if (receivedAgentId === agentId) {
        callbacks.onTypingStart?.();
      }
    };

    const handleTypingStop = (receivedAgentId: string) => {
      if (receivedAgentId === agentId) {
        callbacks.onTypingStop?.();
      }
    };

    const cleanup = () => {
      socket.off('agent:stream-start', handleStreamStart);
      socket.off('agent:stream-chunk', handleStreamChunk);
      socket.off('agent:stream-complete', handleStreamComplete);
      socket.off('agent:stream-error', handleStreamError);
      socket.off('agent:typing-start', handleTypingStart);
      socket.off('agent:typing-stop', handleTypingStop);
    };

    // Set up event listeners
    socket.on('agent:stream-start', handleStreamStart);
    socket.on('agent:stream-chunk', handleStreamChunk);
    socket.on('agent:stream-complete', handleStreamComplete);
    socket.on('agent:stream-error', handleStreamError);
    socket.on('agent:typing-start', handleTypingStart);
    socket.on('agent:typing-stop', handleTypingStop);

    // Join agent room for this session
    socketClient.joinAgentRoom(agentId, 'current-user'); // Will be overridden by server auth

    // Start the stream
    socket.emit('agent:start-stream', socketRequest);

    return {
      abort: () => {
        isAborted = true;
        socket.emit('agent:stop-stream', streamId);
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