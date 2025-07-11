import api from './api';
import { generateId } from './utils';
import SocketClient from './socket-client';
import type { SibilSocketRequest, SibilSocketStreamChunk, SibilStreamError } from '@starships/protocol';

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

export interface SibilRequest {
  provider: 'openai' | 'anthropic';
  model?: string;
  message: string;
  sessionId?: string;
}

interface SibilBackendRequest {
  provider: 'openai' | 'anthropic';
  model?: string;
  message: string;
  session_id?: string;
}

interface SibilBackendResponse {
  content: string;
  structured_content?: ContentBlock[];
  provider: 'openai' | 'anthropic';
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface ContentBlock {
  type: 'text' | 'markdown' | 'code' | 'table';
  content: string;
  metadata?: {
    language?: string;
    headers?: string[];
  };
}

interface SibilStreamChunk {
  type: 'content' | 'structured' | 'complete' | 'error' | 'connected';
  content?: string;
  structured_content?: ContentBlock[];
  provider?: 'openai' | 'anthropic';
  model?: string;
  error?: string;
  chunk_id?: string;
  is_final?: boolean;
  stream_id?: string;
}

function toSibilBackendRequest(req: SibilRequest): SibilBackendRequest {
  return {
    provider: req.provider,
    model: req.model,
    message: req.message,
    session_id: req.sessionId,
  };
}

export const sibilAPI = {
  // Existing non-streaming method
  sendMessage: async (request: SibilRequest): Promise<SibilMessage> => {
    const backendRequest = toSibilBackendRequest(request);
    const response = await api.post('/api/sibil/chat', backendRequest);
    const backendResponse = response.data as SibilBackendResponse;

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

  // Socket.IO Streaming method
  sendMessageStream: (
    request: SibilRequest,
    callbacks: {
      onChunk: (chunk: SibilSocketStreamChunk, accumulatedContent: string) => void;
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

    const socketRequest: SibilSocketRequest = {
      provider: request.provider,
      model: request.model,
      message: request.message,
      user_id: 'client-user', // This will be overridden by server auth
      session_id: request.sessionId,
      stream_id: streamId,
      typewriter_enabled: true,
      typing_speed: 75
    };

    const handleStreamStart = (receivedStreamId: string) => {
      if (receivedStreamId === streamId) {
        console.log('[SIBIL API] Stream started:', streamId);
      }
    };

    const handleStreamChunk = (chunk: SibilSocketStreamChunk) => {
      if (chunk.stream_id === streamId && !isAborted) {
        if (chunk.typewriter?.type === 'character') {
          accumulatedContent += chunk.typewriter.content;
          callbacks.onChunk(chunk, accumulatedContent);
        }
      }
    };

    const handleStreamComplete = (response: SibilBackendResponse) => {
      if (!isAborted) {
        const finalMessage: SibilMessage = {
          id: generateId(),
          content: response.content,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          sessionId: request.sessionId || 'sibil-session',
          provider: response.provider,
          model: response.model,
          structured_content: response.structured_content,
          streaming: false,
        };
        callbacks.onComplete(finalMessage);
        cleanup();
      }
    };

    const handleStreamError = (error: SibilStreamError) => {
      if (error.stream_id === streamId && !isAborted) {
        callbacks.onError(error.message);
        cleanup();
      }
    };

    const handleTypingStart = () => {
      callbacks.onTypingStart?.();
    };

    const handleTypingStop = () => {
      callbacks.onTypingStop?.();
    };

    const cleanup = () => {
      socket.off('sibil:stream-start', handleStreamStart);
      socket.off('sibil:stream-chunk', handleStreamChunk);
      socket.off('sibil:stream-complete', handleStreamComplete);
      socket.off('sibil:stream-error', handleStreamError);
      socket.off('sibil:typing-start', handleTypingStart);
      socket.off('sibil:typing-stop', handleTypingStop);
    };

    socket.on('sibil:stream-start', handleStreamStart);
    socket.on('sibil:stream-chunk', handleStreamChunk);
    socket.on('sibil:stream-complete', handleStreamComplete);
    socket.on('sibil:stream-error', handleStreamError);
    socket.on('sibil:typing-start', handleTypingStart);
    socket.on('sibil:typing-stop', handleTypingStop);

    socket.emit('sibil:start-stream', socketRequest);

    return {
      abort: () => {
        isAborted = true;
        socket.emit('sibil:stop-stream', streamId);
        cleanup();
      }
    };
  }
};