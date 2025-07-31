import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { RepositoryFactory } from '@starships/models';
import type { Request, Response } from 'express';
import type { CreateMessageRequest, ChatMessage } from '@starships/protocol';

const router: Router = Router();

// Helper function for sending to n8n webhook
async function sendToN8nWebhook(payload: any): Promise<any> {
  const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/expedition-chat';
  const N8N_API_KEY = process.env.N8N_API_KEY;
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (N8N_API_KEY) {
    headers['Authorization'] = `Bearer ${N8N_API_KEY}`;
  }
  
  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`N8N webhook failed: ${response.statusText}`);
  }

  return response.json();
}

// Send a message to an expedition
router.post('/api/expeditions/:expeditionId/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const { content }: CreateMessageRequest = req.body;
    const userId = req.user!.id;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const messageRepo = RepositoryFactory.getMessageRepository();
    const starshipRepo = RepositoryFactory.getStarshipRepository();

    // Verify expedition exists and user has access
    const expedition = await expeditionRepo.findById(expeditionId);
    if (!expedition) {
      res.status(404).json({ error: 'Expedition not found' });
      return;
    }

    const starship = await starshipRepo.findById(expedition.starshipId);
    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Store user message
    const userMessage = await messageRepo.create({
      expeditionId,
      content,
      sender: 'user',
      senderName: 'Commander',
      timestamp: new Date().toISOString()
    });

    // Get context for AI response
    const agents = await expeditionRepo.getAssignedAgents(expeditionId);
    const chatHistory = await messageRepo.findByExpeditionId(expeditionId, { limit: 10 });

    // Select responding agent (for now, just pick first agent)
    const respondingAgent = agents[0];
    if (!respondingAgent) {
      res.status(400).json({ error: 'No agents assigned to this expedition' });
      return;
    }

    // Prepare webhook payload with ALL agents
    const webhookPayload = {
      expeditionId,
      message: content,
      agent: {
        id: respondingAgent.id,
        name: respondingAgent.name,
        description: respondingAgent.description
      },
      expedition: {
        name: expedition.name,
        description: expedition.description,
        status: expedition.status,
        agents: agents.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description
        }))
      },
      chatHistory: chatHistory.slice(0, -1).map(msg => ({ // Exclude the just-created message
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
    };

    // Send to n8n webhook
    const n8nResponse = await sendToN8nWebhook(webhookPayload);

    // Clean the message content by removing agent name prefix
    let cleanedContent = n8nResponse.message;
    // Remove [agent name]: prefix from the message
    cleanedContent = cleanedContent.replace(/^\[[^\]]+\]:\s*/, '');
    // Also remove transfer indicators like [Agent A → Agent B]
    cleanedContent = cleanedContent.replace(/^\[[^\]]+→[^\]]+\]\s*\n*/, '');
    
    // Extract agent name from response if available
    const agentNameMatch = n8nResponse.message.match(/^\[([^\]]+)\]:/);
    const actualAgentName = agentNameMatch ? agentNameMatch[1] : respondingAgent.name;

    // Store agent response with enhanced metadata
    const agentMessage = await messageRepo.create({
      expeditionId,
      content: cleanedContent,
      sender: 'agent',
      senderName: actualAgentName,
      timestamp: new Date().toISOString(),
      metadata: {
        agentId: respondingAgent.id,
        workflowId: n8nResponse.workflowId,
        agentReady: n8nResponse.agentReady || false,
        missionStatus: n8nResponse.missionStatus || 'gathering_requirements',
        shouldTerminateChat: n8nResponse.shouldTerminateChat || false,
        isExecuting: n8nResponse.isExecuting || false,
        originalMessage: n8nResponse.message // Keep original for debugging
      }
    });

    res.json({ userMessage, agentMessage });
  } catch (error) {
    console.error('Failed to process message:', error);
    res.status(500).json({ 
      error: 'Failed to process message',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get expedition messages
router.get('/api/expeditions/:expeditionId/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const messageRepo = RepositoryFactory.getMessageRepository();
    const starshipRepo = RepositoryFactory.getStarshipRepository();

    // Verify expedition exists and user has access
    const expedition = await expeditionRepo.findById(expeditionId);
    if (!expedition) {
      res.status(404).json({ error: 'Expedition not found' });
      return;
    }

    const starship = await starshipRepo.findById(expedition.starshipId);
    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get messages
    const messages = await messageRepo.findByExpeditionId(expeditionId);
    
    // If no messages exist, trigger n8n to generate initial greeting
    if (messages.length === 0) {
      const agents = await expeditionRepo.getAssignedAgents(expeditionId);
      
      if (agents.length > 0) {
        const respondingAgent = agents[0];
        
        // Prepare webhook payload for initial greeting
        const webhookPayload = {
          expeditionId,
          message: "[SYSTEM_INITIAL_GREETING]", // Special marker for n8n
          agent: {
            id: respondingAgent.id,
            name: respondingAgent.name,
            description: respondingAgent.description
          },
          expedition: {
            name: expedition.name,
            description: expedition.description,
            status: expedition.status,
            agents: agents.map(a => ({
              id: a.id,
              name: a.name,
              description: a.description
            }))
          },
          chatHistory: []
        };
        
        try {
          // Send to n8n webhook
          const n8nResponse = await sendToN8nWebhook(webhookPayload);
          
          // Clean and store the greeting message
          let cleanedContent = n8nResponse.message;
          cleanedContent = cleanedContent.replace(/^\[[^\]]+\]:\s*/, '');
          cleanedContent = cleanedContent.replace(/^\[[^\]]+→[^\]]+\]\s*\n*/, '');
          
          const agentNameMatch = n8nResponse.message.match(/^\[([^\]]+)\]:/);
          const actualAgentName = agentNameMatch ? agentNameMatch[1] : respondingAgent.name;
          
          // Store agent greeting
          const greetingMessage = await messageRepo.create({
            expeditionId,
            content: cleanedContent,
            sender: 'agent',
            senderName: actualAgentName,
            timestamp: new Date().toISOString(),
            metadata: {
              agentId: respondingAgent.id,
              isInitialGreeting: true,
              workflowId: n8nResponse.workflowId
            }
          });
          
          res.json({ messages: [greetingMessage] });
          return;
        } catch (error) {
          console.error('Failed to get initial greeting:', error);
          // If greeting fails, just return empty messages
          res.json({ messages: [] });
          return;
        }
      }
    }
    
    res.json({ messages });
  } catch (error) {
    console.error('Failed to get messages:', error);
    res.status(500).json({ 
      error: 'Failed to get messages',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;