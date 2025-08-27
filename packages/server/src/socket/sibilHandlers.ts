import type { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  SocketEvents,
  ChatRequest,
  ChatStreamChunk,
  VisionAnalysisRequest,
  VisionRefinementRequest,
  VisionUpdateRequest,
  VisionAnalyzingEventData,
  VisionProposalEventData,
  VisionUpdatedEventData,
  VisionAnalysisEventData,
  VisionRefinementErrorEventData,
  VisionRefinementState
} from '@starships/protocol';
import { SibilService } from '../services/SibilService';
import { SocketIOService } from '../services/SocketIOService';
import { VisionRefinementService } from '../services/VisionRefinementService';
import { VisionRefinementSessionManager } from '../services/VisionRefinementSessionManager';
import { VisionMetricsCalculator } from '../services/VisionMetricsCalculator';
import { RepositoryFactory, type VisionRepository } from '@starships/models';

// Rate limiting for vision refinement
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const visionRateLimit = new Map<string, RateLimitEntry>();
const VISION_RATE_LIMIT = {
  maxRequests: 10, // Maximum 10 vision requests per minute
  windowMs: 60 * 1000 // 1 minute window
};

// Helper function to check rate limit
function checkVisionRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = visionRateLimit.get(userId);
  
  if (!userLimit || now - userLimit.windowStart > VISION_RATE_LIMIT.windowMs) {
    // New window or first request
    visionRateLimit.set(userId, { count: 1, windowStart: now });
    return true;
  }
  
  if (userLimit.count >= VISION_RATE_LIMIT.maxRequests) {
    return false; // Rate limited
  }
  
  userLimit.count++;
  return true;
}

export function setupSibilHandlers(io: SocketIOServer<SocketEvents>) {
  // Lazy-initialize vision refinement services
  let visionRefinementService: VisionRefinementService | null = null;
  let visionSessionManager: VisionRefinementSessionManager | null = null;
  let visionMetricsCalculator: VisionMetricsCalculator | null = null;
  let visionRepo: VisionRepository | null = null;

  const getVisionRefinementService = () => {
    if (!visionRefinementService) {
      visionRefinementService = new VisionRefinementService();
    }
    return visionRefinementService;
  };

  const getVisionSessionManager = () => {
    if (!visionSessionManager) {
      visionSessionManager = new VisionRefinementSessionManager();
    }
    return visionSessionManager;
  };

  const getVisionMetricsCalculator = () => {
    if (!visionMetricsCalculator) {
      visionMetricsCalculator = new VisionMetricsCalculator();
    }
    return visionMetricsCalculator;
  };

  const getVisionRepo = () => {
    if (!visionRepo) {
      visionRepo = RepositoryFactory.getVisionRepository();
    }
    return visionRepo;
  };

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const socketService = SocketIOService.getInstance();

    // Handle stream start
    socket.on('chat:start-stream', async (request: ChatRequest) => {
      if (request.source !== 'sibil') return;
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
          source: 'sibil' as const,
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

                const typewriterChunk: ChatStreamChunk = {
                  ...chunk,
                  source: 'sibil' as const,
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
              const socketChunk: ChatStreamChunk = {
                ...chunk,
                source: 'sibil' as const,
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

            // Check for vision-related content and trigger refinement
            try {
              if (request.starship_id && getVisionRefinementService().isVisionRelated(request.message)) {
                console.log(`[VISION] Vision-related message detected in chat for starship ${request.starship_id}`);
                
                // Get or create session for vision refinement
                const currentVision = await getVisionRepo().getVisionByStarshipId(request.starship_id);
                if (currentVision) {
                  const session = getVisionSessionManager().getOrCreateSession(userId, request.starship_id, currentVision.vision);
                  
                  // Add the user message and AI response to session
                  getVisionSessionManager().addMessage(session.sessionId, 'user', request.message, {
                    isVisionRelated: true
                  });
                  
                  getVisionSessionManager().addMessage(session.sessionId, 'assistant', chunk.content || accumulatedContent, {
                    isVisionRelated: true
                  });

                  // Trigger refinement analysis in background
                  setImmediate(async () => {
                    try {
                      const refinementResult = await getVisionRefinementService().refine(
                        currentVision.vision,
                        request.message,
                        session.conversationContext
                      );

                      if (refinementResult.proposedVision && refinementResult.requiresConfirmation) {
                        // Set awaiting confirmation state
                        getVisionSessionManager().setAwaitingConfirmation(
                          session.sessionId,
                          refinementResult.proposedVision,
                          refinementResult.confidenceLevel
                        );

                        // Calculate metrics for proposed vision
                        const proposedMetrics = await getVisionMetricsCalculator().calculateMetrics(
                          refinementResult.proposedVision,
                          session.refinementCount
                        );

                        const proposalData: VisionProposalEventData = {
                          starshipId: request.starship_id!,
                          userId,
                          sessionId: session.sessionId,
                          proposal: {
                            originalVision: currentVision.vision,
                            proposedVision: refinementResult.proposedVision,
                            reasoning: refinementResult.reasoning,
                            keyChanges: [],
                            confidenceLevel: refinementResult.confidenceLevel,
                            metrics: proposedMetrics,
                            requiresConfirmation: true,
                            timestamp: new Date().toISOString()
                          },
                          timestamp: new Date().toISOString()
                        };

                        // Broadcast proposal to starship room
                        const starshipRoom = `starship:${request.starship_id}`;
                        socket.to(starshipRoom).emit('vision:proposal', proposalData);
                        socket.emit('vision:proposal', proposalData);

                        console.log(`[VISION] Auto-generated proposal for starship ${request.starship_id} from chat interaction`);
                      }
                    } catch (visionError) {
                      console.error('[VISION] Background refinement error:', visionError);
                      // Don't interrupt the main chat flow
                    }
                  });
                }
              }
            } catch (visionError) {
              console.error('[VISION] Vision integration error:', visionError);
              // Don't interrupt the main chat flow
            }

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

    // ========================================================================
    // VISION REFINEMENT HANDLERS
    // ========================================================================

    // Vision analysis handler
    socket.on('vision:analyze', async (request: VisionAnalysisRequest, callback) => {
      try {
        // Rate limiting check
        if (!checkVisionRateLimit(userId)) {
          const errorData: VisionRefinementErrorEventData = {
            starshipId: request.starshipId,
            userId,
            error: 'Rate limit exceeded. Please wait before making another vision analysis request.',
            errorCode: 'RATE_LIMITED',
            recoverable: true,
            timestamp: new Date().toISOString()
          };
          
          socket.emit('vision:error', errorData);
          callback?.({ success: false, error: 'Rate limited' });
          return;
        }

        // Validate input
        if (!request.vision?.trim() || request.vision.trim().length < 10) {
          const errorData: VisionRefinementErrorEventData = {
            starshipId: request.starshipId,
            userId,
            error: 'Vision statement must be at least 10 characters long.',
            errorCode: 'INVALID_INPUT',
            recoverable: true,
            timestamp: new Date().toISOString()
          };
          
          socket.emit('vision:error', errorData);
          callback?.({ success: false, error: 'Invalid input' });
          return;
        }

        // Get or create session
        const session = getVisionSessionManager().getOrCreateSession(userId, request.starshipId, request.vision);
        const sessionId = session.sessionId;

        // Emit analyzing status
        const analyzingData: VisionAnalyzingEventData = {
          starshipId: request.starshipId,
          userId,
          sessionId,
          vision: request.vision,
          timestamp: new Date().toISOString()
        };

        // Broadcast to all users in starship room
        const starshipRoom = `starship:${request.starshipId}`;
        socket.to(starshipRoom).emit('vision:analyzing', analyzingData);
        socket.emit('vision:analyzing', analyzingData);

        // Perform analysis
        console.log(`[VISION] Starting analysis for starship ${request.starshipId}, user ${userId}`);
        const analysis = await getVisionRefinementService().analyze(request.vision);
        const metrics = await getVisionMetricsCalculator().calculateMetrics(request.vision, session.refinementCount);

        const analysisEventData: VisionAnalysisEventData = {
          starshipId: request.starshipId,
          userId,
          sessionId,
          analysis: {
            ...analysis,
            metrics,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };

        // Broadcast analysis results
        socket.to(starshipRoom).emit('vision:analysis-complete', analysisEventData);
        socket.emit('vision:analysis-complete', analysisEventData);

        callback?.({ success: true, sessionId });
        console.log(`[VISION] Analysis completed for starship ${request.starshipId}`);

      } catch (error) {
        console.error(`[VISION] Analysis error for user ${userId}:`, error);
        
        const errorData: VisionRefinementErrorEventData = {
          starshipId: request.starshipId,
          userId,
          sessionId: request.sessionId,
          error: error instanceof Error ? error.message : 'Analysis failed',
          errorCode: 'ANALYSIS_FAILED',
          recoverable: true,
          timestamp: new Date().toISOString()
        };
        
        socket.emit('vision:error', errorData);
        callback?.({ success: false, error: 'Analysis failed' });
      }
    });

    // Vision refinement handler
    socket.on('vision:refine', async (request: VisionRefinementRequest, callback) => {
      try {
        // Rate limiting check
        if (!checkVisionRateLimit(userId)) {
          const errorData: VisionRefinementErrorEventData = {
            starshipId: request.starshipId,
            userId,
            sessionId: request.sessionId,
            error: 'Rate limit exceeded. Please wait before making another refinement request.',
            errorCode: 'RATE_LIMITED',
            recoverable: true,
            timestamp: new Date().toISOString()
          };
          
          socket.emit('vision:error', errorData);
          callback?.({ success: false, error: 'Rate limited' });
          return;
        }

        // Get session
        const session = getVisionSessionManager().getSession(request.sessionId);
        if (!session) {
          const errorData: VisionRefinementErrorEventData = {
            starshipId: request.starshipId,
            userId,
            sessionId: request.sessionId,
            error: 'Session expired or not found. Please start a new analysis.',
            errorCode: 'SESSION_EXPIRED',
            recoverable: false,
            timestamp: new Date().toISOString()
          };
          
          socket.emit('vision:error', errorData);
          callback?.({ success: false, error: 'Session expired' });
          return;
        }

        // Emit analyzing status
        const analyzingData: VisionAnalyzingEventData = {
          starshipId: request.starshipId,
          userId,
          sessionId: request.sessionId,
          vision: request.currentVision,
          timestamp: new Date().toISOString()
        };

        const starshipRoom = `starship:${request.starshipId}`;
        socket.to(starshipRoom).emit('vision:analyzing', analyzingData);
        socket.emit('vision:analyzing', analyzingData);

        // Perform refinement
        console.log(`[VISION] Starting refinement for starship ${request.starshipId}, session ${request.sessionId}`);
        const refinementResult = await getVisionRefinementService().refine(
          request.currentVision,
          request.userMessage,
          request.conversationContext || session.conversationContext
        );

        // Add message to session
        getVisionSessionManager().addMessage(request.sessionId, 'user', request.userMessage, {
          isVisionRelated: true
        });

        if (refinementResult.proposedVision && refinementResult.requiresConfirmation) {
          // Set awaiting confirmation state
          getVisionSessionManager().setAwaitingConfirmation(
            request.sessionId,
            refinementResult.proposedVision,
            refinementResult.confidenceLevel
          );

          // Calculate metrics for proposed vision
          const proposedMetrics = await getVisionMetricsCalculator().calculateMetrics(
            refinementResult.proposedVision,
            session.refinementCount
          );

          const proposalData: VisionProposalEventData = {
            starshipId: request.starshipId,
            userId,
            sessionId: request.sessionId,
            proposal: {
              originalVision: request.currentVision,
              proposedVision: refinementResult.proposedVision,
              reasoning: refinementResult.reasoning,
              keyChanges: [], // Could be extracted from reasoning
              confidenceLevel: refinementResult.confidenceLevel,
              metrics: proposedMetrics,
              requiresConfirmation: true,
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          };

          // Broadcast proposal
          socket.to(starshipRoom).emit('vision:proposal', proposalData);
          socket.emit('vision:proposal', proposalData);

        } else {
          // No refinement needed - emit analysis results
          const analysisEventData: VisionAnalysisEventData = {
            starshipId: request.starshipId,
            userId,
            sessionId: request.sessionId,
            analysis: {
              ...refinementResult.analysis,
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
          };

          socket.to(starshipRoom).emit('vision:analysis-complete', analysisEventData);
          socket.emit('vision:analysis-complete', analysisEventData);
        }

        callback?.({ success: true });
        console.log(`[VISION] Refinement completed for starship ${request.starshipId}`);

      } catch (error) {
        console.error(`[VISION] Refinement error for user ${userId}:`, error);
        
        const errorData: VisionRefinementErrorEventData = {
          starshipId: request.starshipId,
          userId,
          sessionId: request.sessionId,
          error: error instanceof Error ? error.message : 'Refinement failed',
          errorCode: 'REFINEMENT_FAILED',
          recoverable: true,
          timestamp: new Date().toISOString()
        };
        
        socket.emit('vision:error', errorData);
        callback?.({ success: false, error: 'Refinement failed' });
      }
    });

    // Accept vision proposal handler
    socket.on('vision:accept-proposal', async (data, callback) => {
      try {
        const session = getVisionSessionManager().acceptProposal(data.sessionId);
        if (!session || !session.currentVision) {
          callback?.({ success: false, error: 'No proposal to accept' });
          return;
        }

        // Update vision in database
        try {
          await getVisionRepo().updateVision(data.starshipId, session.currentVision);
        } catch (dbError) {
          console.error(`[VISION] Failed to update vision in database:`, dbError);
          callback?.({ success: false, error: 'Failed to save vision' });
          return;
        }

        // Calculate metrics for the updated vision
        const metrics = await getVisionMetricsCalculator().calculateMetrics(session.currentVision, session.refinementCount);

        const updateData: VisionUpdatedEventData = {
          starshipId: data.starshipId,
          userId: data.userId,
          sessionId: data.sessionId,
          oldVision: session.conversationContext.length > 0 
            ? session.conversationContext[0].content 
            : 'Previous vision',
          newVision: session.currentVision,
          metrics,
          refinementCount: session.refinementCount,
          timestamp: new Date().toISOString(),
          updateSource: 'user_acceptance'
        };

        // Broadcast update to all starship members
        const starshipRoom = `starship:${data.starshipId}`;
        socket.to(starshipRoom).emit('vision:updated', updateData);
        socket.emit('vision:updated', updateData);

        // Update session state
        const stateData: VisionRefinementState = {
          sessionId: data.sessionId,
          starshipId: data.starshipId,
          userId: data.userId,
          currentVision: session.currentVision,
          awaitingConfirmation: false,
          refinementCount: session.refinementCount,
          lastUpdate: new Date().toISOString(),
          isAnalyzing: false
        };

        socket.to(starshipRoom).emit('vision:state-changed', stateData);
        socket.emit('vision:state-changed', stateData);

        callback?.({ success: true });
        console.log(`[VISION] Proposal accepted for starship ${data.starshipId}, refinement count: ${session.refinementCount}`);

      } catch (error) {
        console.error(`[VISION] Accept proposal error:`, error);
        callback?.({ success: false, error: 'Failed to accept proposal' });
      }
    });

    // Reject vision proposal handler
    socket.on('vision:reject-proposal', async (data, callback) => {
      try {
        const session = getVisionSessionManager().rejectProposal(data.sessionId, data.feedback);
        if (!session) {
          callback?.({ success: false, error: 'Session not found' });
          return;
        }

        // Update session state
        const stateData: VisionRefinementState = {
          sessionId: data.sessionId,
          starshipId: data.starshipId,
          userId: data.userId,
          currentVision: session.currentVision,
          awaitingConfirmation: false,
          refinementCount: session.refinementCount,
          lastUpdate: new Date().toISOString(),
          isAnalyzing: false
        };

        const starshipRoom = `starship:${data.starshipId}`;
        socket.to(starshipRoom).emit('vision:state-changed', stateData);
        socket.emit('vision:state-changed', stateData);

        callback?.({ success: true });
        console.log(`[VISION] Proposal rejected for starship ${data.starshipId}`);

      } catch (error) {
        console.error(`[VISION] Reject proposal error:`, error);
        callback?.({ success: false, error: 'Failed to reject proposal' });
      }
    });

    // Direct vision update handler
    socket.on('vision:update', async (request: VisionUpdateRequest, callback) => {
      try {
        // Rate limiting check
        if (!checkVisionRateLimit(userId)) {
          const errorData: VisionRefinementErrorEventData = {
            starshipId: request.starshipId,
            userId,
            error: 'Rate limit exceeded. Please wait before making another update.',
            errorCode: 'RATE_LIMITED',
            recoverable: true,
            timestamp: new Date().toISOString()
          };
          
          socket.emit('vision:error', errorData);
          callback?.({ success: false, error: 'Rate limited' });
          return;
        }

        // Get current vision for comparison
        const currentVision = await getVisionRepo().getVisionByStarshipId(request.starshipId);
        
        // Update vision in database
        await getVisionRepo().updateVision(request.starshipId, request.newVision);

        // Calculate metrics for the new vision
        const metrics = await getVisionMetricsCalculator().calculateMetrics(request.newVision, 0);

        const updateData: VisionUpdatedEventData = {
          starshipId: request.starshipId,
          userId: request.userId,
          sessionId: request.sessionId || '',
          oldVision: currentVision?.vision || '',
          newVision: request.newVision,
          metrics,
          refinementCount: 0,
          timestamp: new Date().toISOString(),
          updateSource: request.source || 'direct_update'
        };

        // Broadcast update
        const starshipRoom = `starship:${request.starshipId}`;
        socket.to(starshipRoom).emit('vision:updated', updateData);
        socket.emit('vision:updated', updateData);

        callback?.({ success: true });
        console.log(`[VISION] Direct update completed for starship ${request.starshipId}`);

      } catch (error) {
        console.error(`[VISION] Update error:`, error);
        callback?.({ success: false, error: 'Failed to update vision' });
      }
    });

    // Get vision state handler
    socket.on('vision:get-state', async (data, callback) => {
      try {
        const session = getVisionSessionManager().getSessionByUser(data.userId);
        if (!session || session.starshipId !== data.starshipId) {
          callback?.({ success: true, state: undefined });
          return;
        }

        const stateData: VisionRefinementState = {
          sessionId: session.sessionId,
          starshipId: session.starshipId,
          userId: session.userId,
          currentVision: session.currentVision,
          proposedVision: session.proposedVision,
          awaitingConfirmation: session.awaitingConfirmation,
          refinementCount: session.refinementCount,
          lastUpdate: session.lastActivity.toISOString(),
          isAnalyzing: false
        };

        callback?.({ success: true, state: stateData });

      } catch (error) {
        console.error(`[VISION] Get state error:`, error);
        callback?.({ success: false, error: 'Failed to get state' });
      }
    });

    // Vision room management
    socket.on('vision:join-starship-room', (data) => {
      if (data.userId === userId) {
        const starshipRoom = `starship:${data.starshipId}`;
        socket.join(starshipRoom);
        console.log(`[VISION] User ${userId} joined starship room: ${starshipRoom}`);
      }
    });

    socket.on('vision:leave-starship-room', (data) => {
      if (data.userId === userId) {
        const starshipRoom = `starship:${data.starshipId}`;
        socket.leave(starshipRoom);
        console.log(`[VISION] User ${userId} left starship room: ${starshipRoom}`);
      }
    });
  });
}