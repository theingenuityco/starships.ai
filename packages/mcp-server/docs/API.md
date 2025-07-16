# MCP Server API Documentation

## Overview

The MCP (Model Context Protocol) Server provides a comprehensive system for managing user-specific tool containers, enabling agents to execute tools in isolated Docker environments with granular permissions and agent-specific credentials.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────────┐
│   User A        │───▶│   Backend API    │───▶│    User A MCP Container         │
│                 │    │                  │    │  ┌─────────────────────────────┐│
│ Agent 1 (Support)   │   - Validates    │    │  │ Tools + Agent Credentials:  ││
│   ✅ email_sender│    │   - Creates      │    │  │ • email_sender              ││
│     📧 support@ │    │     Container    │    │  │   - support@company.com     ││
│   ✅ crm_connector    │   - Sets Agent   │    │  │   - sales@company.com       ││
│     🔑 support_key    │     Permissions  │    │  │   - marketing@company.com   ││
│                 │    │   - Injects      │    │  │ • crm_connector             ││
│ Agent 2 (Sales) │    │     Credentials  │    │  │   - support_crm_key_123     ││
│   ✅ email_sender│    │                  │    │  │   - sales_crm_key_456       ││
│     📧 sales@   │    │                  │    │  │ • web_scraper               ││
│   ✅ crm_connector    │                  │    │  └─────────────────────────────┘│
│     🔑 sales_key│    │                  │    │                                 │
│                 │    │                  │    │  Container Isolation:           │
│ Agent 3 (Marketing)  │                  │    │  - Memory: 512MB limit         │
│   ✅ email_sender│    │                  │    │  - CPU: 0.5 limit              │
│     📧 marketing@     │                  │    │  - Network: Isolated           │
│   ✅ web_scraper│    │                  │    │  - Process: 100 limit           │
└─────────────────┘    └──────────────────┘    └─────────────────────────────────┘
```

## Core Components

### 1. UserContainerManager

Manages Docker containers for individual users with security isolation.

#### Key Features:
- **Container-per-user**: Each user gets their own isolated Docker container
- **Security**: Resource limits, capability dropping, network isolation
- **Lifecycle Management**: Create, monitor, restart, cleanup containers
- **Tool Execution**: Execute tools within user containers

### 2. ToolRegistry

Manages tool definitions and executors for the MCP system.

#### Key Features:
- **Built-in Tools**: Pre-configured tools (web_scraper, file_reader, data_analyzer, email_sender)
- **User Tools**: Custom tools registered per user
- **Tool Executors**: Execution logic for each tool type
- **Tool Validation**: Parameter validation and permission checks

### 3. SecurityManager

Handles encryption, validation, and security policies.

#### Key Features:
- **Credential Encryption**: AES encryption for sensitive data
- **Request Validation**: Input sanitization and dangerous content filtering
- **Rate Limiting**: Per-user and per-tool execution limits
- **Audit Logging**: Comprehensive logging of all MCP operations

## API Endpoints

### Container Management

#### POST `/api/mcp/configure`
Configure MCP server for a user with tools and agent permissions.

**Request Body:**
```json
{
  "userId": "user123",
  "tools": [
    {
      "name": "web_scraper",
      "description": "Scrape web content",
      "parameters": {
        "url": { "type": "string", "required": true },
        "selector": { "type": "string", "required": false }
      },
      "permissions": ["web_access"],
      "category": "data"
    }
  ],
  "agentPermissions": {
    "agent1": ["web_scraper"],
    "agent2": ["web_scraper", "email_sender"]
  },
  "agentToolCredentials": {
    "agent1": {
      "web_scraper": { "apiKey": "agent1_key" }
    },
    "agent2": {
      "email_sender": {
        "smtpHost": "smtp.company.com",
        "username": "agent2@company.com",
        "password": "encrypted_password"
      }
    }
  },
  "limits": {
    "memory": "512m",
    "cpu": "0.5",
    "timeout": 30000
  }
}
```

**Response:**
```json
{
  "success": true,
  "serverId": "mcp-server-user123",
  "containerId": "container-abc123",
  "toolsRegistered": 1,
  "agentsConfigured": 2
}
```

#### GET `/api/mcp/status/:userId`
Get MCP server status for a user.

**Response:**
```json
{
  "serverId": "mcp-server-user123",
  "status": "running",
  "containerInfo": {
    "id": "container-abc123",
    "status": "running",
    "uptime": 3600,
    "resourceUsage": {
      "memory": "128MB",
      "cpu": "15%"
    }
  },
  "availableTools": ["web_scraper", "email_sender"],
  "lastActivity": "2024-01-01T12:00:00.000Z"
}
```

### Tool Execution

#### POST `/api/mcp/tools/execute`
Execute a tool with agent-specific permissions and credentials.

**Request Body:**
```json
{
  "id": "tool-call-123",
  "toolName": "web_scraper",
  "parameters": {
    "url": "https://example.com",
    "selector": ".content"
  },
  "agentId": "agent1",
  "userId": "user123",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Response:**
```json
{
  "id": "tool-result-123",
  "toolCallId": "tool-call-123",
  "success": true,
  "result": {
    "url": "https://example.com",
    "content": "Scraped content...",
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  "executionTime": 1500,
  "timestamp": "2024-01-01T12:00:01.500Z",
  "logs": ["Scraped https://example.com"]
}
```

### Permission Management

#### GET `/api/mcp/agents/:agentId/permissions`
Get tool permissions for an agent.

**Response:**
```json
{
  "agentId": "agent1",
  "permissions": [
    {
      "toolName": "web_scraper",
      "granted": true,
      "grantedAt": "2024-01-01T10:00:00.000Z"
    },
    {
      "toolName": "email_sender",
      "granted": false
    }
  ]
}
```

#### POST `/api/mcp/agents/:agentId/permissions`
Grant or revoke tool permissions for an agent.

**Request Body:**
```json
{
  "toolName": "email_sender",
  "granted": true
}
```

### Credential Management

#### POST `/api/mcp/agents/:agentId/credentials`
Set agent-specific tool credentials.

**Request Body:**
```json
{
  "toolName": "email_sender",
  "credentials": {
    "smtpHost": "smtp.company.com",
    "username": "agent1@company.com",
    "password": "secure_password"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Credentials updated for agent1 tool email_sender"
}
```

## Built-in Tools

### 1. Web Scraper (`web_scraper`)

**Description:** Scrape content from web pages

**Parameters:**
- `url` (string, required): URL to scrape
- `selector` (string, optional): CSS selector for content
- `timeout` (number, optional): Request timeout in milliseconds (default: 30000)

**Permissions:** `["web_access"]`

**Example Result:**
```json
{
  "url": "https://example.com",
  "content": "Scraped content...",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 2. File Reader (`file_reader`)

**Description:** Read and process files

**Parameters:**
- `file_path` (string, required): Path to file
- `encoding` (string, optional): File encoding (default: "utf-8")

**Permissions:** `["file_access"]`

**Example Result:**
```json
{
  "file_path": "/path/to/file.txt",
  "content": "File content...",
  "size": 1024,
  "encoding": "utf-8"
}
```

### 3. Data Analyzer (`data_analyzer`)

**Description:** Analyze structured data

**Parameters:**
- `data` (object, required): Data to analyze
- `analysis_type` (string, required): Type of analysis to perform

**Permissions:** `["data_processing"]`

**Example Result:**
```json
{
  "analysis_type": "statistical",
  "summary": "Data analysis completed",
  "insights": ["Insight 1", "Insight 2"],
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 4. Email Sender (`email_sender`)

**Description:** Send emails via SMTP

**Parameters:**
- `to` (string, required): Recipient email
- `subject` (string, required): Email subject
- `body` (string, required): Email body
- `smtp_host` (string, required): SMTP server host
- `smtp_port` (number, optional): SMTP port (default: 587)
- `username` (string, required): SMTP username
- `password` (string, required): SMTP password

**Permissions:** `["email_access"]`

**Example Result:**
```json
{
  "to": "recipient@example.com",
  "subject": "Test Email",
  "message_id": "msg-1234567890",
  "sent_at": "2024-01-01T12:00:00.000Z"
}
```

## Security Features

### Container Security
- **Resource Limits**: Memory, CPU, and process limits
- **Capability Dropping**: Remove all Linux capabilities by default
- **Network Isolation**: Containers run with no network access by default
- **Read-only Root**: Filesystem protection
- **Tmpfs Mounts**: Temporary storage with size limits

### Credential Security
- **AES Encryption**: All credentials encrypted at rest
- **Agent-specific**: Different credentials per agent for same tool
- **Secure Storage**: Encrypted credentials in Neo4j database
- **Audit Logging**: All credential operations logged

### Request Security
- **Input Validation**: Comprehensive parameter validation
- **Rate Limiting**: Per-user and per-tool execution limits
- **Content Filtering**: Dangerous content detection and blocking
- **Authentication**: JWT-based authentication for all endpoints

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "error": "Invalid request",
  "message": "Missing required parameter: url",
  "code": "INVALID_PARAMETERS"
}
```

#### 403 Forbidden
```json
{
  "error": "Permission denied",
  "message": "Agent agent1 does not have permission to use tool email_sender",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

#### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many tool executions. Try again in 60 seconds.",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Container creation failed: Docker error",
  "code": "CONTAINER_ERROR"
}
```

## Socket.IO Events

### Client to Server Events

#### `mcp:configure`
Configure MCP server for user.

#### `mcp:tool-execute`
Execute a tool with real-time feedback.

#### `mcp:health-check`
Check MCP server health status.

### Server to Client Events

#### `mcp:configuration-result`
Result of MCP configuration.

#### `mcp:tool-result`
Tool execution result.

#### `mcp:tool-stream`
Real-time tool execution progress.

#### `mcp:status-update`
MCP server status updates.

#### `mcp:container-logs`
Container logs streaming.

## Development

### Running Tests
```bash
cd packages/mcp-server
pnpm test
```

### Test Coverage
- **UserContainerManager**: 80.46% coverage
- **ToolRegistry**: 90.38% coverage
- **Overall**: 60.72% coverage

### Adding Custom Tools

1. **Register Tool Configuration:**
```typescript
const customTool: MCPToolConfig = {
  name: 'custom_analyzer',
  description: 'Custom data analysis tool',
  parameters: {
    data: { type: 'object', required: true },
    options: { type: 'object', required: false }
  },
  permissions: ['custom_access'],
  category: 'analysis'
};
```

2. **Implement Tool Executor:**
```typescript
private async executeCustomAnalyzer(params: Record<string, any>): Promise<ToolExecutorResult> {
  // Custom tool implementation
  return {
    success: true,
    result: { /* custom result */ },
    logs: ['Custom analysis completed']
  };
}
```

3. **Register with ToolRegistry:**
```typescript
await toolRegistry.registerUserTools(userId, [customTool]);
```

## Monitoring

### Health Checks
- Container status monitoring
- Resource usage tracking
- Tool execution metrics
- Error rate monitoring

### Logging
- Structured logging with timestamps
- Tool execution audit trails
- Security event logging
- Performance metrics

### Metrics
- Tool execution count
- Container resource usage
- Error rates by tool
- Agent activity patterns