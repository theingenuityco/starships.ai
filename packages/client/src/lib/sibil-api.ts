import api from './api';
import { generateId } from './utils';
import SocketClient from './socket-client';
import type { ChatRequest, ChatStreamChunk, ChatStreamError } from '@starships/protocol';

export interface SibilMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  sessionId: string;
  provider?: 'openai' | 'anthropic';
  model?: string;
  structured_content?: ContentBlock[];
  sending?: boolean;
  streaming?: boolean;
  stream_id?: string;
}

// Legacy interface - now mapped to unified ChatRequest
export interface SibilRequest {
  provider: 'openai' | 'anthropic';
  model?: string;
  message: string;
  sessionId?: string;
  starshipId?: string;
}

interface ContentBlock {
  type: 'text' | 'markdown' | 'code' | 'table';
  content: string;
  metadata?: {
    language?: string;
    headers?: string[];
  };
}

function toChatRequest(req: SibilRequest): ChatRequest {
  return {
    source: 'sibil' as const,
    provider: req.provider,
    model: req.model,
    message: req.message,
    user_id: 'client-user', // This will be overridden by server auth
    session_id: req.sessionId,
    starship_id: req.starshipId,
  };
}

export const sibilAPI = {
  // Non-streaming method - uses ChatRequest
  sendMessage: async (request: SibilRequest): Promise<SibilMessage> => {
    const chatRequest = toChatRequest(request);
    const response = await api.post('/api/sibil/chat', chatRequest);
    const backendResponse = response.data;

    return {
      id: generateId(),
      content: backendResponse.content,
      role: 'assistant',
      timestamp: new Date().toISOString(),
      sessionId: request.sessionId || 'sibil-session',
      provider: backendResponse.provider,
      model: backendResponse.model,
      structured_content: backendResponse.structured_content,
    };
  },

  // Socket.IO Streaming method - uses unified ChatRequest
  sendMessageStream: (
    request: SibilRequest,
    callbacks: {
      onChunk: (chunk: ChatStreamChunk, accumulatedContent: string) => void;
      onComplete: (message: SibilMessage) => void;
      onError: (error: string) => void;
      onTypingStart?: () => void;
      onTypingStop?: () => void;
    }
  ): { abort: () => void } => {
    const socketClient = SocketClient.getInstance();
    const socket = socketClient.getSocket();
    
    if (!socket || !socketClient.isConnected()) {
      callbacks.onError('Socket.IO not connected');
      return { abort: () => {} };
    }

    const streamId = generateId();
    let accumulatedContent = '';
    let isAborted = false;

    const socketRequest: ChatRequest = {
      source: 'sibil' as const,
      provider: request.provider,
      model: request.model,
      message: request.message,
      user_id: 'client-user', // This will be overridden by server auth
      session_id: request.sessionId,
      starship_id: request.starshipId,
      stream_id: streamId,
      typewriter_enabled: true,
      typing_speed: 75,
    };

    const handleStreamStart = (data: { streamId: string; source: string }) => {
      if (data.streamId === streamId && data.source === 'sibil') {
        console.log('[SIBIL API] Stream started:', streamId);
      }
    };

    const handleStreamChunk = (chunk: ChatStreamChunk) => {
      if (chunk.stream_id === streamId && chunk.source === 'sibil' && !isAborted) {
        if (chunk.typewriter?.type === 'character') {
          accumulatedContent += chunk.typewriter.content;
          callbacks.onChunk(chunk, accumulatedContent);
        }
      }
    };

    const handleStreamComplete = (response: any) => {
      if (response.source === 'sibil' && !isAborted) {
        const finalMessage: SibilMessage = {
          id: generateId(),
          content: response.content,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          sessionId: response.session_id, // Only use server-provided session ID
          provider: response.provider,
          model: response.model,
          structured_content: response.structured_content,
          streaming: false,
        };
        callbacks.onComplete(finalMessage);
        cleanup();
      }
    };

    const handleStreamError = (error: ChatStreamError) => {
      if (error.stream_id === streamId && error.source === 'sibil' && !isAborted) {
        callbacks.onError(error.message);
        cleanup();
      }
    };

    const handleTypingStart = (data: { source: string }) => {
      if (data.source === 'sibil') {
        callbacks.onTypingStart?.();
      }
    };

    const handleTypingStop = (data: { source: string }) => {
      if (data.source === 'sibil') {
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

    socket.on('chat:stream-start', handleStreamStart);
    socket.on('chat:stream-chunk', handleStreamChunk);
    socket.on('chat:stream-complete', handleStreamComplete);
    socket.on('chat:stream-error', handleStreamError);
    socket.on('chat:typing-start', handleTypingStart);
    socket.on('chat:typing-stop', handleTypingStop);

    socket.emit('chat:start-stream', socketRequest);

    return {
      abort: () => {
        isAborted = true;
        socket.emit('chat:stop-stream', streamId);
        cleanup();
      }
    };
  }
};