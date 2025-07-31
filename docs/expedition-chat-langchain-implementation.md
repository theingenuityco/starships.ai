# Expedition Chat - LangChain Implementation Plan

## Overview
Replace n8n webhook with direct LangChain integration for better performance and industry-standard approach.

## Architecture

```
User Message → API → LangChain Agent → LLM → Response → Store → Client
                         ↑
                    Context (Expedition, Agents, History)
```

## Implementation Plan

### 1. Install Dependencies

```bash
# Server dependencies
npm install langchain @langchain/openai @langchain/anthropic zod
```

### 2. Create LangChain Service

```typescript
// packages/server/src/services/ExpeditionChatService.ts
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { 
  ChatPromptTemplate, 
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate 
} from '@langchain/core/prompts';
import { 
  AIMessage, 
  HumanMessage, 
  SystemMessage 
} from '@langchain/core/messages';
import { RepositoryFactory } from '@starships/models';
import type { ChatMessage, Agent, Expedition } from '@starships/protocol';

export class ExpeditionChatService {
  private llm: ChatOpenAI | ChatAnthropic;

  constructor() {
    // Use OpenAI by default, can switch to Anthropic
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4-turbo-preview',
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
      streaming: true // Enable streaming for better UX
    });

    // Alternative: Use Anthropic
    // this.llm = new ChatAnthropic({
    //   modelName: 'claude-3-opus-20240229',
    //   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    //   temperature: 0.7
    // });
  }

  async processMessage(
    expeditionId: string, 
    content: string,
    userId: string
  ): Promise<{ userMessage: ChatMessage; agentMessage: ChatMessage }> {
    const messageRepo = RepositoryFactory.getMessageRepository();
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();

    // 1. Store user message
    const userMessage = await messageRepo.create({
      expeditionId,
      content,
      sender: 'user',
      senderName: 'Commander',
      timestamp: new Date().toISOString()
    });

    // 2. Get context
    const [expedition, agents, chatHistory] = await Promise.all([
      expeditionRepo.findById(expeditionId),
      expeditionRepo.getAssignedAgents(expeditionId),
      messageRepo.findByExpeditionId(expeditionId, { limit: 10 })
    ]);

    if (!expedition) throw new Error('Expedition not found');
    if (agents.length === 0) throw new Error('No agents assigned');

    const agent = agents[0]; // For now, use first agent

    // 3. Build conversation chain
    const chain = await this.buildConversationChain(
      agent,
      expedition,
      chatHistory.slice(0, -1) // Exclude the just-created message
    );

    // 4. Get AI response
    const response = await chain.invoke({
      input: content
    });

    // 5. Store agent response
    const agentMessage = await messageRepo.create({
      expeditionId,
      content: response.content,
      sender: 'agent',
      senderName: agent.name,
      timestamp: new Date().toISOString(),
      metadata: {
        agentId: agent.id,
        model: this.llm.modelName
      }
    });

    return { userMessage, agentMessage };
  }

  private async buildConversationChain(
    agent: Agent,
    expedition: Expedition,
    chatHistory: ChatMessage[]
  ) {
    // Create the prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(
        `You are {agentName}, an AI agent with the following description: {agentDescription}.
        
You are part of an expedition: {expeditionName} - {expeditionDescription}.

Your goal is to understand the mission requirements through conversation. Once you have all the information needed and the user has answered all your clarifying questions, respond with 'I am ready to execute the mission.'

Be helpful, stay in character, and ask clarifying questions when needed.`
      ),
      new MessagesPlaceholder('chatHistory'),
      HumanMessagePromptTemplate.fromTemplate('{input}')
    ]);

    // Convert chat history to LangChain messages
    const messages = chatHistory.map(msg => {
      if (msg.sender === 'user') {
        return new HumanMessage(msg.content);
      } else {
        return new AIMessage(msg.content);
      }
    });

    // Create the chain
    const chain = prompt.pipe(this.llm);

    // Bind the context
    return chain.bind({
      agentName: agent.name,
      agentDescription: agent.description || 'A helpful AI assistant',
      expeditionName: expedition.name,
      expeditionDescription: expedition.description || 'An important mission',
      chatHistory: messages
    });
  }

  // Optional: Stream responses for better UX
  async streamMessage(
    expeditionId: string,
    content: string,
    userId: string,
    onChunk: (chunk: string) => void
  ): Promise<ChatMessage> {
    // Similar setup as above...
    const [expedition, agents, chatHistory] = await this.getContext(expeditionId);
    
    const chain = await this.buildConversationChain(
      agents[0],
      expedition,
      chatHistory
    );

    let fullResponse = '';
    
    // Stream the response
    const stream = await chain.stream({
      input: content
    });

    for await (const chunk of stream) {
      fullResponse += chunk.content;
      onChunk(chunk.content); // Send chunk to client
    }

    // Store complete message
    const messageRepo = RepositoryFactory.getMessageRepository();
    return await messageRepo.create({
      expeditionId,
      content: fullResponse,
      sender: 'agent',
      senderName: agents[0].name,
      timestamp: new Date().toISOString()
    });
  }

  private async getContext(expeditionId: string) {
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const messageRepo = RepositoryFactory.getMessageRepository();

    return Promise.all([
      expeditionRepo.findById(expeditionId),
      expeditionRepo.getAssignedAgents(expeditionId),
      messageRepo.findByExpeditionId(expeditionId, { limit: 10 })
    ]);
  }
}
```

### 3. Update Message Routes

```typescript
// packages/server/src/routes/messages.ts
import { ExpeditionChatService } from '../services/ExpeditionChatService';

const chatService = new ExpeditionChatService();

// Replace the webhook handler with direct LangChain call
router.post('/api/expeditions/:expeditionId/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const { content }: CreateMessageRequest = req.body;
    const userId = req.user!.id;

    // Validate access...

    // Use LangChain service instead of webhook
    const result = await chatService.processMessage(
      expeditionId,
      content,
      userId
    );

    res.json(result);
  } catch (error) {
    console.error('Failed to process message:', error);
    res.status(500).json({ 
      error: 'Failed to process message',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

### 4. Advanced Features (Optional)

#### A. Add Streaming Support

```typescript
// Add WebSocket or Server-Sent Events for streaming
router.post('/api/expeditions/:expeditionId/messages/stream', authMiddleware, async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const { content } = req.body;

  await chatService.streamMessage(
    expeditionId,
    content,
    userId,
    (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
  );

  res.write('data: [DONE]\n\n');
  res.end();
});
```

#### B. Add Memory (Conversation Summary)

```typescript
import { ConversationSummaryMemory } from 'langchain/memory';
import { ChatMessageHistory } from 'langchain/stores/message/in_memory';

// Add to ExpeditionChatService
private async getMemory(expeditionId: string) {
  const history = new ChatMessageHistory();
  const messages = await this.messageRepo.findByExpeditionId(expeditionId);
  
  for (const msg of messages) {
    if (msg.sender === 'user') {
      await history.addUserMessage(msg.content);
    } else {
      await history.addAIMessage(msg.content);
    }
  }

  return new ConversationSummaryMemory({
    llm: this.llm,
    chatHistory: history,
    returnMessages: true
  });
}
```

#### C. Add Function Calling (Tool Use)

```typescript
import { DynamicTool } from '@langchain/core/tools';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';

// Define tools the agent can use
const tools = [
  new DynamicTool({
    name: 'check_expedition_status',
    description: 'Check the current status of the expedition',
    func: async (input: string) => {
      // Implementation
      return 'Expedition is currently in planning phase';
    }
  }),
  new DynamicTool({
    name: 'list_required_resources',
    description: 'List resources needed for the mission',
    func: async (input: string) => {
      return 'Required: 2 scouts, 1 scientist, navigation equipment';
    }
  })
];

// Create agent with tools
const agent = await createOpenAIFunctionsAgent({
  llm: this.llm,
  tools,
  prompt
});

const agentExecutor = new AgentExecutor({
  agent,
  tools
});
```

### 5. Frontend Updates (Optional Streaming)

```typescript
// Update ExpeditionChat for streaming
const handleSendWithStreaming = async () => {
  const response = await fetch(`/api/expeditions/${expeditionId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: messageContent })
  });

  const reader = response.body?.getReader();
  let agentMessage = '';

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    
    const text = new TextDecoder().decode(value);
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        agentMessage += data.chunk;
        // Update UI with streaming content
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = agentMessage;
          return newMessages;
        });
      }
    }
  }
};
```

## Benefits of LangChain Approach

1. **Industry Standard**: Used by many AI startups
2. **Flexibility**: Easy to switch LLM providers
3. **Built-in Features**: Memory, streaming, function calling
4. **Better Performance**: Direct API calls, no webhook overhead
5. **Extensibility**: Easy to add RAG, agents, tools
6. **Type Safety**: Full TypeScript support

## Migration Steps

1. Install dependencies
2. Create ExpeditionChatService
3. Update message routes to use service
4. Remove n8n webhook code
5. Test the implementation
6. (Optional) Add streaming for better UX

This approach is much more aligned with what competitors are doing and provides a better foundation for future features.