# Agent Messaging Fix - Ground Level Implementation Plan

## Root Cause Analysis

### 1. **Frontend Issues**
- ExpeditionChat passes `participantId` as the 3rd parameter to `sendMessage`
- useExpeditionChat expects `agentId` as the 3rd parameter but passes it as `agentId` in the request
- expeditionApi.sendMessage validates `messageType` as required but it's not being passed

### 2. **Backend Issues**  
- MessageService only routes to First Officer, even when `participantId` is an agent ID
- No actual agent message handling implementation
- Messages to agents are just prefixed with `@agentId:` and sent to First Officer

### 3. **Protocol Issues**
- SendMessageRequest has `participantId` but backend expects it to work differently
- No clear separation between participant routing and message type

## Implementation Plan

### Phase 1: Fix Client-Side Message Sending (30 minutes)

#### 1.1 Update expeditionApi.sendMessage
**File**: `packages/client/src/lib/expeditionApi.ts`

```typescript
sendMessage: async (
  starshipId: string,
  request: SendMessageRequest,
  options?: APIOptions  
): Promise<{ userMessage: ExpeditionMessage; participantMessage?: ExpeditionMessage }> => {
  // Only validate required fields - remove messageType
  validateRequest(request, ['expeditionId', 'content']);
  
  const response = await api.post(
    `/api/starships/${starshipId}/expeditions/${request.expeditionId}/messages`,
    {
      content: request.content,
      participantId: request.participantId, // This is the key field
      threadId: request.threadId,
      parentMessageId: request.parentMessageId,
      metadata: request.metadata
    }
  );
  
  // Return the actual response structure
  return response.data.data;
}
```

#### 1.2 Update useExpeditionChat hook
**File**: `packages/client/src/hooks/useExpeditionChat.ts`

```typescript
const sendMessage = useCallback(async (
  content: string,
  messageType: ExpeditionMessage['messageType'] = 'user-input',
  participantId?: string  // Accept participantId instead of agentId
) => {
  if (!content.trim() || !expeditionId || !starshipId) return;

  setSending(true);
  setError(null);

  try {
    // Send via API with participantId
    const response = await expeditionAPI.sendMessage(starshipId, {
      expeditionId,
      content: content.trim(),
      participantId // Use participantId, not agentId
    });

    // Handle the new response structure
    if (response.userMessage) {
      setMessages(prev => [...prev, response.userMessage]);
    }
    
    if (response.participantMessage) {
      setMessages(prev => [...prev, response.participantMessage]);
    }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
    setError(errorMessage);
    console.error('[EXPEDITION CHAT] Failed to send message:', err);
  } finally {
    setSending(false);
  }
}, [expeditionId, starshipId]);
```

#### 1.3 Update ExpeditionChat component
**File**: `packages/client/src/components/expeditions/ExpeditionChat.tsx`

```typescript
<MessageInput
  onSendMessage={async (content, participantId) => {
    // Pass participantId directly (undefined for First Officer)
    await sendMessage(content, 'user-input', participantId);
  }}
  agents={memoizedAvailableAgents.map(agent => ({
    id: agent.id,
    name: agent.name
  }))}
  disabled={sending || ['completed', 'cancelled'].includes(expedition.status)}
  placeholder={getPlaceholderText(expedition.status)}
/>
```

### Phase 2: Implement Agent Message Handler (1 hour)

#### 2.1 Add Agent Message Handler to MessageService
**File**: `packages/server/src/services/MessageService.ts`

Add this method after line 582:

```typescript
private async handleAgentMessage(
  expeditionId: string,
  agentId: string,
  content: string,
  userId: string
): Promise<{ reply: string; usage?: any }> {
  try {
    // 1. Get agent details from database
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.findById(agentId);
    
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // 2. Get expedition context
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const expedition = await expeditionRepo.findById(expeditionId);
    
    if (!expedition) {
      throw new Error(`Expedition ${expeditionId} not found`);
    }

    // 3. Get recent conversation history
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    const recentMessages = await messageRepo.findByExpedition(expeditionId);
    
    // Get last 10 messages for context
    const contextMessages = recentMessages
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-10);

    // 4. Build agent-specific prompt
    const systemPrompt = `You are ${agent.name}, a ${agent.category} specialist agent.

Your expertise includes: ${agent.skills?.join(', ') || 'General assistance'}

You are part of the expedition: "${expedition.title}"
Objective: ${expedition.objective}

Respond to the user's message in character as this specific agent. Be helpful, professional, and leverage your specialized knowledge.`;

    // 5. Prepare conversation for LLM
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...contextMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
      })),
      { role: 'user' as const, content }
    ];

    // 6. Generate response using LLM
    // For now, we'll use OpenAI through agent-engine
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    return {
      reply: completion.choices[0].message.content || 'I apologize, I was unable to generate a response.',
      usage: completion.usage
    };
  } catch (error) {
    logger.error('[MessageService] Error handling agent message:', error);
    throw error;
  }
}
```

#### 2.2 Update sendMessage to use agent handler
**File**: `packages/server/src/services/MessageService.ts`

Replace lines 125-178 with:

```typescript
// Route to participant
let participantMessage: ExpeditionMessage | undefined = undefined;

// Check if participantId is a valid UUID (specific agent) or 'first-officer'
const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(participantId);

if (participantId === 'first-officer' || !isValidUUID) {
  // Route to First Officer
  const response = await this.handleFirstOfficerMessage(
    request.expeditionId,
    request.content,
    'user-input',
    userId
  );

  if (response?.reply) {
    participantMessage = await messageRepo.create({
      expeditionId: request.expeditionId,
      role: 'first-officer',
      agentId: 'first-officer',
      content: response.reply,
      messageType: 'coordination',
      timestamp: new Date().toISOString(),
      threadId: request.threadId,
      parentMessageId: userMessage.id,
      metadata: { usage: response.usage }
    });
  }
} else {
  // Route to specific agent
  const response = await this.handleAgentMessage(
    request.expeditionId,
    participantId,
    request.content,
    userId
  );

  if (response?.reply) {
    participantMessage = await messageRepo.create({
      expeditionId: request.expeditionId,
      role: 'agent',
      agentId: participantId,
      content: response.reply,
      messageType: 'task-work',
      timestamp: new Date().toISOString(),
      threadId: request.threadId,
      parentMessageId: userMessage.id,
      metadata: { usage: response.usage }
    });
  }
}

return { userMessage, participantMessage };
```

### Phase 3: Add OpenAI Configuration (30 minutes)

#### 3.1 Add OpenAI dependency
**File**: `packages/server/package.json`

Add to dependencies:
```json
"openai": "^4.0.0"
```

#### 3.2 Add OpenAI API key to environment
**File**: `.env`

Add:
```
OPENAI_API_KEY=your-api-key-here
```

### Phase 4: Testing (30 minutes)

1. Start the development server
2. Create an expedition with agents
3. Send a message to First Officer - verify it works
4. Send a message to a specific agent - verify agent responds
5. Check message history shows correct roles and agent IDs

## Summary

This implementation:
1. ✅ Fixes the client to properly send `participantId`
2. ✅ Implements actual agent message handling
3. ✅ Routes messages to the correct handler based on participant
4. ✅ Generates agent-specific responses using their profile
5. ✅ Maintains conversation context

Total time: ~2.5 hours