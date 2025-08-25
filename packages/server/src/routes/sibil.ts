import { Router } from 'express';
import type { SibilRequest, SibilStreamChunk } from '@starships/protocol';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { SibilService } from '../services/SibilService';

const router: Router = Router();

// Validation middleware for Sibil requests
const validateSibilRequest = (req: Request, res: Response, next: any) => {
  const { provider, message } = req.body;

  if (!provider || !['openai', 'anthropic'].includes(provider)) {
    res.status(400).json({ error: 'provider must be "openai" or "anthropic"' });
    return;
  }

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required and must be a string' });
    return;
  }

  // Note: user_id is now derived from the authenticated user (req.user)
  // and does not need to be provided by the client

  next();
};

router.post('/chat', authMiddleware, validateSibilRequest, async (req, res) => {
  try {
    // Build Sibil request using authenticated user ID from middleware
    const sibilRequest: SibilRequest = {
      provider: req.body.provider,
      model: req.body.model,
      message: req.body.message,
      user_id: req.user!.id, // Use authenticated user ID, not client-provided
      session_id: req.body.session_id,
    };

    console.log(`[SIBIL] Processing message for authenticated user: ${req.user!.id} with provider: ${sibilRequest.provider}`);

    const result = await SibilService.chat(sibilRequest);

    res.json(result);
  } catch (err) {
    console.error('Sibil chat error:', err);
    const statusCode = (err as Error).message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: (err as Error).message });
  }
});

// NEW: Streaming endpoint
// Preview endpoint - quick message preview without full chat context
// Note: No auth required as this is used in pre-auth onboarding flow
router.post('/preview', async (req, res) => {
  try {
    const { message, provider = 'openai' } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required and must be a string' });
      return;
    }

    // For preview, we'll return a simple acknowledgment
    // In production, this would generate a quick preview response
    const previewResponse = {
      success: true,
      preview: {
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        provider,
        estimated_tokens: Math.ceil(message.split(' ').length * 1.3),
        ready: true
      }
    };

    res.json(previewResponse);
  } catch (err) {
    console.error('Sibil preview error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/chat/stream', authMiddleware, validateSibilRequest, async (req, res) => {
  try {
    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const sibilRequest: SibilRequest = {
      provider: req.body.provider,
      model: req.body.model,
      message: req.body.message,
      user_id: req.user!.id,
      session_id: req.body.session_id,
    };

    console.log(`[SIBIL STREAM] Starting stream for user: ${req.user!.id} with provider: ${sibilRequest.provider}`);

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: 'connected', stream_id: Date.now().toString() })}\n\n`);

    // Stream the response
    for await (const chunk of SibilService.chatStream(sibilRequest)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      
      if (chunk.is_final) {
        break;
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error('Sibil streaming error:', err);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: (err as Error).message,
      is_final: true
    })}\n\n`);
    res.end();
  }
});

export default router;