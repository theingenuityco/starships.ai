import { Router } from "express";
import { chat as agentChat } from "@starships/agent-engine";
import type { ChatRequest } from "@starships/protocol";
import store from "../store";

const router: Router = Router();

// Validation middleware for chat requests
const validateChatRequest = (req: any, res: any, next: any) => {
  const { agent_id, user_id, message } = req.body;
  
  if (!agent_id || typeof agent_id !== 'string') {
    return res.status(400).json({ error: 'agent_id is required and must be a string' });
  }
  
  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'user_id is required and must be a string' });
  }
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required and must be a string' });
  }
  
  next();
};

router.post("/", validateChatRequest, async (req, res) => {
  try {
    const body = req.body as ChatRequest;
    const result = await agentChat(body, store);
    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    const statusCode = (err as Error).message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: (err as Error).message });
  }
});

// DELETE endpoint for memory management
router.delete("/:sessionKey/memory", async (req: any, res: any) => {
  try {
    const { sessionKey } = req.params;
    
    if (!sessionKey) {
      return res.status(400).json({ error: 'sessionKey is required' });
    }
    
    await store.clear(sessionKey);
    res.json({ message: 'Memory cleared successfully' });
  } catch (err) {
    console.error('Memory clear error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router; 