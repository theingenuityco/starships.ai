/**
 * Streaming Routes
 *
 * Provides Server-Sent Events (SSE) endpoints for real-time conversation streaming
 * Following the layered architecture pattern established by conversations.ts
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StreamingService } from '@/services/StreamingService';
import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';

const router: Router = createRouter();

/**
 * GET /conversations/:conversationId/messages/stream - SSE streaming endpoint
 */
router.get('/conversations/:conversationId/messages/stream', jwtAuthMiddleware, (req: Request, res: Response): void => {
  const { conversationId } = req.params;
  const { streamId } = req.query;

  console.log(`🌊 [STREAMING] New SSE connection request:`, {
    conversationId,
    streamId,
    userId: req.user?.id,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });

  // Validate parameters
  if (!streamId || typeof streamId !== 'string') {
    res.status(400).json({
      error: {
        code: 'MISSING_STREAM_ID',
        message: 'streamId query parameter is required',
      },
    });
    return;
  }

  if (!conversationId) {
    res.status(400).json({
      error: {
        code: 'MISSING_CONVERSATION_ID',
        message: 'conversationId parameter is required',
      },
    });
    return;
  }

  try {
    // Initialize streaming service and add connection
    const streamingService = new StreamingService();

    // Set up the SSE connection
    streamingService.addConnection(streamId, res);

    console.log(`✅ [STREAMING] SSE connection established:`, {
      streamId,
      conversationId,
      userId: req.user?.id,
    });

    // Connection will be managed by StreamingService
    // Response headers and events are handled automatically
  } catch (error) {
    console.error(`❌ [STREAMING] Failed to establish SSE connection:`, {
      streamId,
      conversationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
    });

    res.status(500).json({
      error: {
        code: 'STREAMING_CONNECTION_FAILED',
        message: 'Failed to establish streaming connection',
        details: { streamId, conversationId },
      },
    });
  }
});

/**
 * GET /streaming/status - Get streaming service status
 */
router.get('/streaming/status', jwtAuthMiddleware, (req: Request, res: Response): void => {
  try {
    const streamingService = new StreamingService();

    const status = {
      activeConnections: streamingService.getActiveConnectionsCount(),
      activeStreams: streamingService.getActiveStreamIds(),
      timestamp: new Date().toISOString(),
    };

    res.json({
      data: status,
    });
  } catch (error) {
    console.error('[STREAMING] Failed to get streaming status:', error);
    res.status(500).json({
      error: {
        code: 'STREAMING_STATUS_ERROR',
        message: 'Failed to get streaming status',
      },
    });
  }
});

/**
 * DELETE /streaming/:streamId - Close specific stream
 */
router.delete('/streaming/:streamId', jwtAuthMiddleware, (req: Request, res: Response): void => {
  const { streamId } = req.params;

  try {
    const streamingService = new StreamingService();
    streamingService.closeStream(streamId);

    res.json({
      data: {
        streamId,
        status: 'closed',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`[STREAMING] Failed to close stream ${streamId}:`, error);
    res.status(500).json({
      error: {
        code: 'STREAM_CLOSE_ERROR',
        message: 'Failed to close stream',
        details: { streamId },
      },
    });
  }
});

export default router;
