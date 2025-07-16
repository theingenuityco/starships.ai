# Socket.IO Implementation Steps

## Overview

This document provides a comprehensive step-by-step guide for implementing Socket.IO integration in the Starships.ai platform, based on the successful implementation documented in [`agent-chat-socket-io-implementation-plan.md`](agent-chat-socket-io-implementation-plan.md).

## Prerequisites and Setup

### 1. Required Dependencies

Ensure the following packages are installed:

```bash
# Server dependencies
npm install socket.io @types/socket.io

# Client dependencies  
npm install socket.io-client @types/socket.io-client

# JWT handling
npm install jose
```

### 2. Environment Configuration

Add the following environment variables:

```env
# Server Configuration
SOCKET_IO_PORT=4000
SOCKET_IO_CORS_ORIGIN=http://localhost:3000

# Authentication
KINDE_ISSUER_URL=https://your-subdomain.kinde.com
JWT_SECRET=your-jwt-secret
```

## Server-side Socket.IO Configuration

### 1. Create Socket.IO Server

**File**: `packages/server/src/socket/index.ts`

```typescript
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { setupAuthMiddleware } from './middleware/auth';
import { setupAgentHandlers } from './handlers/agentHandlers';
import { setupSibilHandlers } from './handlers/sibilHandlers';

export function initializeSocketIO(httpServer: any) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.SOCKET_IO_CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST']
    }
  });

  // Setup authentication middleware
  setupAuthMiddleware(io);

  // Setup event handlers
  setupAgentHandlers(io);
  setupSibilHandlers(io);

  return io;
}
```

### 2. Authentication Middleware

**File**: `packages/server/src/socket/middleware/auth.ts`

```typescript
import { Socket } from 'socket.io';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UserService } from '../../services/UserService';

const kindeIssuerUrl = process.env.KINDE_ISSUER_URL;
const JWKS = createRemoteJWKSet(new URL(`${kindeIssuerUrl}/.well-known/jwks`));

export function setupAuthMiddleware(io: any) {
  io.use(async (socket: Socket, next: any) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: kindeIssuerUrl
      });

      // Sync user with database
      const user = await UserService.syncUser({
        kindeId: payload.sub as string,
        email: payload.email as string,
        name: payload.name as string
      });

      socket.data.userId = user.id;
      socket.data.user = user;
      
      next();
    } catch (error) {
      console.error('[SOCKET AUTH] Authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });
}
```

### 3. Agent Event Handlers

**File**: `packages/server/src/socket/handlers/agentHandlers.ts`

```typescript
import { Socket } from 'socket.io';
import { AgentService } from '../../services/AgentService';
import { SocketIOService } from '../../services/SocketIOService';
import { chat } from '@starships/agent-engine';

export function setupAgentHandlers(io: any) {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const socketService = SocketIOService.getInstance();

    // Join agent room
    socket.on('agent:join-room', (userId: string, agentId: string) => {
      socketService.joinAgentRoom(socket, agentId, userId);
    });

    // Leave agent room
    socket.on('agent:leave-room', (userId: string, agentId: string) => {
      socketService.leaveAgentRoom(socket, agentId, userId);
    });

    // Start agent stream
    socket.on('agent:start-stream', async (request: any) => {
      const { agent_id, session_id, message, stream_id } = request;
      
      try {
        // Get agent configuration
        const agent = await AgentService.getAgentById(agent_id);
        if (!agent) {
          socket.emit('agent:stream-error', {
            stream_id,
            error_code: 'AGENT_NOT_FOUND',
            message: 'Agent not found',
            timestamp: Date.now(),
            recoverable: false
          });
          return;
        }

        // Join agent room
        const room = socketService.getAgentRoom(agent_id, userId);
        socket.join(room);

        // Emit stream start
        socket.emit('agent:stream-start', stream_id, agent_id);
        socket.emit('agent:typing-start', agent_id);

        // Process chat with streaming
        const response = await chat({
          agentId: agent_id,
          userId,
          channelId: session_id,
          message,
          onChunk: (chunk: string) => {
            // Apply typewriter effect
            const typewriterChunk = {
              stream_id,
              agent_id,
              type: 'content',
              content: chunk,
              typewriter: {
                type: 'character',
                content: chunk,
                position: 0,
                delay: 75 // 75ms delay for typewriter effect
              },
              timestamp: Date.now()
            };
            
            socket.emit('agent:stream-chunk', typewriterChunk);
          }
        });

        // Track usage
        await AgentService.trackUsage(agent_id, userId);

        // Emit completion
        socket.emit('agent:typing-stop', agent_id);
        socket.emit('agent:stream-complete', {
          content: response.reply,
          agent_id,
          session_id,
          timestamp: new Date().toISOString(),
          usage: response.usage
        });

      } catch (error) {
        console.error('[AGENT SOCKET] Stream error:', error);
        socket.emit('agent:stream-error', {
          stream_id,
          agent_id,
          error_code: 'SERVER_ERROR',
          message: error.message,
          timestamp: Date.now(),
          recoverable: true
        });
      }
    });

    // Stop agent stream
    socket.on('agent:stop-stream', (streamId: string) => {
      // Handle stream cancellation
      console.log(`[AGENT SOCKET] Stream stopped: ${streamId}`);
    });
  });
}
```

## Client-side Socket.IO Integration

### 1. Socket Client Service

**File**: `packages/client/src/lib/socket-client.ts`

```typescript
import { io, Socket } from 'socket.io-client';

class SocketClient {
  private static instance: SocketClient;
  private socket: Socket | null = null;
  private isConnected = false;

  static getInstance(): SocketClient {
    if (!SocketClient.instance) {
      SocketClient.instance = new SocketClient();
    }
    return SocketClient.instance;
  }

  async connect(token: string, userId: string): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    return new Promise((resolve, reject) => {
      this.socket!.on('connect', () => {
        this.isConnected = true;
        console.log('[SOCKET] Connected successfully');
        resolve();
      });

      this.socket!.on('connect_error', (error) => {
        console.error('[SOCKET] Connection error:', error);
        reject(error);
      });

      this.socket!.on('disconnect', () => {
        this.isConnected = false;
        console.log('[SOCKET] Disconnected');
      });
    });
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected;
  }

  // Agent room management
  joinAgentRoom(agentId: string, userId: string) {
    this.socket?.emit('agent:join-room', userId, agentId);
  }

  leaveAgentRoom(agentId: string, userId: string) {
    this.socket?.emit('agent:leave-room', userId, agentId);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
}

export default SocketClient;
```

### 2. Agent Socket API

**File**: `packages/client/src/lib/agent-socket-api.ts`

```typescript
import SocketClient from './socket-client';
import { generateId } from './utils';

export const agentSocketAPI = {
  sendMessageStream: (
    agentId: string,
    request: { sessionId: string; message: string },
    callbacks: {
      onChunk: (chunk: any, accumulatedContent: string) => void;
      onComplete: (message: any) => void;
      onError: (error: string) => void;
      onTypingStart?: () => void;
      onTypingStop?: () => void;
    }
  ) => {
    const socketClient = SocketClient.getInstance();
    const socket = socketClient.getSocket();
    
    if (!socket || !socketClient.isSocketConnected()) {
      callbacks.onError('Socket.IO connection required - please check your connection');
      return { abort: () => {} };
    }

    const streamId = generateId();
    let accumulatedContent = '';
    let isAborted = false;

    const socketRequest = {
      agent_id: agentId,
      session_id: request.sessionId,
      message: request.message,
      stream_id: streamId,
      user_id: 'client-user', // Overridden by server auth
      typewriter_enabled: true,
      typing_speed: 75
    };

    // Event handlers
    const handleStreamStart = (responseStreamId: string, responseAgentId: string) => {
      if (responseStreamId === streamId) {
        console.log(`[AGENT SOCKET] Stream started: ${responseStreamId}`);
      }
    };

    const handleStreamChunk = (chunk: any) => {
      if (chunk.stream_id === streamId && !isAborted) {
        if (chunk.typewriter?.type === 'character') {
          accumulatedContent += chunk.typewriter.content;
          callbacks.onChunk(chunk, accumulatedContent);
        }
      }
    };

    const handleStreamComplete = (response: any) => {
      if (response.agent_id === agentId && !isAborted) {
        callbacks.onComplete(response);
        cleanup();
      }
    };

    const handleStreamError = (error: any) => {
      if (error.stream_id === streamId && !isAborted) {
        callbacks.onError(error.message);
        cleanup();
      }
    };

    const handleTypingStart = (responseAgentId: string) => {
      if (responseAgentId === agentId) {
        callbacks.onTypingStart?.();
      }
    };

    const handleTypingStop = (responseAgentId: string) => {
      if (responseAgentId === agentId) {
        callbacks.onTypingStop?.();
      }
    };

    // Register event listeners
    socket.on('agent:stream-start', handleStreamStart);
    socket.on('agent:stream-chunk', handleStreamChunk);
    socket.on('agent:stream-complete', handleStreamComplete);
    socket.on('agent:stream-error', handleStreamError);
    socket.on('agent:typing-start', handleTypingStart);
    socket.on('agent:typing-stop', handleTypingStop);

    // Cleanup function
    const cleanup = () => {
      socket.off('agent:stream-start', handleStreamStart);
      socket.off('agent:stream-chunk', handleStreamChunk);
      socket.off('agent:stream-complete', handleStreamComplete);
      socket.off('agent:stream-error', handleStreamError);
      socket.off('agent:typing-start', handleTypingStart);
      socket.off('agent:typing-stop', handleTypingStop);
    };

    // Start the stream
    socket.emit('agent:start-stream', socketRequest);

    // Return abort function
    return {
      abort: () => {
        isAborted = true;
        socket.emit('agent:stop-stream', streamId);
        cleanup();
      }
    };
  }
};
```

## Authentication Setup for Socket.IO

### 1. Token Provider Configuration

**File**: `packages/client/src/providers/auth-provider.tsx`

```typescript
import { useEffect } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-nextjs';
import { setTokenProvider } from '@/lib/api';
import SocketClient from '@/lib/socket-client';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isAuthenticated, isLoading, user } = useKindeAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Set token provider for API calls
      setTokenProvider(async () => {
        try {
          const token = await getToken();
          return token;
        } catch (error) {
          console.error('[AUTH] Failed to get token:', error);
          return null;
        }
      });

      // Connect Socket.IO with authentication
      const connectSocket = async () => {
        try {
          const token = await getToken();
          if (token && user) {
            await SocketClient.getInstance().connect(token, user.id);
          }
        } catch (error) {
          console.error('[SOCKET] Failed to connect:', error);
        }
      };

      connectSocket();
    }
  }, [isLoading, isAuthenticated, getToken, user]);

  return <>{children}</>;
}
```

## Real-time Event Handling

### 1. Socket Connection Hook

**File**: `packages/client/src/hooks/useSocketConnection.ts`

```typescript
import { useEffect, useState } from 'react';
import SocketClient from '@/lib/socket-client';

export function useSocketConnection() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const socketClient = SocketClient.getInstance();
    const socket = socketClient.getSocket();

    if (!socket) return;

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleError = (error: Error) => {
      setConnectionError(error.message);
      setIsConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleError);

    // Check initial connection state
    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
    };
  }, []);

  return { isConnected, connectionError };
}
```

### 2. Typewriter Effect Hook

**File**: `packages/client/src/hooks/useTypewriter.ts`

```typescript
import { useState, useCallback } from 'react';

interface TypewriterState {
  content: string;
  isTyping: boolean;
  isComplete: boolean;
}

export function useTypewriter(options: { onComplete?: () => void } = {}) {
  const [state, setState] = useState<TypewriterState>({
    content: '',
    isTyping: false,
    isComplete: false
  });

  const addChunk = useCallback((chunk: any) => {
    setState(prev => ({
      ...prev,
      content: prev.content + (chunk.content || ''),
      isTyping: true,
      isComplete: false
    }));
  }, []);

  const complete = useCallback(() => {
    setState(prev => ({
      ...prev,
      isTyping: false,
      isComplete: true
    }));
    options.onComplete?.();
  }, [options]);

  const reset = useCallback(() => {
    setState({
      content: '',
      isTyping: false,
      isComplete: false
    });
  }, []);

  return {
    content: state.content,
    isTyping: state.isTyping,
    isComplete: state.isComplete,
    addChunk,
    complete,
    reset
  };
}
```

## Testing and Debugging Steps

### 1. Connection Testing

```typescript
// Test Socket.IO connection
const testConnection = async () => {
  const socketClient = SocketClient.getInstance();
  const token = await getToken();
  
  try {
    await socketClient.connect(token, userId);
    console.log('✅ Socket.IO connection successful');
  } catch (error) {
    console.error('❌ Socket.IO connection failed:', error);
  }
};
```

### 2. Event Flow Testing

```typescript
// Test agent streaming
const testAgentStream = () => {
  const { abort } = agentSocketAPI.sendMessageStream(
    'test-agent-id',
    { sessionId: 'test-session', message: 'Hello' },
    {
      onChunk: (chunk, accumulated) => {
        console.log('📨 Chunk received:', chunk);
      },
      onComplete: (response) => {
        console.log('✅ Stream complete:', response);
      },
      onError: (error) => {
        console.error('❌ Stream error:', error);
      }
    }
  );
};
```

### 3. Debug Logging

Enable debug logging in development:

```typescript
// Client-side debug logging
localStorage.debug = 'socket.io-client:*';

// Server-side debug logging
process.env.DEBUG = 'socket.io:*';
```

## Integration with Existing HTTP REST API

### 1. Dual API Support

The Socket.IO implementation works alongside the existing HTTP REST API:

- **Socket.IO**: Used for real-time chat, streaming, and live features
- **HTTP REST**: Used for CRUD operations, simple requests, and stateless interactions

### 2. Shared Authentication

Both APIs use the same JWT authentication system:

```typescript
// HTTP API with JWT
const response = await fetch('/api/v1/agents', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Socket.IO with JWT
const socket = io(url, {
  auth: { token }
});
```

### 3. Consistent Session Management

Both APIs use the same session key format:

```typescript
// Session key format: agent:user:channel
const sessionKey = `${agentId}:${userId}:${channelId}`;
```

## Performance Considerations

### 1. Connection Pooling

- Reuse single Socket.IO connection per user
- Implement connection pooling for multiple concurrent streams
- Handle connection cleanup on component unmount

### 2. Memory Management

- Clean up event listeners to prevent memory leaks
- Implement proper abort mechanisms for streams
- Use efficient data structures for message buffering

### 3. Error Recovery

- Implement automatic reconnection with exponential backoff
- Handle network interruptions gracefully
- Provide clear error messages and recovery options

## Security Best Practices

### 1. JWT Token Validation

- Validate JWT tokens on every Socket.IO connection
- Use secure token storage and transmission
- Implement token refresh mechanisms

### 2. Room-based Isolation

- Use structured room names for session isolation
- Validate user permissions for room access
- Implement proper authorization checks

### 3. Input Validation

- Validate all incoming Socket.IO events
- Sanitize user inputs to prevent injection attacks
- Implement rate limiting for event handlers

## Troubleshooting Guide

### Common Issues

1. **Connection Failures**
   - Check JWT token validity
   - Verify CORS configuration
   - Ensure proper authentication middleware

2. **Event Not Firing**
   - Verify event listener registration
   - Check room membership
   - Validate event payload structure

3. **Performance Issues**
   - Monitor connection pool usage
   - Check for memory leaks in event handlers
   - Optimize typewriter effect timing

### Debug Commands

```bash
# Check Socket.IO server status
curl -X GET http://localhost:4000/socket.io/

# Monitor Socket.IO events
DEBUG=socket.io:* npm run dev

# Test JWT token validation
node -e "console.log(require('jsonwebtoken').decode('[AUTH-TOKEN]'))"
```

## Conclusion

This implementation provides a robust, scalable Socket.IO solution that integrates seamlessly with the existing Starships.ai architecture. The real-time capabilities enhance user experience while maintaining security and performance standards.

For detailed implementation status and progress tracking, refer to [`agent-chat-socket-io-implementation-plan.md`](agent-chat-socket-io-implementation-plan.md).