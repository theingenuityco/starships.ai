# Socket.IO Implementation - Step-by-Step Execution Plan

## 🎯 Full Migration Approach
We'll completely replace the existing SSE implementation with Socket.IO for cleaner codebase and better real-time capabilities.

## 🔍 Current State Analysis
- **SSE Endpoint**: `/api/sibil/chat/stream` using `res.write()` for streaming
- **Frontend**: Uses `fetch()` with ReadableStream for SSE consumption
- **Streaming**: Chunk-based streaming (not character-by-character)
- **Connection**: One-way communication only

## 🚀 Target State
- **Socket.IO**: Bi-directional real-time communication
- **Typewriter**: Character-by-character streaming with configurable speed
- **Connection Management**: Auto-reconnection, presence, typing indicators
- **Enhanced UX**: Real-time feedback and smooth animations

## 📋 Detailed Execution Steps

### Phase 1: Backend Socket.IO Infrastructure

#### Step 1.1: Install Dependencies
```bash
# Server dependencies
cd packages/server && pnpm add socket.io @types/socket.io

# Client dependencies  
cd packages/client && pnpm add socket.io-client @types/socket.io-client
```

#### Step 1.2: Update Protocol Types
**File**: `packages/protocol/src/index.ts`
**Action**: Add Socket.IO specific types and events

**Changes to make:**
1. Add Socket.IO event interfaces
2. Add typewriter-specific types
3. Enhance existing streaming types
4. Add connection management types

```typescript
// Add these new interfaces at the end of the file

// Socket.IO Event Definitions
export interface SocketIOEvents {
  // Client to Server events
  'sibil:start-stream': (request: SibilSocketRequest) => void;
  'sibil:stop-stream': (streamId: string) => void;
  'sibil:join-room': (userId: string) => void;
  'sibil:leave-room': (userId: string) => void;
  
  // Server to Client events
  'sibil:stream-start': (streamId: string) => void;
  'sibil:stream-chunk': (chunk: SibilSocketStreamChunk) => void;
  'sibil:stream-complete': (response: SibilResponse) => void;
  'sibil:stream-error': (error: SibilStreamError) => void;
  'sibil:typing-start': () => void;
  'sibil:typing-stop': () => void;
  'connection-status': (status: ConnectionStatus) => void;
}

// Enhanced request for Socket.IO
export interface SibilSocketRequest extends SibilRequest {
  stream_id: string;
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
}

// Typewriter-specific types
export interface TypewriterChunk {
  type: 'character' | 'word' | 'line' | 'complete';
  content: string;
  position: number;
  total_length?: number;
  delay?: number; // milliseconds
  is_code?: boolean;
  is_markdown?: boolean;
}

// Enhanced streaming chunk for Socket.IO
export interface SibilSocketStreamChunk extends SibilStreamChunk {
  stream_id: string;
  typewriter?: TypewriterChunk;
  typing_speed?: number;
  timestamp: number;
}

// Connection and error types
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

export interface SibilStreamError {
  stream_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

// Socket.IO client state
export interface SocketConnectionState {
  connected: boolean;
  authenticated: boolean;
  room_joined: boolean;
  user_id?: string;
  connection_id?: string;
  last_ping?: number;
}
```

**Implementation Notes:**
- Remove existing `SibilStreamChunk` and `SibilStreamRequest` interfaces
- Replace with Socket.IO specific versions
- Add comprehensive error handling types
- Include connection state management

#### Step 1.3: Create Socket.IO Service
**File**: `packages/server/src/services/SocketIOService.ts` (NEW)
**Action**: Create Socket.IO connection management service

**Complete implementation:**
```typescript
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type { SocketIOEvents, SocketConnectionState } from '@starships/protocol';
import { verifyJWT } from '../middleware/auth';

export class SocketIOService {
  private static instance: SocketIOService;
  private io: SocketIOServer<SocketIOEvents>;
  private connections: Map<string, SocketConnectionState> = new Map();

  private constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  static initialize(httpServer: HTTPServer): SocketIOService {
    if (!SocketIOService.instance) {
      SocketIOService.instance = new SocketIOService(httpServer);
    }
    return SocketIOService.instance;
  }

  static getInstance(): SocketIOService {
    if (!SocketIOService.instance) {
      throw new Error('SocketIOService not initialized');
    }
    return SocketIOService.instance;
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const payload = await verifyJWT(token);
        socket.data.userId = payload.sub;
        socket.data.authenticated = true;
        
        console.log(`[SOCKET.IO] User ${payload.sub} authenticated`);
        next();
      } catch (error) {
        console.error('[SOCKET.IO] Authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      console.log(`[SOCKET.IO] User ${userId} connected: ${socket.id}`);

      // Initialize connection state
      this.connections.set(socket.id, {
        connected: true,
        authenticated: true,
        room_joined: false,
        user_id: userId,
        connection_id: socket.id,
        last_ping: Date.now()
      });

      // Auto-join user to their personal room
      const userRoom = `user:${userId}`;
      socket.join(userRoom);
      this.updateConnectionState(socket.id, { room_joined: true });

      // Send connection confirmation
      socket.emit('connection-status', 'connected');

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`[SOCKET.IO] User ${userId} disconnected: ${reason}`);
        this.connections.delete(socket.id);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        this.updateConnectionState(socket.id, { last_ping: Date.now() });
        socket.emit('pong');
      });
    });
  }

  private updateConnectionState(socketId: string, updates: Partial<SocketConnectionState>) {
    const current = this.connections.get(socketId);
    if (current) {
      this.connections.set(socketId, { ...current, ...updates });
    }
  }

  // Public methods for other services
  getIO(): SocketIOServer<SocketIOEvents> {
    return this.io;
  }

  getUserRoom(userId: string): string {
    return `user:${userId}`;
  }

  getConnectionState(socketId: string): SocketConnectionState | undefined {
    return this.connections.get(socketId);
  }

  isUserConnected(userId: string): boolean {
    return Array.from(this.connections.values()).some(
      conn => conn.user_id === userId && conn.connected
    );
  }

  emitToUser(userId: string, event: keyof SocketIOEvents, data: any) {
    const userRoom = this.getUserRoom(userId);
    this.io.to(userRoom).emit(event, data);
  }

  getConnectedUsersCount(): number {
    return this.connections.size;
  }
}
```

#### Step 1.4: Create Socket.IO Handlers
**File**: `packages/server/src/socket/index.ts` (NEW)
**Action**: Socket.IO setup and middleware

```typescript
import { SocketIOService } from '../services/SocketIOService';
import { setupSibilHandlers } from './sibilHandlers';
import type { Server as HTTPServer } from 'http';

export function initializeSocketIO(httpServer: HTTPServer) {
  console.log('[SOCKET.IO] Initializing Socket.IO server...');
  
  const socketService = SocketIOService.initialize(httpServer);
  const io = socketService.getIO();

  // Setup Sibil-specific handlers
  setupSibilHandlers(io);

  console.log('[SOCKET.IO] Socket.IO server initialized successfully');
  return socketService;
}

export { SocketIOService };
```

**File**: `packages/server/src/socket/sibilHandlers.ts` (NEW)
**Action**: Sibil-specific socket event handlers

```typescript
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
          session_id: request.session_id
        };

        // Start streaming with typewriter effect
        let accumulatedContent = '';
        let chunkCount = 0;
        const typingSpeed = request.typing_speed || 75; // chars per second
        const typewriterEnabled = request.typewriter_enabled !== false;

        for await (const chunk of SibilService.chatStreamSocket(sibilRequest)) {
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
```

#### Step 1.5: Update Server Index
**File**: `packages/server/src/index.ts`
**Action**: Integrate Socket.IO with Express server

**Changes to make:**
1. Import HTTP server creation
2. Initialize Socket.IO with HTTP server
3. Update server startup

```typescript
// Add these imports at the top
import { createServer } from 'http';
import { initializeSocketIO } from './socket';

// Replace the existing app.listen() with:
const httpServer = createServer(app);

// Initialize Socket.IO
const socketService = initializeSocketIO(httpServer);

// Start server (replace existing app.listen)
httpServer.listen(PORT, async () => {
  try {
    // Initialize database connection
    await dbConnection.connect();
    await dbConnection.initializeSchema();
    console.log('✅ Neo4j database connected and schema initialized');
    
    // Log Socket.IO status
    console.log('✅ Socket.IO server initialized');
    console.log(`📡 WebSocket connections: ${socketService.getConnectedUsersCount()}`);
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }
  
  console.log(`🚀 Aether Core Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO: ws://localhost:${PORT}`);
  console.log(`🛸 Starships ready for launch!`);
});
```

#### Step 1.6: Enhanced Sibil Service
**File**: `packages/server/src/services/SibilService.ts`
**Action**: Add Socket.IO streaming method alongside existing methods

**Changes to make:**
1. Add new `chatStreamSocket()` method for Socket.IO
2. Keep existing methods for backward compatibility
3. Enhance streaming for character-level chunks

```typescript
// Add this new method to SibilService class
static async *chatStreamSocket(request: SibilRequest): AsyncGenerator<SibilStreamChunk> {
  const { provider, model, message } = request;

  try {
    if (provider === 'openai') {
      yield* this.streamWithOpenAISocket(model || 'gpt-4', message);
    } else {
      yield* this.streamWithAnthropicSocket(model || 'claude-3-sonnet-20240229', message);
    }
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown streaming error',
      is_final: true
    };
  }
}

// Enhanced OpenAI streaming for Socket.IO (character-level)
private static async *streamWithOpenAISocket(model: string, message: string): AsyncGenerator<SibilStreamChunk> {
  const stream = await this.openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: this.getSibilSystemPrompt(),
      },
      {
        role: 'user',
        content: message,
      },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    stream: true,
  });

  let fullContent = '';
  let chunkId = 0;

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullContent += content;
      chunkId++;

      // Parse structured content progressively
      const structuredContent = this.parseStructuredContentProgressive(fullContent);

      yield {
        type: 'content',
        content,
        structured_content: structuredContent,
        provider: 'openai',
        model,
        chunk_id: chunkId.toString(),
        is_final: false
      };
    }
  }

  // Final chunk with complete content
  yield {
    type: 'complete',
    content: fullContent,
    structured_content: this.parseStructuredContent(fullContent),
    provider: 'openai',
    model,
    is_final: true
  };
}

// Enhanced Anthropic streaming for Socket.IO (character-level)
private static async *streamWithAnthropicSocket(model: string, message: string): AsyncGenerator<SibilStreamChunk> {
  const stream = await this.anthropic.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0.7,
    system: this.getSibilSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: message,
      },
    ],
    stream: true,
  });

  let fullContent = '';
  let chunkId = 0;

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      const content = chunk.delta.text;
      fullContent += content;
      chunkId++;

      const structuredContent = this.parseStructuredContentProgressive(fullContent);

      yield {
        type: 'content',
        content,
        structured_content: structuredContent,
        provider: 'anthropic',
        model,
        chunk_id: chunkId.toString(),
        is_final: false
      };
    }
  }

  // Final chunk
  yield {
    type: 'complete',
    content: fullContent,
    structured_content: this.parseStructuredContent(fullContent),
    provider: 'anthropic',
    model,
    is_final: true
  };
}
```

#### Step 1.7: Update Sibil Routes
**File**: `packages/server/src/routes/sibil.ts`
**Action**: Remove SSE endpoint, keep only non-streaming endpoint

**Changes to make:**
1. Remove entire `/chat/stream` route (lines 52-97)
2. Keep `/chat` route for non-streaming requests
3. Add Socket.IO status endpoint

```typescript
// Remove the entire router.post('/chat/stream', ...) route

// Add new status endpoint
router.get('/socket-status', authMiddleware, (req, res) => {
  try {
    const socketService = SocketIOService.getInstance();
    const userId = req.user!.id;
    
    res.json({
      socket_available: true,
      user_connected: socketService.isUserConnected(userId),
      total_connections: socketService.getConnectedUsersCount(),
      user_room: socketService.getUserRoom(userId)
    });
  } catch (error) {
    res.json({
      socket_available: false,
      error: 'Socket.IO service not available'
    });
  }
});
```

### Phase 2: Frontend Socket.IO Integration

#### Step 2.1: Create Socket.IO Client Service
**File**: `packages/client/src/lib/socket-client.ts` (NEW)
**Action**: Socket.IO client initialization and management

```typescript
import { io, Socket } from 'socket.io-client';
import type { SocketIOEvents, ConnectionStatus, SocketConnectionState } from '@starships/protocol';

class SocketClient {
  private static instance: SocketClient;
  private socket: Socket<SocketIOEvents> | null = null;
  private connectionState: SocketConnectionState = {
    connected: false,
    authenticated: false,
    room_joined: false
  };
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  private constructor() {}

  static getInstance(): SocketClient {
    if (!SocketClient.instance) {
      SocketClient.instance = new SocketClient();
    }
    return SocketClient.instance;
  }

  async connect(token: string, userId: string): Promise<void> {
    if (this.socket?.connected) {
      console.log('[SOCKET CLIENT] Already connected');
      return;
    }

    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
    
    this.socket = io(serverUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not initialized'));

      this.socket.on('connect', () => {
        console.log('[SOCKET CLIENT] Connected:', this.socket!.id);
        this.connectionState = {
          connected: true,
          authenticated: true,
          room_joined: true,
          user_id: userId,
          connection_id: this.socket!.id,
          last_ping: Date.now()
        };
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[SOCKET CLIENT] Connection error:', error);
        this.connectionState.connected = false;
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[SOCKET CLIENT] Disconnected:', reason);
        this.connectionState.connected = false;
        
        if (reason === 'io server disconnect') {
          this.handleReconnection();
        }
      });

      this.socket.on('connection-status', (status: ConnectionStatus) => {
        console.log('[SOCKET CLIENT] Status update:', status);
        this.connectionState.connected = status === 'connected';
      });

      setInterval(() => {
        if (this.socket?.connected) {
          this.socket.emit('ping');
          this.connectionState.last_ping = Date.now();
        }
      }, 30000);
    });
  }

  private handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SOCKET CLIENT] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[SOCKET CLIENT] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    }, delay);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionState = {
        connected: false,
        authenticated: false,
        room_joined: false
      };
    }
  }

  getSocket(): Socket<SocketIOEvents> | null {
    return this.socket;
  }

  getConnectionState(): SocketConnectionState {
    return { ...this.connectionState };
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  on<K extends keyof SocketIOEvents>(event: K, listener: SocketIOEvents[K]) {
    this.socket?.on(event, listener);
  }

  off<K extends keyof SocketIOEvents>(event: K, listener?: SocketIOEvents[K]) {
    this.socket?.off(event, listener);
  }

  emit<K extends keyof SocketIOEvents>(event: K, ...args: Parameters<SocketIOEvents[K]>) {
    this.socket?.emit(event, ...args);
  }
}

export default SocketClient;
```

#### Step 2.2: Create Typewriter Hook
**File**: `packages/client/src/hooks/useTypewriter.ts` (NEW)
**Action**: Character-by-character typewriter effect hook

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import type { TypewriterChunk } from '@starships/protocol';

interface UseTypewriterOptions {
  speed?: number;
  enabled?: boolean;
  onComplete?: () => void;
  onCharacter?: (char: string, position: number) => void;
}

interface UseTypewriterReturn {
  displayText: string;
  isTyping: boolean;
  progress: number;
  addChunk: (chunk: TypewriterChunk) => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;
  setSpeed: (speed: number) => void;
}

export function useTypewriter(options: UseTypewriterOptions = {}): UseTypewriterReturn {
  const {
    speed = 75,
    enabled = true,
    onComplete,
    onCharacter
  } = options;

  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(speed);

  const queueRef = useRef<TypewriterChunk[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const totalLengthRef = useRef(0);

  const processQueue = useCallback(() => {
    if (isPaused || queueRef.current.length === 0) {
      setIsTyping(false);
      return;
    }

    const chunk = queueRef.current.shift();
    if (!chunk) {
      setIsTyping(false);
      return;
    }

    setIsTyping(true);

    if (chunk.type === 'character') {
      setDisplayText(prev => prev + chunk.content);
      setProgress(chunk.position / (chunk.total_length || 1));
      
      onCharacter?.(chunk.content, chunk.position);

      let delay = 1000 / currentSpeed;
      
      if (chunk.is_code) {
        delay *= 0.8;
      } else if (chunk.content === ' ') {
        delay *= 0.5;
      } else if (chunk.content.match(/[.!?]/)) {
        delay *= 2;
      }

      if (chunk.delay) {
        delay = chunk.delay;
      }

      timeoutRef.current = setTimeout(processQueue, delay);
    } else if (chunk.type === 'complete') {
      setIsTyping(false);
      setProgress(1);
      onComplete?.();
    }
  }, [isPaused, currentSpeed, onCharacter, onComplete]);

  const addChunk = useCallback((chunk: TypewriterChunk) => {
    if (!enabled) {
      if (chunk.type === 'character') {
        setDisplayText(prev => prev + chunk.content);
      }
      return;
    }

    queueRef.current.push(chunk);
    
    if (chunk.total_length) {
      totalLengthRef.current = chunk.total_length;
    }

    if (!isTyping && !isPaused) {
      processQueue();
    }
  }, [enabled, isTyping, isPaused, processQueue]);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    queueRef.current = [];
    setDisplayText('');
    setIsTyping(false);
    setProgress(0);
    totalLengthRef.current = 0;
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
    if (queueRef.current.length > 0) {
      processQueue();
    }
  }, [processQueue]);

  const setSpeed = useCallback((newSpeed: number) => {
    setCurrentSpeed(newSpeed);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    displayText,
    isTyping,
    progress,
    addChunk,
    reset,
    pause,
    resume,
    setSpeed
  };
}
```

#### Step 2.3: Create Socket Connection Hook
**File**: `packages/client/src/hooks/useSocketConnection.ts` (NEW)
**Action**: Socket connection state management

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import SocketClient from '@/lib/socket-client';
import type { ConnectionStatus, SocketConnectionState } from '@starships/protocol';

interface UseSocketConnectionReturn {
  isConnected: boolean;
  connectionState: SocketConnectionState;
  connectionStatus: ConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  error: string | null;
}

export function useSocketConnection(): UseSocketConnectionReturn {
  const { getToken, userId, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<SocketConnectionState>({
    connected: false,
    authenticated: false,
    room_joined: false
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const socketClient = SocketClient.getInstance();

  const connect = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      setError('User not authenticated');
      return;
    }

    try {
      setError(null);
      setConnectionStatus('reconnecting');
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      await socketClient.connect(token, userId);
      
      const state = socketClient.getConnectionState();
      setConnectionState(state);
      setIsConnected(state.connected);
      setConnectionStatus('connected');
      
      console.log('[SOCKET HOOK] Connected successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setConnectionStatus('error');
      setIsConnected(false);
      console.error('[SOCKET HOOK] Connection failed:', err);
    }
  }, [isAuthenticated, userId, getToken]);

  const disconnect = useCallback(() => {
    socketClient.disconnect();
    setIsConnected(false);
    setConnectionState({
      connected: false,
      authenticated: false,
      room_joined: false
    });
    setConnectionStatus('disconnected');
    setError(null);
  }, []);

  const reconnect = useCallback(async () => {
    disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await connect();
  }, [disconnect, connect]);

  useEffect(() => {
    if (isAuthenticated && userId && !isConnected) {
      connect();
    }
  }, [isAuthenticated, userId, isConnected, connect]);

  useEffect(() => {
    const socket = socketClient.getSocket();
    if (!socket) return;

    const handleConnectionStatus = (status: ConnectionStatus) => {
      setConnectionStatus(status);
      setIsConnected(status === 'connected');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };

    const handleReconnect = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      setError(null);
    };

    socket.on('connection-status', handleConnectionStatus);
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect', handleReconnect);

    return () => {
      socket.off('connection-status', handleConnectionStatus);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect', handleReconnect);
    };
  }, [socketClient]);

  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, []);

  return {
    isConnected,
    connectionState,
    connectionStatus,
    connect,
    disconnect,
    reconnect,
    error
  };
}
```

#### Step 2.4: Update Sibil API
**File**: `packages/client/src/lib/sibil-api.ts`
**Action**: Replace SSE streaming with Socket.IO streaming

**Changes to make:**
1. Remove existing SSE streaming method
2. Add Socket.IO streaming method
3. Update interfaces for Socket.IO

```typescript
// Add these imports at the top
import SocketClient from './socket-client';
import type { SibilSocketRequest, SibilSocketStreamChunk, SibilStreamError } from '@starships/protocol';

// Replace the existing sendMessageStream method with:
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
    ...request,
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

  const handleStreamComplete = (response: SibilResponse) => {
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
```

#### Step 2.5: Create Typewriter Component
**File**: `packages/client/src/components/sibil/TypewriterText.tsx` (NEW)
**Action**: Typewriter text rendering component

```typescript
'use client'

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useTypewriter } from '@/hooks/useTypewriter';
import type { TypewriterChunk } from '@starships/protocol';

interface TypewriterTextProps {
  chunks: TypewriterChunk[];
  speed?: number;
  enabled?: boolean;
  onComplete?: () => void;
  className?: string;
}

export function TypewriterText({
  chunks,
  speed = 75,
  enabled = true,
  onComplete,
  className = ''
}: TypewriterTextProps) {
  const {
    displayText,
    isTyping,
    progress,
    addChunk,
    reset
  } = useTypewriter({
    speed,
    enabled,
    onComplete
  });

  const processedChunksRef = useRef(new Set<string>());

  useEffect(() => {
    chunks.forEach((chunk, index) => {
      const chunkKey = `${index}-${chunk.position}`;
      if (!processedChunksRef.current.has(chunkKey)) {
        processedChunksRef.current.add(chunkKey);
        addChunk(chunk);
      }
    });
  }, [chunks, addChunk]);

  useEffect(() => {
    if (chunks.length === 0) {
      reset();
      processedChunksRef.current.clear();
    }
  }, [chunks.length, reset]);

  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <span className="whitespace-pre-wrap">{displayText}</span>
      
      {isTyping && (
        <motion.span
          className="inline-block w-0.5 h-4 bg-current ml-0.5"
          animate={{ opacity: [1, 0, 1] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
      
      {isTyping && progress > 0 && (
        <motion.div
          className="absolute -bottom-1 left-0 h-0.5 bg-blue-500 rounded"
          style={{ width: `${progress * 100}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      )}
    </motion.div>
  );
}
```

#### Step 2.6: Update Chat Interface
**File**: `packages/client/src/components/sibil/SibilChatInterface.tsx`
**Action**: Integrate Socket.IO streaming and typewriter effects

**Changes to make:**
1. Replace SSE streaming with Socket.IO
2. Add Socket.IO connection management
3. Integrate typewriter effects

```typescript
// Add these imports at the top
import { useSocketConnection } from '@/hooks/useSocketConnection';
import SocketClient from '@/lib/socket-client';

// Add these state variables after existing state
const { isConnected, connectionStatus, error: connectionError } = useSocketConnection();
const [typingIndicator, setTypingIndicator] = useState(false);

// Replace the existing handleSendMessage with Socket.IO version
const handleSendMessage = async (content: string) => {
  if (!sessionId.current) {
    setError(ERROR_TEXT.NO_ACTIVE_SESSION)
    return
  }

  if (!isConnected) {
    setError('Socket.IO connection required for streaming')
    return
  }

  const currentSessionId = sessionId.current
  
  const userMessage: SibilMessage = {
    id: Math.random().toString(36).substring(2) + Date.now().toString(36),
    content,
    role: 'user',
    timestamp: new Date().toISOString(),
    sessionId: currentSessionId,
    sending: true
  }

  const updatedMessages = [...messages, userMessage]
  setMessages(updatedMessages)

  try {
    if (!userId) {
      throw new Error('User not authenticated')
    }

    const streamingMessage: SibilMessage = {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      content: '',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      sessionId: currentSessionId,
      provider,
      model,
      streaming: true,
      structured_content: []
    }

    const finalUserMessage = { ...userMessage, sending: false }
    setMessages([...messages, finalUserMessage, streamingMessage])
    setStreaming(true)

    streamController.current = sibilAPI.sendMessageStream(
      {
        provider,
        model,
        message: content,
        sessionId: currentSessionId
      },
      {
        onChunk: (chunk, accumulatedContent) => {
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessage.id
              ? {
                  ...msg,
                  content: accumulatedContent,
                  structured_content: chunk.structured_content || []
                }
              : msg
          ))
        },
        onComplete: (finalMessage) => {
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessage.id
              ? { ...finalMessage, id: msg.id }
              : msg
          ))
          setStreaming(false)
          setTypingIndicator(false)
          
          const finalMessages = [...messages, finalUserMessage, finalMessage]
          saveChatHistory(currentSessionId, finalMessages)
        },
        onError: (error) => {
          setError(error)
          setStreaming(false)
          setTypingIndicator(false)
          setMessages(prev => prev.filter(msg => msg.id !== streamingMessage.id))
        },
        onTypingStart: () => {
          setTypingIndicator(true)
        },
        onTypingStop: () => {
          setTypingIndicator(false)
        }
      }
    )
    
    setError(null)
  } catch (err) {
    console.error('Failed to send message:', err)
    setError(ERROR_TEXT.FAILED_TO_SEND_MESSAGE)
    setStreaming(false)
    setTypingIndicator(false)
    
    setMessages(messages)
    saveChatHistory(currentSessionId, messages)
  }
}

// Update the header to show connection status
<div className="flex items-center gap-4">
  <AnimatePresence>
    {(streaming || typingIndicator) && <StreamingIndicator onStop={handleStopStreaming} />}
  </AnimatePresence>
  
  <div className={`w-2 h-2 rounded-full ${
    connectionStatus === 'connected' ? 'bg-green-500' :
    connectionStatus === 'reconnecting' ? 'bg-yellow-500' :
    'bg-red-500'
  }`} />
  
  <ModernProviderSelector
    provider={provider}
    model={model}
    onProviderChange={handleProviderChange}
    onModelChange={setModel}
    disabled={streaming || !isConnected}
  />
</div>
```

#### Step 2.7: Update Message Bubble
**File**: `packages/client/src/components/sibil/SibilMessageBubble.tsx`
**Action**: Add typewriter effects for streaming messages

**Changes to make:**
1. Import TypewriterText component
2. Add typewriter rendering for streaming messages
3. Handle typewriter chunks

```typescript
// Add import
import { TypewriterText } from './TypewriterText';

// In the message content rendering section, replace with:
{message.streaming ? (
  <TypewriterText
    chunks={message.typewriter_chunks || []}
    speed={75}
    enabled={true}
    className="prose prose-sm max-w-none"
  />
) : (
  <ContentRenderer
    content={message.content}
    structured_content={message.structured_content}
  />
)}
```

#### Step 2.8: Update Streaming Indicator
**File**: `packages/client/src/components/sibil/StreamingIndicator.tsx`
**Action**: Show Socket.IO connection status and typing indicators

**Changes to make:**
1. Add connection status display
2. Show typing indicators
3. Add Socket.IO specific states

```typescript
// Add these props and imports
import type { ConnectionStatus } from '@starships/protocol';
import { Square } from 'lucide-react';

interface StreamingIndicatorProps {
  onStop: () => void;
  connectionStatus?: ConnectionStatus;
  isTyping?: boolean;
}

// Update the component to show connection and typing status
export function StreamingIndicator({
  onStop,
  connectionStatus = 'connected',
  isTyping = false
}: StreamingIndicatorProps) {
  return (
    <motion.div
      className="flex items-center gap-2"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
    >
      <div className={`w-2 h-2 rounded-full ${
        connectionStatus === 'connected' ? 'bg-green-500' :
        connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
        'bg-red-500'
      }`} />
      
      {isTyping && (
        <motion.div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Sibil is typing</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 bg-current rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
      
      <Button
        variant="outline"
        size="sm"
        onClick={onStop}
        className="h-6 px-2"
      >
        <Square className="h-3 w-3" />
        Stop
      </Button>
    </motion.div>
  );
}
```

### Phase 3: Testing and Optimization

#### Step 3.1: Test Socket.IO Connection
- Verify Socket.IO server starts correctly
- Test client connection and authentication
- Verify room-based messaging

#### Step 3.2: Test Streaming Flow
- Test message streaming end-to-end
- Verify typewriter effects work smoothly
- Test error handling and reconnection

#### Step 3.3: Performance Testing
- Measure streaming latency
- Test with multiple concurrent connections
- Verify memory usage is acceptable

## 🔧 Implementation Details

### Socket.IO Server Architecture:
```
Express Server (HTTP)
├── Socket.IO Server (WebSocket)
│   ├── Authentication Middleware
│   ├── Room Management (user-specific rooms)
│   └── Event Handlers
│       ├── sibil:start-stream
│       ├── sibil:stop-stream
│       └── connection management
└── REST API (existing routes)
```

### Socket.IO Client Architecture:
```
React App
├── Socket.IO Client
│   ├── Connection Management
│   ├── Event Listeners
│   └── Auto-reconnection
├── Typewriter Hook
│   ├── Character-by-character rendering
│   ├── Configurable speed
│   └── Markdown/Code awareness
└── Enhanced UI Components
    ├── Real-time connection status
    ├── Typing indicators
    └── Smooth animations
```

### Streaming Flow:
```
1. Client connects to Socket.IO server
2. Client joins user-specific room
3. Client emits 'sibil:start-stream' with message
4. Server processes with LLM provider
5. Server emits character-by-character chunks
6. Client renders with typewriter effect
7. Server emits 'sibil:stream-complete' when done
```

## 📁 Files to be Created/Modified

### New Files:
```
packages/server/src/
├── services/SocketIOService.ts
└── socket/
    ├── index.ts
    └── sibilHandlers.ts

packages/client/src/
├── lib/socket-client.ts
├── hooks/
│   ├── useTypewriter.ts
│   └── useSocketConnection.ts
└── components/sibil/
    └── TypewriterText.tsx
```

### Modified Files:
```
packages/protocol/src/index.ts          # Add Socket.IO types
packages/server/src/index.ts            # Integrate Socket.IO
packages/server/src/services/SibilService.ts  # Replace SSE with Socket.IO
packages/server/src/routes/sibil.ts     # Remove SSE endpoint
packages/client/src/lib/sibil-api.ts    # Replace SSE with Socket.IO
packages/client/src/components/sibil/
├── SibilChatInterface.tsx              # Integrate Socket.IO
├── SibilMessageBubble.tsx              # Add typewriter effects
└── StreamingIndicator.tsx              # Socket.IO connection status
```

## 🎯 Key Features to Implement

### 1. Character-by-Character Typewriter Effect
- Configurable typing speed (50-100 chars/second)
- Smooth character rendering with CSS animations
- Support for markdown and code block streaming
- Pause/resume capability

### 2. Real-time Connection Management
- Automatic reconnection with exponential backoff
- Connection status indicators
- Graceful error handling
- Room-based messaging for user isolation

### 3. Enhanced User Experience
- Typing indicators ("Sibil is thinking...")
- Real-time connection status
- Smooth animations and transitions
- Responsive design for all devices

### 4. Performance Optimizations
- Efficient character buffering
- Memory-conscious streaming
- Optimized re-renders
- Connection pooling

## 🛡️ Error Handling Strategy

### Connection Errors:
- Automatic reconnection with exponential backoff
- User-friendly error messages
- Fallback to non-streaming mode if needed

### Streaming Errors:
- Graceful error recovery
- Partial message preservation
- Clear error indicators

### Authentication Errors:
- Automatic re-authentication
- Secure token refresh
- User session management

## 📊 Success Criteria

### Performance Metrics:
- First character appears within 100ms
- Smooth 60fps typewriter animation
- < 50ms latency for character streaming
- Successful reconnection within 2 seconds

### User Experience:
- Smooth, natural typewriter effect
- Clear connection status feedback
- No message loss during reconnection
- Responsive across all devices

### Technical Requirements:
- 100% TypeScript coverage
- Comprehensive error handling
- Memory efficient implementation
- Scalable architecture

---

## 🚀 Ready to Execute

This plan will completely migrate from SSE to Socket.IO while implementing enhanced typewriter effects and real-time features. Each step builds upon the previous one, ensuring a smooth implementation process.

**Estimated Implementation Time: 6-8 hours**
**Risk Level: Medium (full migration)**
**Impact: High (significantly enhanced user experience)**

Are you ready to proceed with this implementation plan?