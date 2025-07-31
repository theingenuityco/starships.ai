# N8N LangChain Setup Guide

## Prerequisites
Before using the LangChain-enhanced workflow, you need to install LangChain packages in your n8n instance.

## Installation Steps

### Option 1: Docker Setup (Recommended)

1. Create a custom Dockerfile:

```dockerfile
FROM n8nio/n8n:latest

# Install LangChain packages
RUN cd /usr/local/lib/node_modules/n8n && \
    npm install @langchain/openai @langchain/core langchain

# Set environment variable
ENV NODE_FUNCTION_ALLOW_EXTERNAL=@langchain/openai,@langchain/core,langchain
```

2. Build and run:
```bash
docker build -t n8n-langchain .
docker run -it --rm \
  --name n8n-langchain \
  -p 5678:5678 \
  -e OPENAI_API_KEY=your-openai-key \
  -v ~/.n8n:/home/node/.n8n \
  n8n-langchain
```

### Option 2: NPM Setup (Local Installation)

1. Navigate to your n8n installation directory:
```bash
# For global installation
cd $(npm root -g)/n8n

# For local installation
cd ./node_modules/n8n
```

2. Install LangChain packages:
```bash
npm install @langchain/openai @langchain/core langchain
```

3. Set environment variable before starting n8n:
```bash
export NODE_FUNCTION_ALLOW_EXTERNAL=@langchain/openai,@langchain/core,langchain
export OPENAI_API_KEY=your-openai-key
n8n start
```

### Option 3: n8n Cloud
If using n8n cloud, you'll need to use the HTTP Request node to call your own API that uses LangChain, as n8n cloud doesn't allow custom package installation.

## Workflow Import Instructions

1. **Open n8n** at http://localhost:5678

2. **Import Workflow**:
   - Go to Workflows → Add Workflow → Import from File
   - Select `n8n-expedition-chat-langchain-workflow.json`

3. **Configure Environment**:
   - Ensure `OPENAI_API_KEY` is set in your environment
   - The workflow will automatically use this key

4. **Test the Workflow**:
   - Click "Execute Workflow" 
   - Use the test webhook URL or production URL

## Features of LangChain Integration

### 1. **Better Conversation Management**
- Proper message history handling
- System/User/AI message separation
- Context-aware responses

### 2. **Agent State Tracking**
- Detects when agent is ready ("I am ready to execute the mission")
- Branches workflow based on readiness
- Tracks conversation progress

### 3. **Enhanced Prompting**
- Structured prompt templates
- Clear mission objectives
- Information gathering checklist

### 4. **Error Handling**
- Graceful error messages
- Fallback responses
- Error logging

## Backend Updates Required

Update your message route to handle the new response format:

```typescript
// In packages/server/src/routes/messages.ts
async function sendToN8nWebhook(payload: any): Promise<any> {
  // ... existing code ...
  
  const n8nResponse = await response.json();
  
  // Handle new response format
  return {
    message: n8nResponse.message,
    workflowId: n8nResponse.workflowId,
    agentReady: n8nResponse.agentReady || false,
    missionStatus: n8nResponse.missionStatus || 'gathering_requirements'
  };
}
```

## Advantages Over Basic N8N

1. **Industry Standard**: Uses LangChain like major AI companies
2. **Better Context**: Proper message history management
3. **Extensible**: Easy to add memory, tools, agents
4. **Type Safety**: Structured message formats
5. **Mission Tracking**: Knows when ready to execute

## Troubleshooting

### "Cannot find module '@langchain/openai'"
- Ensure packages are installed in n8n's node_modules
- Check NODE_FUNCTION_ALLOW_EXTERNAL environment variable

### "Invalid API Key"
- Verify OPENAI_API_KEY is set correctly
- Check if key has access to GPT-4

### "Workflow times out"
- Increase webhook timeout in n8n settings
- Check OpenAI API status

## Next Steps

1. **Add Memory** (optional):
   - Conversation summaries for long chats
   - Persistent agent memory

2. **Add Tools** (optional):
   - Let agents query expedition status
   - Access to knowledge base
   - Mission planning tools

3. **Add Streaming** (optional):
   - Real-time response streaming
   - Better user experience