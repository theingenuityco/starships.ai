import { Router } from 'express';
import { chatWithMCP as agentChat } from '@starships/agent-engine';
import type { ChatRequest } from '@starships/protocol';
import type { Request, Response } from 'express';
import getStore from '../store';
import { authMiddleware } from '../middleware/auth';
import { AgentService } from '../services/AgentService';

const router: Router = Router();

// Validation middleware for chat requests
const validateChatRequest = (req: Request, res: Response, next: any) => {
  const { agent_id, message } = req.body;

  if (!agent_id || typeof agent_id !== 'string') {
    res.status(400).json({ error: 'agent_id is required and must be a string' });
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

router.post('/', authMiddleware, validateChatRequest, async (req, res) => {
  try {
    // Build chat request using authenticated user ID from middleware
    const chatRequest: ChatRequest = {
      agent_id: req.body.agent_id,
      user_id: req.user!.id, // Use authenticated user ID, not client-provided
      message: req.body.message,
      stream: false,
    };

    console.log(`[CHAT] Processing message for authenticated user: ${req.user!.id}`);

    const store = getStore();
    const result = await agentChat(chatRequest, store);

    // Track agent usage after successful chat
    try {
      await AgentService.trackUsage(chatRequest.agent_id, chatRequest.user_id);
      console.log(`[ANALYTICS] Tracked usage for agent: ${chatRequest.agent_id}`);
    } catch (trackingError) {
      // Don't fail the chat request if usage tracking fails
      console.warn('Failed to track agent usage:', trackingError);
    }

    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    const statusCode = (err as Error).message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: (err as Error).message });
  }
});

// DELETE endpoint for memory management
router.delete('/:sessionKey/memory', authMiddleware, async (req, res) => {
  try {
    const { sessionKey } = req.params;

    if (!sessionKey) {
      res.status(400).json({ error: 'sessionKey is required' });
      return;
    }

    const store = getStore();
    await store.clear(sessionKey);
    res.json({ message: 'Memory cleared successfully' });
  } catch (err) {
    console.error('Memory clear error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
