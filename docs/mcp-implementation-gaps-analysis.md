# MCP Implementation Gaps Analysis & Revised Master Plan

## 🔍 **Live Codebase Analysis - VERIFIED STATUS**

After comprehensive codebase verification (Updated: 2025-07-15 20:05 UTC), here's the confirmed current state:

### 📊 **LIVE STATUS SUMMARY - VERIFIED**
- **Overall MCP Implementation**: ❌ **0% Complete** - No MCP components implemented
- **Docker Dependencies**: ❌ **Missing** - [`packages/server/package.json`](packages/server/package.json:26) ends without `dockerode`
- **MCP Server Package**: ❌ **Not Created** - No `packages/mcp-server/` directory exists
- **Database Schema**: ❌ **Missing** - [`connection.ts`](packages/models/src/connection.ts:122-133) only has basic constraints
- **API Endpoints**: ❌ **Missing** - No MCP routes in server (only agents, chat, sibil routes exist)
- **MCP Services**: ❌ **Missing** - [`packages/server/src/services/`](packages/server/src/services) only contains: AgentService.ts, SibilService.ts, SocketIOService.ts, UserService.ts
- **Protocol Types**: ❌ **Missing** - [`protocol/src/index.ts`](packages/protocol/src/index.ts:1-313) has no MCP interfaces
- **Agent Integration**: ❌ **Missing** - No MCP integration in agent-engine package

### 🚨 **CRITICAL BLOCKERS VERIFIED**
1. **No MCP Server Package**: The planned `packages/mcp-server/` directory doesn't exist
2. **Missing Docker Integration**: [`packages/server/package.json`](packages/server/package.json:14-26) lacks `dockerode` dependency
3. **No MCP Database Schema**: [`connection.ts`](packages/models/src/connection.ts:122-133) missing all MCP-related constraints/indexes
4. **No MCP Routes**: Server routes directory has no `mcp.ts` file
5. **No MCP Service**: [`packages/server/src/services/`](packages/server/src/services) has no `MCPService.ts`
6. **No MCP Types**: [`protocol/src/index.ts`](packages/protocol/src/index.ts:1-313) missing all MCP interfaces
7. **Agent Engine Gap**: No MCP integration hooks in agent-engine package

### ✅ **Existing Strengths**

1. **Solid Foundation**
   - Neo4j database with comprehensive models and schema management
   - Agent system with LangChain integration and streaming support
   - Socket.IO real-time communication with authentication
   - Docker support (Neo4j + server containers)
   - Kinde JWT authentication middleware
   - Existing MCP interfaces in vision-chamber (placeholder)

2. **Agent Infrastructure**
   - [`AgentService`](packages/server/src/services/AgentService.ts) with full CRUD operations
   - [`ProviderFactory`](packages/agent-engine/src/llm/provider-factory.ts) for LLM providers
   - Agent-engine with streaming support and memory management
   - Agent deployment tracking via [`AetherCoreService`](packages/models/src/services/AetherCoreService.ts)
   - Agent templates system with [`AgentTemplateService`](packages/models/src/services/AgentTemplateService.ts)

3. **Communication Layer**
   - [`SocketIOService`](packages/server/src/services/SocketIOService.ts) with JWT authentication
   - Agent-specific socket handlers in [`agentHandlers.ts`](packages/server/src/socket/agentHandlers.ts)
   - Real-time streaming with typewriter effects
   - Room-based communication (user rooms, agent rooms)
   - Memory store with [`LangChainMemoryStore`](packages/server/src/store.ts)

4. **Database & Types**
   - Comprehensive types in [`packages/models/src/types.ts`](packages/models/src/types.ts)
   - Neo4j connection management with [`connection.ts`](packages/models/src/connection.ts)
   - Repository pattern with factory implementation
   - Schema initialization and constraint management
   - Starship and Codex system for agent deployment context

5. **Protocol Definitions**
   - Comprehensive types in [`packages/protocol/src/index.ts`](packages/protocol/src/index.ts)
   - Socket.IO event definitions
   - Agent and chat interfaces
   - Streaming and typewriter support

6. **Environment & Configuration**
   - [`env-config`](packages/env-config/package.json) package for environment management
   - [`UserService`](packages/server/src/services/UserService.ts) for user management
   - Proper authentication flow with user sync

### ❌ **Critical Gaps for MCP Implementation**

1. **Missing Docker Container Management**
   - ❌ No Docker SDK integration in server dependencies ([`packages/server/package.json`](packages/server/package.json:14-26) - missing `dockerode`)
   - ❌ No container lifecycle management service
   - ❌ No user-specific container isolation
   - ❌ No container orchestration for MCP tools
   - ✅ Basic Docker setup exists ([`packages/server/docker-compose.yml`](packages/server/docker-compose.yml:1-51) with Neo4j)

2. **Missing MCP Protocol Implementation**
   - ❌ No actual MCP server implementation (only placeholder interfaces in [`vision-chamber/ai-foundation.ts`](packages/client/src/components/vision-chamber/VisionChamber/shared/ai-foundation.ts:17-31))
   - ❌ No MCP tool execution framework
   - ❌ No MCP resource management
   - ❌ No tool registry system
   - ⚠️ Placeholder MCP interfaces exist but not implemented

3. **Missing Database Schema for MCP**
   - ❌ No MCP server configurations in Neo4j schema ([`connection.ts`](packages/models/src/connection.ts:122-133) - only basic constraints)
   - ❌ No tool definitions or permissions in database
   - ❌ No container-to-user mappings
   - ❌ Missing MCP-specific constraints and indexes
   - ❌ No MCP repository implementations (only [`AgentRepository.ts`](packages/models/src/repositories/AgentRepository.ts), [`UserRepository.ts`](packages/models/src/repositories/UserRepository.ts), etc.)

4. **Missing Security & Isolation**
   - ❌ No container resource limits
   - ❌ No tool permission system
   - ❌ No sandboxed execution environment
   - ❌ No audit logging for tool executions

5. **Missing API Endpoints**
   - ❌ No MCP configuration endpoints (current routes: [`agents.ts`](packages/server/src/routes/agents.ts), [`chat.ts`](packages/server/src/routes/chat.ts), [`sibil.ts`](packages/server/src/routes/sibil.ts), etc.)
   - ❌ No tool execution endpoints
   - ❌ No container management endpoints
   - ❌ No MCP status monitoring endpoints

6. **Missing Integration Points**
   - ❌ No MCP tool injection into agent prompts ([`agent-engine/src/index.ts`](packages/agent-engine/src/index.ts:64-70) - only basic prompt building)
   - ❌ No tool call parsing from agent responses
   - ❌ No MCP context in agent conversations
   - ❌ No tool result integration back into chat flow
   - ✅ Agent-starship context integration exists ([`agent-engine/src/index.ts`](packages/agent-engine/src/index.ts:23-48))

7. **Missing Frontend Components**
   - ❌ No MCP configuration UI
   - ❌ No tool management interface
   - ❌ No container status monitoring
   - ❌ No tool execution logs display
   - ⚠️ Placeholder MCP hooks exist in [`ai-foundation.ts`](packages/client/src/components/vision-chamber/VisionChamber/shared/ai-foundation.ts:270-311)

## 🎯 **Agent-Specific Tool Access Architecture**

### **The Challenge You Raised - UPDATED**
You're absolutely right! Users need **granular control** over which agents can access which tools, AND **different credentials for the same tool**:

- **User has multiple agents** (research_agent, assistant_agent, admin_agent)
- **Different agents need different tools** (some get web_scraper, others get email_sender)
- **Fine-grained permissions** per agent within the user's container
- **🚨 CRITICAL MISSING**: **Same tool, different credentials per agent**

### **Solution: Agent-Level Tool Permissions + Agent-Specific Credentials**

```json
{
  "userId": "user123",
  "tools": [
    {
      "id": "web_scraper",
      "name": "Web Scraper",
      "baseConfig": {"timeout": 30000, "userAgent": "StarshipsBot"}
    },
    {
      "id": "email_sender",
      "name": "Email Sender",
      "baseConfig": {"smtpPort": 587, "encryption": "tls"}
    },
    {
      "id": "crm_connector",
      "name": "CRM Connector",
      "baseConfig": {"apiVersion": "v2", "timeout": 15000}
    }
  ],
  "agentPermissions": {
    "support_agent": ["email_sender", "crm_connector"],
    "sales_agent": ["email_sender", "crm_connector"],
    "marketing_agent": ["email_sender", "web_scraper"]
  },
  "agentToolCredentials": {
    "support_agent": {
      "email_sender": {
        "smtpHost": "smtp.company.com",
        "username": "support@company.com",
        "password": "support_secret_key",
        "fromName": "Support Team"
      },
      "crm_connector": {
        "apiKey": "support_crm_key_123",
        "baseUrl": "https://support.crm.company.com",
        "department": "support"
      }
    },
    "sales_agent": {
      "email_sender": {
        "smtpHost": "smtp.company.com",
        "username": "sales@company.com",
        "password": "sales_secret_key",
        "fromName": "Sales Team"
      },
      "crm_connector": {
        "apiKey": "sales_crm_key_456",
        "baseUrl": "https://sales.crm.company.com",
        "department": "sales"
      }
    },
    "marketing_agent": {
      "email_sender": {
        "smtpHost": "smtp.company.com",
        "username": "marketing@company.com",
        "password": "marketing_secret_key",
        "fromName": "Marketing Team"
      }
    }
  },
  "containerLimits": {
    "memory": "1024m",
    "cpu": "1.0",
    "timeout": 60000
  }
}
```

### **Architecture Flow with Agent Permissions + Credentials**

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
│                 │    │                  │    │  Credential Injection:          │
│ Agent 3 (Marketing)  │                  │    │  Agent1 → support credentials  │
│   ✅ email_sender│    │                  │    │  Agent2 → sales credentials    │
│     📧 marketing@     │                  │    │  Agent3 → marketing credentials │
│   ✅ web_scraper│    │                  │    └─────────────────────────────────┘
└─────────────────┘    └──────────────────┘
```

### **Implementation Strategy**

#### **1. Enhanced MCP Configuration API with Credentials**
```typescript
// packages/server/src/routes/mcp.ts
router.post('/api/mcp/configure', authMiddleware, async (req, res) => {
  const { userId, tools, agentPermissions, agentToolCredentials, containerLimits } = req.body;
  
  // 1. Create user's container with ALL tools
  const container = await MCPService.createUserContainer(userId, tools, containerLimits);
  
  // 2. Store agent-specific permissions in Neo4j
  await MCPService.setAgentPermissions(userId, agentPermissions);
  
  // 3. 🚨 NEW: Store agent-specific tool credentials (encrypted)
  await MCPService.setAgentToolCredentials(userId, agentToolCredentials);
  
  // 4. Return container info with permission mapping
  res.json({
    containerId: container.id,
    permissions: agentPermissions,
    credentialsConfigured: Object.keys(agentToolCredentials)
  });
});
```

#### **2. Permission + Credential Enforcement During Tool Execution**
```typescript
// packages/server/src/services/MCPService.ts
export class MCPService {
  static async executeToolWithPermissionAndCredentialCheck(
    userId: string,
    agentId: string,
    toolCall: MCPToolCall
  ): Promise<MCPToolResult> {
    
    // 1. Check if agent has permission for this tool
    const hasPermission = await this.checkAgentToolPermission(userId, agentId, toolCall.toolName);
    
    if (!hasPermission) {
      return {
        id: toolCall.id,
        success: false,
        error: `Agent ${agentId} does not have permission to use tool ${toolCall.toolName}`,
        executionTime: 0,
        timestamp: new Date().toISOString()
      };
    }
    
    // 2. 🚨 NEW: Get agent-specific credentials for this tool
    const agentCredentials = await this.getAgentToolCredentials(userId, agentId, toolCall.toolName);
    
    if (!agentCredentials) {
      return {
        id: toolCall.id,
        success: false,
        error: `No credentials configured for agent ${agentId} to use tool ${toolCall.toolName}`,
        executionTime: 0,
        timestamp: new Date().toISOString()
      };
    }
    
    // 3. Merge tool parameters with agent-specific credentials
    const toolCallWithCredentials = {
      ...toolCall,
      parameters: {
        ...toolCall.parameters,
        ...agentCredentials  // Agent-specific credentials override defaults
      }
    };
    
    // 4. Execute tool in user's container with agent credentials
    return await this.executeToolInUserContainer(userId, toolCallWithCredentials);
  }
  
  static async checkAgentToolPermission(userId: string, agentId: string, toolName: string): Promise<boolean> {
    // Query Neo4j for agent-specific tool permissions
    const query = `
      MATCH (u:User {id: $userId})-[:OWNS_AGENT]->(a:Agent {id: $agentId})
      MATCH (u)-[:HAS_MCP_PERMISSION]->(p:MCPPermission {toolName: $toolName, agentId: $agentId})
      RETURN p.granted as hasPermission
    `;
    
    const result = await neo4j.run(query, { userId, agentId, toolName });
    return result.records[0]?.get('hasPermission') || false;
  }
  
  // 🚨 NEW: Get agent-specific tool credentials
  static async getAgentToolCredentials(userId: string, agentId: string, toolName: string): Promise<Record<string, any> | null> {
    const query = `
      MATCH (u:User {id: $userId})-[:OWNS_AGENT]->(a:Agent {id: $agentId})
      MATCH (u)-[:HAS_AGENT_TOOL_CREDENTIALS]->(c:AgentToolCredentials {agentId: $agentId, toolName: $toolName})
      RETURN c.encryptedCredentials as credentials
    `;
    
    const result = await neo4j.run(query, { userId, agentId, toolName });
    const encryptedCredentials = result.records[0]?.get('credentials');
    
    if (!encryptedCredentials) {
      return null;
    }
    
    // Decrypt credentials before returning
    return await this.decryptCredentials(encryptedCredentials);
  }
  
  // 🚨 NEW: Store agent-specific tool credentials (encrypted)
  static async setAgentToolCredentials(userId: string, agentToolCredentials: Record<string, Record<string, any>>): Promise<void> {
    for (const [agentId, toolCredentials] of Object.entries(agentToolCredentials)) {
      for (const [toolName, credentials] of Object.entries(toolCredentials)) {
        const encryptedCredentials = await this.encryptCredentials(credentials);
        
        const query = `
          MATCH (u:User {id: $userId})
          MERGE (u)-[:HAS_AGENT_TOOL_CREDENTIALS]->(c:AgentToolCredentials {
            agentId: $agentId,
            toolName: $toolName
          })
          SET c.encryptedCredentials = $encryptedCredentials,
              c.updatedAt = datetime()
        `;
        
        await neo4j.run(query, { userId, agentId, toolName, encryptedCredentials });
      }
    }
  }
  
  // Security: Encrypt/decrypt credentials
  private static async encryptCredentials(credentials: Record<string, any>): Promise<string> {
    // Implementation: Use AES encryption with user-specific key
    // This is a placeholder - implement proper encryption
    return Buffer.from(JSON.stringify(credentials)).toString('base64');
  }
  
  private static async decryptCredentials(encryptedCredentials: string): Promise<Record<string, any>> {
    // Implementation: Decrypt using AES with user-specific key
    // This is a placeholder - implement proper decryption
    return JSON.parse(Buffer.from(encryptedCredentials, 'base64').toString());
  }
}
```

#### **3. Enhanced Neo4j Schema for Agent Permissions + Credentials**
```typescript
// packages/models/src/connection.ts - Add to initializeSchema()
const agentPermissionConstraints = [
  'CREATE CONSTRAINT agent_permission_unique IF NOT EXISTS FOR (p:AgentMCPPermission) REQUIRE (p.userId, p.agentId, p.toolName) IS UNIQUE',
  // 🚨 NEW: Agent-specific tool credentials constraint
  'CREATE CONSTRAINT agent_tool_credentials_unique IF NOT EXISTS FOR (c:AgentToolCredentials) REQUIRE (c.userId, c.agentId, c.toolName) IS UNIQUE',
];

const agentPermissionIndexes = [
  'CREATE INDEX agent_permission_lookup IF NOT EXISTS FOR (p:AgentMCPPermission) ON (p.userId, p.agentId)',
  // 🚨 NEW: Agent-specific tool credentials index
  'CREATE INDEX agent_tool_credentials_lookup IF NOT EXISTS FOR (c:AgentToolCredentials) ON (c.userId, c.agentId, c.toolName)',
];

// New relationship patterns:
// (:User)-[:OWNS_AGENT]->(:Agent)
// (:User)-[:HAS_MCP_CONTAINER]->(:MCPContainer)
// (:MCPContainer)-[:PROVIDES_TOOL]->(:MCPTool)
// (:Agent)-[:CAN_USE_TOOL]->(:MCPTool) // Agent-specific permissions
// 🚨 NEW: (:User)-[:HAS_AGENT_TOOL_CREDENTIALS]->(:AgentToolCredentials) // Agent-specific credentials
```

#### **4. Enhanced Types for Agent Permissions + Credentials**
```typescript
// packages/protocol/src/index.ts
export interface MCPConfiguration {
  userId: string;
  tools: MCPToolConfig[];
  agentPermissions: Record<string, string[]>; // agentId -> toolNames[]
  // 🚨 NEW: Agent-specific tool credentials
  agentToolCredentials: Record<string, Record<string, any>>; // agentId -> toolName -> credentials
  containerLimits: {
    memory: string;
    cpu: string;
    timeout: number;
  };
}

export interface AgentMCPPermission {
  id: string;
  userId: string;
  agentId: string;
  toolName: string;
  granted: boolean;
  grantedAt: string;
  grantedBy: string;
}

// 🚨 NEW: Agent-specific tool credentials interface
export interface AgentToolCredentials {
  id: string;
  userId: string;
  agentId: string;
  toolName: string;
  encryptedCredentials: string; // Encrypted JSON of credentials
  createdAt: string;
  updatedAt: string;
}

export interface MCPToolCall {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  agentId: string;  // CRITICAL: Always include agentId for permission + credential checks
  userId: string;
  timestamp: string;
}
```

#### **5. Agent Engine Integration with Permission + Credential Checks**
```typescript
// packages/agent-engine/src/mcp/MCPIntegration.ts
export class MCPIntegration {
  static async getAvailableToolsForAgent(userId: string, agentId: string): Promise<MCPTool[]> {
    // 1. Get user's container tools
    const allTools = await MCPService.getUserContainerTools(userId);
    
    // 2. Filter by agent permissions AND credential availability
    const allowedTools = [];
    for (const tool of allTools) {
      const hasPermission = await MCPService.checkAgentToolPermission(userId, agentId, tool.name);
      const hasCredentials = await MCPService.getAgentToolCredentials(userId, agentId, tool.name);
      
      if (hasPermission && hasCredentials) {
        // 🚨 NEW: Include credential status in tool info
        allowedTools.push({
          ...tool,
          credentialsConfigured: true,
          credentialFields: Object.keys(hasCredentials)
        });
      }
    }
    
    return allowedTools;
  }
  
  static async executeToolForAgent(userId: string, agentId: string, toolCall: MCPToolCall): Promise<MCPToolResult> {
    // 🚨 UPDATED: Include both permission AND credential checks
    return await MCPService.executeToolWithPermissionAndCredentialCheck(userId, agentId, toolCall);
  }
  
  // 🚨 NEW: Get tool schema with agent-specific credential requirements
  static async getToolSchemaForAgent(userId: string, agentId: string, toolName: string): Promise<MCPToolSchema> {
    const baseSchema = await MCPService.getToolSchema(toolName);
    const agentCredentials = await MCPService.getAgentToolCredentials(userId, agentId, toolName);
    
    // Remove credential fields from required parameters since they're auto-injected
    const credentialFields = agentCredentials ? Object.keys(agentCredentials) : [];
    const filteredParameters = { ...baseSchema.parameters };
    
    credentialFields.forEach(field => {
      delete filteredParameters[field];
    });
    
    return {
      ...baseSchema,
      parameters: filteredParameters,
      agentCredentialsConfigured: !!agentCredentials
    };
  }
}
```

### **Benefits of This Approach**

1. **Single Container Per User**: Efficient resource usage
2. **Granular Agent Permissions**: Each agent gets specific tools
3. **Flexible Tool Sharing**: Tools can be shared across multiple agents
4. **Security**: Agents can't access unauthorized tools
5. **Easy Management**: Simple permission matrix per user
6. **Scalable**: Add/remove agent permissions without container changes

### **Example Usage Scenarios**

#### **Scenario 1: Research Team**
```json
{
  "userId": "research_team",
  "tools": ["web_scraper", "data_analyzer", "pdf_reader", "citation_manager"],
  "agentPermissions": {
    "data_collector": ["web_scraper", "pdf_reader"],
    "data_analyst": ["data_analyzer", "pdf_reader"],
    "report_writer": ["citation_manager", "data_analyzer"],
    "supervisor": ["web_scraper", "data_analyzer", "pdf_reader", "citation_manager"]
  }
}
```

#### **Scenario 2: Business Assistant**
```json
{
  "userId": "business_user",
  "tools": ["email_sender", "calendar_manager", "document_generator", "crm_connector"],
  "agentPermissions": {
    "email_assistant": ["email_sender"],
    "scheduling_agent": ["calendar_manager", "email_sender"],
    "document_agent": ["document_generator"],
    "sales_agent": ["crm_connector", "email_sender"],
    "admin_agent": ["email_sender", "calendar_manager", "document_generator", "crm_connector"]
  }
}
```

## 🎯 **Revised Master Execution Plan**

### **Phase 1: Infrastructure Foundation (Week 1)**

#### 1.1 Add Docker Dependencies
```bash
# Add to packages/server/package.json
pnpm add dockerode @types/dockerode

# Create new MCP server package
mkdir -p packages/mcp-server
cd packages/mcp-server
pnpm init
pnpm add dockerode @types/dockerode @starships/protocol @starships/models express cors
```

#### 1.2 Create MCP Server Package
```
packages/mcp-server/
├── src/
│   ├── index.ts                 # MCP server entry point
│   ├── server.ts               # MCP protocol implementation
│   ├── docker/
│   │   ├── ContainerManager.ts # Docker container management
│   │   ├── SecurityManager.ts  # Container security & limits
│   │   └── templates/          # Container templates
│   ├── tools/
│   │   ├── ToolRegistry.ts     # Tool registration system
│   │   ├── ToolExecutor.ts     # Tool execution engine
│   │   └── executors/          # Specific tool executors
│   ├── resources/
│   │   └── ResourceManager.ts  # MCP resource management
│   └── types/
│       └── mcp-types.ts        # MCP-specific types
├── Dockerfile
├── docker-compose.yml
└── package.json
```

#### 1.3 Extend Neo4j Schema in Connection.ts
```typescript
// Add to packages/models/src/connection.ts initializeSchema() after line 133
const mcpConstraints = [
  'CREATE CONSTRAINT mcp_server_id_unique IF NOT EXISTS FOR (m:MCPServer) REQUIRE m.id IS UNIQUE',
  'CREATE CONSTRAINT mcp_tool_id_unique IF NOT EXISTS FOR (t:MCPTool) REQUIRE t.id IS UNIQUE',
  'CREATE CONSTRAINT mcp_container_id_unique IF NOT EXISTS FOR (c:MCPContainer) REQUIRE c.id IS UNIQUE',
  'CREATE CONSTRAINT mcp_permission_id_unique IF NOT EXISTS FOR (p:MCPPermission) REQUIRE p.id IS UNIQUE',
];

const mcpIndexes = [
  'CREATE INDEX mcp_server_user_index IF NOT EXISTS FOR (m:MCPServer) ON (m.userId)',
  'CREATE INDEX mcp_tool_server_index IF NOT EXISTS FOR (t:MCPTool) ON (t.serverId)',
  'CREATE INDEX mcp_container_user_index IF NOT EXISTS FOR (c:MCPContainer) ON (c.userId)',
  'CREATE INDEX mcp_permission_user_tool_index IF NOT EXISTS FOR (p:MCPPermission) ON (p.userId, p.toolName)',
];

// Add to existing constraints and indexes arrays
constraints.push(...mcpConstraints);
indexes.push(...mcpIndexes);

// Relationships to implement:
(:User)-[:OWNS_MCP_SERVER]->(:MCPServer)
(:Agent)-[:HAS_MCP_SERVER]->(:MCPServer)
(:MCPServer)-[:PROVIDES_TOOL]->(:MCPTool)
(:MCPServer)-[:RUNS_IN_CONTAINER]->(:MCPContainer)
(:User)-[:HAS_PERMISSION]->(:MCPPermission)-[:FOR_TOOL]->(:MCPTool)
```

### **Phase 2: Core MCP Implementation (Week 2)**

#### 2.1 Docker Container Management Service
```typescript
// packages/mcp-server/src/docker/ContainerManager.ts
export class MCPContainerManager {
  private docker: Docker;
  private securityManager: SecurityManager;
  
  async createUserContainer(userId: string, config: MCPConfiguration): Promise<string>
  async attachAgentToContainer(agentId: string, containerId: string): Promise<void>
  async executeToolInContainer(containerId: string, tool: MCPTool): Promise<any>
  async destroyContainer(containerId: string): Promise<void>
  async listUserContainers(userId: string): Promise<MCPContainerInfo[]>
  async getContainerLogs(containerId: string): Promise<string>
  async healthCheckContainer(containerId: string): Promise<boolean>
  async restartContainer(containerId: string): Promise<void>
}
```

#### 2.2 MCP Protocol Server
```typescript
// packages/mcp-server/src/server.ts
export class MCPServer {
  private containerManager: MCPContainerManager;
  private toolRegistry: ToolRegistry;
  private resourceManager: ResourceManager;
  
  async initialize(): Promise<void>
  async handleToolCall(toolCall: MCPToolCall): Promise<MCPToolResult>
  async listAvailableTools(userId: string): Promise<MCPTool[]>
  async validatePermissions(userId: string, toolName: string): Promise<boolean>
  async registerTool(tool: MCPToolConfig): Promise<void>
  async unregisterTool(toolId: string): Promise<void>
}
```

#### 2.3 Extend Types in Models Package
```typescript
// Add to packages/models/src/types.ts
export interface MCPServer {
  id: string;
  userId: string;
  agentId?: string;
  name: string;
  containerImage: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  environment: Record<string, string>;
  limits: {
    memory: string;
    cpu: string;
    timeout: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MCPTool {
  id: string;
  serverId: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  permissions: string[];
  category: 'system' | 'data' | 'communication' | 'analysis' | 'custom';
  createdAt: string;
  updatedAt: string;
}

export interface MCPContainer {
  id: string;
  serverId: string;
  userId: string;
  dockerId: string;
  status: 'running' | 'stopped' | 'error';
  image: string;
  ports: Record<string, number>;
  resourceUsage: {
    memory: string;
    cpu: string;
  };
  createdAt: string;
  lastActivity: string;
}

export interface MCPPermission {
  id: string;
  userId: string;
  toolName: string;
  granted: boolean;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
}

// Repository interfaces
export interface MCPRepository {
  // Server management
  createMCPServer(server: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<MCPServer>;
  findMCPServerByUser(userId: string): Promise<MCPServer[]>;
  findMCPServerByAgent(agentId: string): Promise<MCPServer | null>;
  updateMCPServer(id: string, updates: Partial<MCPServer>): Promise<MCPServer | null>;
  deleteMCPServer(id: string): Promise<boolean>;
  
  // Tool management
  createTool(tool: Omit<MCPTool, 'id' | 'createdAt' | 'updatedAt'>): Promise<MCPTool>;
  findToolsByServer(serverId: string): Promise<MCPTool[]>;
  findToolByName(serverId: string, name: string): Promise<MCPTool | null>;
  updateTool(id: string, updates: Partial<MCPTool>): Promise<MCPTool | null>;
  deleteTool(id: string): Promise<boolean>;
  
  // Container management
  createContainer(container: Omit<MCPContainer, 'id' | 'createdAt'>): Promise<MCPContainer>;
  findContainersByUser(userId: string): Promise<MCPContainer[]>;
  findContainerByServer(serverId: string): Promise<MCPContainer | null>;
  updateContainer(id: string, updates: Partial<MCPContainer>): Promise<MCPContainer | null>;
  deleteContainer(id: string): Promise<boolean>;
  
  // Permission management
  grantPermission(permission: Omit<MCPPermission, 'id' | 'grantedAt'>): Promise<MCPPermission>;
  revokePermission(userId: string, toolName: string): Promise<boolean>;
  checkPermission(userId: string, toolName: string): Promise<boolean>;
  listUserPermissions(userId: string): Promise<MCPPermission[]>;
}
```

#### 2.4 Extend Protocol Types
```typescript
// Add to packages/protocol/src/index.ts
export interface MCPConfiguration {
  id: string;
  userId: string;
  agentId?: string;
  name: string;
  containerImage: string;
  tools: MCPToolConfig[];
  resources: MCPResourceConfig[];
  environment: Record<string, string>;
  limits: {
    memory: string;
    cpu: string;
    timeout: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MCPToolConfig {
  name: string;
  description: string;
  parameters: Record<string, any>;
  permissions: string[];
  category: 'system' | 'data' | 'communication' | 'analysis' | 'custom';
}

export interface MCPResourceConfig {
  name: string;
  type: 'file' | 'database' | 'api' | 'service';
  uri: string;
  permissions: string[];
}

export interface MCPToolCall {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  agentId: string;
  userId: string;
  timestamp: string;
  context?: {
    conversationId?: string;
    messageId?: string;
  };
}

export interface MCPToolResult {
  id: string;
  toolCallId: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  timestamp: string;
  logs?: string[];
}

export interface MCPStatus {
  serverId: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  containerInfo: {
    id: string;
    status: string;
    uptime: number;
    resourceUsage: {
      memory: string;
      cpu: string;
    };
  };
  availableTools: string[];
  lastActivity: string;
}
```

### **Phase 3: Backend Integration (Week 3)**

#### 3.1 New Repository Classes
```typescript
// packages/models/src/repositories/MCPRepository.ts (NEW FILE)
// Add to packages/models/src/repositories/index.ts exports
// Follow existing pattern from AgentRepository.ts, UserRepository.ts
export class MCPRepository {
  async createMCPServer(config: MCPConfiguration): Promise<MCPServer>
  async findMCPServerByUser(userId: string): Promise<MCPServer[]>
  async findMCPServerByAgent(agentId: string): Promise<MCPServer | null>
  async updateMCPServer(id: string, updates: Partial<MCPConfiguration>): Promise<MCPServer>
  async deleteMCPServer(id: string): Promise<boolean>
  async createTool(tool: MCPToolConfig): Promise<MCPTool>
  async findToolsByServer(serverId: string): Promise<MCPTool[]>
}
```

#### 3.2 MCP Service Layer
```typescript
// packages/server/src/services/MCPService.ts (NEW FILE)
// Follow existing pattern from AgentService.ts
export class MCPService {
  static async configureMCPForUser(userId: string, config: MCPConfiguration): Promise<MCPServer>
  static async attachMCPToAgent(agentId: string, mcpServerId: string): Promise<void>
  static async executeTool(toolCall: MCPToolCall): Promise<MCPToolResult>
  static async getMCPStatus(userId: string): Promise<MCPStatus>
  static async listAvailableTools(userId: string): Promise<MCPTool[]>
  static async cleanupUserContainers(userId: string): Promise<void>
}
```

#### 3.3 New API Routes
```typescript
// packages/server/src/routes/mcp.ts (NEW FILE)
// Follow existing pattern from agents.ts, chat.ts, sibil.ts
router.post('/api/mcp/configure', authMiddleware, configureMCP);
router.get('/api/mcp/status/:userId', authMiddleware, getMCPStatus);
router.post('/api/mcp/tools/execute', authMiddleware, executeTool);
router.get('/api/mcp/tools/:userId', authMiddleware, listTools);
router.delete('/api/mcp/containers/:containerId', authMiddleware, destroyContainer);
router.get('/api/mcp/containers/:userId', authMiddleware, listContainers);
```

### **Phase 4: Agent Engine Integration (Week 4)**

#### 4.1 Extend Agent Engine for MCP
```typescript
// packages/agent-engine/src/mcp/MCPIntegration.ts (NEW FILE)
// Integrate with existing agent-engine/src/index.ts chat() function
export class MCPIntegration {
  static async injectMCPTools(agentId: string, prompt: string): Promise<string>
  static async handleToolCall(agentId: string, toolCall: MCPToolCall): Promise<MCPToolResult>
  static async getMCPContext(agentId: string): Promise<MCPContext>
}
```

#### 4.2 Modify Chat Function
```typescript
// Extend existing packages/agent-engine/src/index.ts chat() function (line 10-94)
// Add MCP integration after codex context loading (line 48)
export async function chatWithMCP(req: ChatRequest, store: LangChainMemoryStore): Promise<ChatResponse> {
  // ... existing code until line 48 ...
  
  // NEW: Load MCP tools for agent
  let mcpContext = "";
  try {
    const mcpServer = await MCPService.getMCPServerForAgent(req.agent_id);
    if (mcpServer) {
      const availableTools = await MCPService.listAvailableTools(req.user_id);
      mcpContext = await MCPIntegration.injectMCPTools(req.agent_id, availableTools);
    }
  } catch (error) {
    console.error('Failed to load MCP context:', error);
  }

  // Modify buildPrompt call to include MCP context
  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    codexContext,
    mcpContext  // NEW PARAMETER
  );
  
  // ... rest of existing code ...
}
```

### **Phase 5: Socket.IO Extensions (Week 5)**

#### 5.1 Extend Socket Events
```typescript
// Add to packages/protocol/src/index.ts SocketIOEvents interface (line 198-229)
// Add after existing agent events (line 226)
'mcp:configure': (config: MCPConfiguration) => void;
'mcp:tool-execute': (toolCall: MCPToolCall) => void;
'mcp:tool-result': (result: MCPToolResult) => void;
'mcp:status-update': (status: MCPStatus) => void;
'mcp:container-logs': (logs: string) => void;
```

#### 5.2 MCP Socket Handlers
```typescript
// packages/server/src/socket/mcpHandlers.ts (NEW FILE)
// Follow existing pattern from agentHandlers.ts
// Import in packages/server/src/socket/index.ts
export function setupMCPHandlers(io: SocketIOServer<SocketIOEvents>) {
  io.on('connection', (socket: Socket) => {
    socket.on('mcp:configure', async (config: MCPConfiguration) => {
      // Handle MCP configuration
    });
    
    socket.on('mcp:tool-execute', async (toolCall: MCPToolCall) => {
      // Execute tool and stream results
    });
  });
}
```

### **Phase 6: MCP Container Infrastructure (Week 6)**

#### 6.1 User Tool Container Templates (SEPARATE FROM EXISTING DOCKER)
```dockerfile
# packages/mcp-server/docker/templates/python-tools/Dockerfile
# This creates user-specific tool containers, NOT part of main infrastructure
FROM python:3.11-slim
RUN pip install requests pandas numpy beautifulsoup4 selenium
COPY mcp-tools/ /app/tools/
WORKDIR /app
EXPOSE 8080
CMD ["python", "-m", "tools.mcp_server"]
```

```dockerfile
# packages/mcp-server/docker/templates/nodejs-tools/Dockerfile
# Another user tool container template
FROM node:20-alpine
RUN npm install -g puppeteer axios cheerio
COPY mcp-tools/ /app/tools/
WORKDIR /app
EXPOSE 8080
CMD ["node", "tools/mcp-server.js"]
```

#### 6.2 MCP Container Manager (RUNS INSIDE EXISTING SERVER)
```typescript
// packages/server/src/services/MCPContainerManager.ts
// This service runs INSIDE the existing server container
// It manages user-specific MCP tool containers dynamically

export class MCPContainerManager {
  private docker: Docker;
  
  constructor() {
    // Connect to Docker daemon from within existing server container
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }
  
  async createUserToolContainer(userId: string, tools: string[]): Promise<string> {
    // Creates a NEW container specifically for this user's tools
    // This is SEPARATE from the existing neo4j/server/client containers
    const containerName = `starships-user-${userId}-mcp-tools`;
    
    const container = await this.docker.createContainer({
      Image: 'starships-mcp-tools:latest',
      name: containerName,
      Env: [`USER_ID=${userId}`, `TOOLS=${tools.join(',')}`],
      HostConfig: {
        Memory: 512 * 1024 * 1024, // 512MB limit
        CpuShares: 512, // 0.5 CPU
        NetworkMode: 'bridge', // Isolated network
        RestartPolicy: { Name: 'unless-stopped' }
      }
    });
    
    await container.start();
    return container.id;
  }
}
```

#### 6.3 MCP Network Isolation (SEPARATE NETWORK)
```yaml
# packages/mcp-server/docker-compose.mcp.yml
# This is a SEPARATE docker-compose file for MCP infrastructure
# It does NOT modify the existing packages/server/docker-compose.yml

version: '3.8'

networks:
  mcp-tools-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

services:
  # This service builds the base image for user tool containers
  mcp-tools-base:
    build:
      context: .
      dockerfile: docker/templates/python-tools/Dockerfile
    image: starships-mcp-tools:latest
    networks:
      - mcp-tools-network
    # This container is just for building the base image
    # Actual user containers are created dynamically by MCPContainerManager
```

#### 6.4 Integration with Existing Infrastructure
```typescript
// packages/server/src/index.ts (MODIFY EXISTING FILE)
// Add MCP container manager to existing server, don't create new container

import { MCPContainerManager } from './services/MCPContainerManager';

// Add to existing server initialization
const mcpManager = new MCPContainerManager();
app.locals.mcpManager = mcpManager;

// The existing server container now manages user MCP containers
// No changes to existing docker-compose.yml needed
```

### **Phase 7: Security & Permissions (Week 7)**

#### 7.1 Container Security
```typescript
// packages/mcp-server/src/security/ContainerSecurity.ts
export class ContainerSecurity {
  static readonly DEFAULT_LIMITS = {
    memory: '512m',
    cpu: '0.5',
    timeout: 30000,
    networkMode: 'none'
  };
  
  static validateToolPermissions(userId: string, toolName: string): Promise<boolean>
  static enforceResourceLimits(containerId: string): Promise<void>
  static auditToolExecution(toolCall: MCPToolCall, result: MCPToolResult): Promise<void>
}
```

#### 7.2 Permission System
```typescript
// packages/models/src/repositories/MCPPermissionRepository.ts
export class MCPPermissionRepository {
  async grantToolPermission(userId: string, toolName: string): Promise<void>
  async revokeToolPermission(userId: string, toolName: string): Promise<void>
  async checkToolPermission(userId: string, toolName: string): Promise<boolean>
  async listUserPermissions(userId: string): Promise<string[]>
}
```

### **Phase 8: Frontend Integration (Week 8)**

#### 8.1 MCP Configuration UI
```typescript
// packages/client/src/components/mcp/MCPConfigurationPanel.tsx (NEW FILE)
// Replace placeholder hooks from ai-foundation.ts
export function MCPConfigurationPanel() {
  // MCP server configuration interface
  // Tool selection and permissions
  // Container status monitoring
  // Use existing UI patterns from agents/AgentTester.tsx
}
```

#### 8.2 Agent MCP Integration
```typescript
// Extend existing packages/client/src/components/agents/AgentTester.tsx
// Add MCP tool indicators to existing UI
// Show available tools for agent in sidebar
// Display tool execution results in chat
// Integrate with existing socket connection from agent-socket-api.ts
```

## 🔧 **Implementation Dependencies**

### New Package Dependencies
```json
// packages/server/package.json (add to existing dependencies after line 26)
{
  "dependencies": {
    // ... existing dependencies ...
    "dockerode": "^4.0.7",
    "@types/dockerode": "^3.3.42"
  }
}

// packages/mcp-server/package.json (NEW PACKAGE)
{
  "name": "@starships/mcp-server",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "dockerode": "^4.0.7",
    "@starships/protocol": "workspace:*",
    "@starships/models": "workspace:*",
    "express": "^5.1.0",
    "cors": "^2.8.5"
  }
}
```

### Environment Variables
```bash
# Add to .env.example
# MCP Configuration
MCP_SERVER_PORT=3002
MCP_CONTAINER_REGISTRY=docker.io
MCP_DEFAULT_MEMORY_LIMIT=512m
MCP_DEFAULT_CPU_LIMIT=0.5
MCP_DEFAULT_TIMEOUT=30000
```

## 🚀 **Key Technical Decisions**

1. **Separate Container Architecture**: User MCP tool containers are SEPARATE from existing infrastructure
   - **Existing Docker**: `neo4j`, `server`, `client` containers remain unchanged
   - **New MCP Containers**: Dynamic user-specific tool containers (`user-{id}-mcp-tools`)
   - **Management**: MCPContainerManager service runs INSIDE existing server container

2. **Container Per User**: Each user gets isolated Docker containers for their automation tools
   - **Purpose**: Tool execution environment (web scraping, data analysis, etc.)
   - **Lifecycle**: Created/destroyed dynamically based on user needs
   - **Isolation**: Separate network, resource limits, security boundaries

3. **Agent-Container Binding**: Agents can be attached to specific user tool containers
   - **Multiple Agents**: All user's agents share the same tool container
   - **Tool Permissions**: Agent-level permissions within user's container
   - **Context Sharing**: Agents share tool execution context per user

4. **Tool Execution**: MCP tools execute within user containers with proper isolation
   - **Sandboxed Environment**: Each user's tools run in isolated container
   - **Resource Limits**: Memory, CPU, timeout limits per user container
   - **Network Isolation**: User containers on separate Docker network

5. **Real-time Communication**: Socket.IO for live tool execution feedback
   - **Existing Socket.IO**: Extend current implementation for MCP events
   - **Tool Streaming**: Real-time tool execution results to agents
   - **Container Status**: Live container health and resource monitoring

6. **Neo4j Integration**: Store MCP configurations and relationships in existing database
   - **Existing Schema**: Extend current Neo4j schema with MCP constraints
   - **No New Database**: Use existing Neo4j instance for MCP metadata
   - **Relationships**: Link users, agents, containers, and tools in existing graph

7. **Infrastructure Separation**: MCP implementation doesn't modify existing Docker setup
   - **No Changes**: Existing `docker-compose.yml` remains untouched
   - **Separate Management**: MCP containers managed programmatically via Docker API
   - **Service Integration**: MCP services added to existing server, not new containers

## ⚠️ **Potential Challenges & Solutions**

1. **Container Resource Management**: 
   - Solution: Implement automatic cleanup and resource monitoring
   - Use Docker resource limits and health checks

2. **Tool Security**: 
   - Solution: Sandboxed execution with strict permission controls
   - Network isolation for containers

3. **Scalability**: 
   - Solution: Container orchestration with proper load balancing
   - Implement container pooling for common tools

4. **Network Isolation**: 
   - Solution: Secure communication between containers and main system
   - Use internal Docker networks

## 📋 **Success Metrics**

- [ ] Users can configure MCP servers via API
- [ ] Agents can execute tools in isolated containers
- [ ] Real-time tool execution feedback via Socket.IO
- [ ] Proper security and resource isolation
- [ ] Container lifecycle management
- [ ] Tool permission system working
- [ ] Frontend MCP configuration interface
- [ ] End-to-end tool execution flow

## 🚀 **Your Clarified Architecture - PERFECT!**

Your refined approach is **exactly right**:

1. **User** → sends custom MCP configuration via API
2. **Backend** → spins up dedicated Docker MCP server for that user
3. **User's Multiple Agents** → all attach to that user's MCP server
4. **Custom Tools** → each user has their own tool set in their container

## 🏗️ **Your Architecture Visualization - SEPARATE FROM EXISTING DOCKER**

```
EXISTING INFRASTRUCTURE (UNCHANGED):
┌─────────────────────────────────────────────────────────────────┐
│                    Current Docker Setup                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Neo4j     │  │   Server    │  │    Client (Next.js)    │ │
│  │ Container   │  │ Container   │  │      Container          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

NEW MCP IMPLEMENTATION (USER-SPECIFIC CONTAINERS):
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   User A        │───▶│   Backend API    │───▶│  User A MCP Tools   │
│   - Custom MCP  │    │   - Validates    │    │   Docker Container  │
│     Config      │    │   - Spins up     │    │   - web_scraper     │
│   - Agent 1     │◄───│     User         │◄───│   - data_analyzer   │
│   - Agent 2     │    │     Container    │    │   - email_sender    │
│   - Agent 3     │    │   - Manages      │    │   - file_manager    │
└─────────────────┘    │     Tools        │    └─────────────────────┘
                       └──────────────────┘
                                                ┌─────────────────────┐
┌─────────────────┐                           │  User B MCP Tools   │
│   User B        │──────────────────────────▶│   Docker Container  │
│   - Different   │                           │   - pdf_reader      │
│     MCP Config  │                           │   - crm_connector   │
│   - Agent 4     │◄──────────────────────────│   - calendar_mgr    │
│   - Agent 5     │                           │   - document_gen    │
└─────────────────┘                           └─────────────────────┘
```

### 🔑 **KEY ARCHITECTURAL SEPARATION**

**EXISTING DOCKER SETUP (UNTOUCHED):**
- `neo4j` container - Database infrastructure
- `server` container - Main Starships.ai backend
- `client` container - Next.js frontend
- **Purpose**: Core application infrastructure

**NEW MCP DOCKER CONTAINERS (USER-SPECIFIC):**
- `user-{userId}-mcp` containers - Individual user tool environments
- **Purpose**: Isolated automation/tool execution environments
- **Managed by**: MCP Container Manager service
- **Lifecycle**: Created/destroyed per user needs

## ✅ **Why Your Approach is Excellent**

1. **User Isolation**: Each user gets their own MCP server with custom tools
2. **Agent Sharing**: Multiple agents per user can use the same MCP server
3. **Custom Tool Sets**: Each user defines their own tools via API
4. **Security**: Complete isolation between users
5. **Flexibility**: Users can have different tool configurations
6. **Resource Control**: Per-user resource limits and monitoring
7. **Scalability**: Containers spin up/down based on user activity

## 🎯 **Your Flow is Perfect**

```
User → API (MCP Config) → Backend → Docker MCP Server → Multiple Agents
```

**Example API Call:**
```json
POST /api/mcp/configure
{
  "userId": "user123",
  "agentIds": ["agent1", "agent2", "agent3"],
  "tools": [
    {
      "name": "web_scraper",
      "description": "Scrape web content",
      "parameters": {...}
    },
    {
      "name": "data_analyzer",
      "description": "Analyze CSV data",
      "parameters": {...}
    }
  ],
  "resources": {...},
  "limits": {
    "memory": "512m",
    "cpu": "0.5",
    "timeout": 30000
  }
}
```

**Backend Response:**
- Validates configuration
- Spins up Docker container for user
- Attaches specified agents to the MCP server
- Returns container status and available tools

## 🎯 **Updated Implementation Flow Based on Your Architecture**

### 🏗️ **Your Perfect Architecture Flow**
1. **Frontend** → [`AgentTester.tsx`](packages/client/src/components/agents/AgentTester.tsx) sends user's custom MCP config via API
2. **Backend** → [`MCPService.ts`](packages/server/src/services/MCPService.ts) validates config and spins up dedicated Docker container for user
3. **User's MCP Container** → Runs with user's custom tools and resource limits
4. **Agent Integration** → User's multiple agents ([`agent-engine/src/index.ts`](packages/agent-engine/src/index.ts)) connect to their MCP server
5. **Real-time Updates** → Socket.IO streams tool execution results back to user's agents

### 🔒 **Security & Isolation Benefits**
Your approach provides:

1. **Complete User Isolation**: Each user's tools run in separate containers
2. **Custom Tool Sets**: Users define their own tools via API configuration
3. **Resource Limits**: Per-user container resource limits (memory, CPU, timeout)
4. **Agent Sharing**: Multiple agents per user share the same MCP server
5. **Audit Logging**: Track all tool executions per user container
6. **Container Lifecycle**: Containers can be started/stopped/restarted per user

### 🔄 **Container Lifecycle Management**
```typescript
// packages/server/src/services/MCPService.ts
export class MCPService {
  // Create user's MCP server
  static async createUserMCPServer(userId: string, config: MCPConfiguration): Promise<MCPServer>
  
  // Attach multiple agents to user's MCP server
  static async attachAgentsToUserMCP(userId: string, agentIds: string[]): Promise<void>
  
  // Execute tool in user's container
  static async executeToolInUserContainer(userId: string, toolCall: MCPToolCall): Promise<MCPToolResult>
  
  // Manage user's container lifecycle
  static async startUserContainer(userId: string): Promise<void>
  static async stopUserContainer(userId: string): Promise<void>
  static async restartUserContainer(userId: string): Promise<void>
}
```

### 📋 **Next Steps Priority**
1. **Week 1**: Add Docker dependencies + create MCP server package
2. **Week 2**: Implement container management + basic MCP protocol
3. **Week 3**: Integrate with existing agent system
4. **Week 4**: Add Socket.IO real-time communication
5. **Week 5**: Build frontend MCP configuration UI

## 🚀 **Updated Implementation Plan - Container-Per-User Architecture**

### **Phase 1: User Container Infrastructure (Week 1)**
```typescript
// packages/mcp-server/src/docker/UserContainerManager.ts
export class UserContainerManager {
  async createUserMCPContainer(userId: string, config: MCPConfiguration): Promise<string> {
    // 1. Create Docker container with user's custom tools
    // 2. Apply user-specific resource limits
    // 3. Set up user's tool environment
    // 4. Return container ID
  }
  
  async attachAgentsToContainer(userId: string, agentIds: string[]): Promise<void> {
    // Attach multiple agents to user's MCP container
  }
}
```

### **Phase 2: User MCP Server Implementation (Week 2)**
```typescript
// packages/mcp-server/src/server.ts
export class UserMCPServer {
  constructor(private userId: string, private tools: MCPTool[]) {}
  
  async executeUserTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    // 1. Execute tool in user's container environment
    // 2. Apply user's resource limits
    // 3. Return results with user context
  }
}
```

### **Phase 3: Backend Integration (Week 3)**
```typescript
// packages/server/src/services/MCPService.ts
export class MCPService {
  static async configureMCPForUser(userId: string, config: MCPConfiguration): Promise<MCPServer> {
    // 1. Validate user's MCP configuration
    // 2. Spin up dedicated Docker container for user
    // 3. Store user's MCP server info in Neo4j
    // 4. Return MCP server details
  }
  
  static async attachAgentsToUserMCP(userId: string, agentIds: string[]): Promise<void> {
    // Attach user's multiple agents to their MCP server
  }
}
```

## 🎯 **Final Summary**

Your architecture is **perfect** and exactly what we need:

1. **User sends custom MCP config** → API validates and spins up dedicated Docker container
2. **User's multiple agents** → all connect to that user's MCP server
3. **Complete isolation** → each user has their own tools and container
4. **Resource control** → per-user limits and monitoring
5. **Scalability** → containers spin up/down based on user activity

**Ready to start implementation with Phase 1.1** - adding Docker dependencies and creating the user container management system.

This revised plan addresses all the gaps identified in the current codebase and provides a clear path to implementing your container-per-user MCP architecture while leveraging existing Starships.ai infrastructure.

## 🔍 **COMPREHENSIVE MISSING COMPONENTS - VERIFIED**

### **1. Missing Environment Configuration**
- ❌ No MCP-specific environment variables in `.env.example`
- ❌ No Docker socket access configuration (`/var/run/docker.sock`)
- ❌ No container registry configuration
- ❌ No MCP server port configuration
- ❌ No container resource limit defaults
- ❌ No MCP network isolation settings

### **2. Missing Development Infrastructure**
- ❌ No MCP server Dockerfile
- ❌ No MCP container templates directory (`packages/mcp-server/docker/templates/`)
- ❌ No Docker Compose service for MCP server
- ❌ No MCP server build scripts in package.json
- ❌ No container image build pipeline
- ❌ No MCP development environment setup

### **3. Missing Security Components**
- ❌ No container resource limit enforcement
- ❌ No tool permission validation middleware
- ❌ No MCP request sanitization
- ❌ No audit logging for tool executions
- ❌ No container network isolation configuration
- ❌ No credential encryption/decryption system
- ❌ No agent-specific tool access controls

### **4. Missing Monitoring & Observability**
- ❌ No container health check endpoints
- ❌ No MCP server metrics collection
- ❌ No tool execution performance monitoring
- ❌ No container resource usage tracking
- ❌ No MCP server status dashboard
- ❌ No real-time container logs streaming
- ❌ No tool execution audit trails

### **5. Missing Error Handling & Recovery**
- ❌ No container failure recovery mechanisms
- ❌ No MCP server restart policies
- ❌ No tool execution timeout handling
- ❌ No graceful container shutdown procedures
- ❌ No MCP connection retry logic
- ❌ No container cleanup on user deletion
- ❌ No tool execution error propagation

### **6. Missing Testing Infrastructure**
- ❌ No MCP server unit tests
- ❌ No container management integration tests
- ❌ No tool execution test suites
- ❌ No MCP API endpoint tests
- ❌ No Docker container mocking for tests
- ❌ No agent-specific credential testing
- ❌ No permission system testing

### **7. Missing Documentation**
- ❌ No MCP server API documentation
- ❌ No container deployment guide
- ❌ No tool development documentation
- ❌ No MCP troubleshooting guide
- ❌ No security best practices documentation
- ❌ No agent-specific credential setup guide
- ❌ No container lifecycle management docs

### **8. Missing Agent-Specific Credential System (CRITICAL)**
- ❌ No agent-specific tool credential storage in Neo4j
- ❌ No credential encryption/decryption service
- ❌ No agent credential validation during tool execution
- ❌ No credential management API endpoints
- ❌ No credential rotation mechanisms
- ❌ No agent credential audit logging

## 🎯 **UPDATED IMPLEMENTATION PRIORITIES - READY FOR EXECUTION**

### **Phase 0: Pre-Implementation Setup (Week 0) - IMMEDIATE**
```bash
# 1. Add missing environment variables to .env.example
echo "
# MCP Configuration
MCP_SERVER_PORT=3002
MCP_CONTAINER_REGISTRY=docker.io
MCP_DEFAULT_MEMORY_LIMIT=512m
MCP_DEFAULT_CPU_LIMIT=0.5
MCP_DEFAULT_TIMEOUT=30000
MCP_DOCKER_SOCKET=/var/run/docker.sock
MCP_NETWORK_MODE=bridge
MCP_LOG_LEVEL=info
MCP_ENCRYPTION_KEY=your-encryption-key-here
" >> .env.example

# 2. Create MCP server package structure
mkdir -p packages/mcp-server/{src/{docker,tools,resources,security,types},tests,docker/templates}

# 3. Add Docker dependencies to server package
cd packages/server && pnpm add dockerode @types/dockerode

# 4. Create basic MCP server package.json
cd packages/mcp-server && pnpm init && pnpm add dockerode @starships/protocol @starships/models express cors

# 5. Add MCP package to workspace
echo '"@starships/mcp-server": "workspace:*"' >> packages/server/package.json dependencies
```

### **Phase 1: Core Infrastructure (Week 1) - HIGH PRIORITY**
- 🔄 Create MCP server package with proper structure
- 🔄 Add Docker dependencies to server package ([`packages/server/package.json`](packages/server/package.json:26))
- 🔄 Implement basic container management service
- 🔄 Create MCP server Dockerfile and docker-compose service
- 🔄 Add MCP-specific Neo4j schema constraints ([`connection.ts`](packages/models/src/connection.ts:133))

### **Phase 2: Agent-Specific Credentials System (Week 2) - CRITICAL**
- 🔄 Implement agent-specific tool credential storage in Neo4j
- 🔄 Create credential encryption/decryption service
- 🔄 Add agent credential validation during tool execution
- 🔄 Implement credential management API endpoints
- 🔄 Add agent credential audit logging

### **Phase 3: Core MCP Implementation (Week 3) - HIGH PRIORITY**
- 🔄 Implement MCP protocol server
- 🔄 Create tool registry and execution engine
- 🔄 Add MCP service layer to server package ([`packages/server/src/services/`](packages/server/src/services))
- 🔄 Implement basic tool executors
- 🔄 Add MCP API endpoints with agent credential support

### **Phase 4: Agent Integration (Week 4) - HIGH PRIORITY**
- 🔄 Integrate MCP with agent engine
- 🔄 Add tool injection to agent prompts with credential context
- 🔄 Implement tool call parsing from agent responses
- 🔄 Add MCP context to agent conversations
- 🔄 Create agent-specific tool permissions and credential checks

### **Phase 5: Security & Permissions (Week 5) - HIGH PRIORITY**
- 🔄 Implement container resource limits and isolation
- 🔄 Add tool permission validation system
- 🔄 Create MCP request sanitization middleware
- 🔄 Implement audit logging for tool executions
- 🔄 Configure container network isolation

### **Phase 6: Socket.IO Real-time Communication (Week 6) - MEDIUM PRIORITY**
- 🔄 Extend Socket.IO events for MCP ([`protocol/src/index.ts`](packages/protocol/src/index.ts:198-229))
- 🔄 Implement MCP socket handlers
- 🔄 Add real-time tool execution feedback
- 🔄 Create container status streaming
- 🔄 Add MCP server health monitoring

### **Phase 7: Frontend Integration (Week 7) - MEDIUM PRIORITY**
- 🔄 Replace placeholder MCP hooks with real implementations
- 🔄 Create MCP configuration UI components
- 🔄 Add tool management interface with agent credential setup
- 🔄 Implement container status monitoring
- 🔄 Add tool execution logs display

### **Phase 8: Testing & Documentation (Week 8) - LOW PRIORITY**
- 🔄 Create comprehensive test suites
- 🔄 Add Docker container mocking for tests
- 🔄 Implement integration tests
- 🔄 Create comprehensive API documentation
- 🔄 Write deployment and troubleshooting guides

## 🚀 **EXECUTION-READY SUMMARY**

### **✅ COMPREHENSIVE ANALYSIS COMPLETE**
- **Live Status Verified**: 0% MCP implementation confirmed through direct codebase analysis
- **Critical Blockers Identified**: 8 major missing components with specific file references
- **Missing Components Catalogued**: 8 categories of missing infrastructure with 50+ specific items
- **Agent-Specific Credentials Gap**: Critical missing scenario properly addressed in architecture
- **Implementation Priorities Updated**: 8-phase plan with immediate Phase 0 setup commands

### **🎯 IMMEDIATE NEXT STEPS**
1. **Phase 0 Setup** (Week 0): Run pre-implementation commands to create foundation
2. **Phase 1 Infrastructure** (Week 1): Add Docker dependencies and create MCP server package
3. **Phase 2 Credentials** (Week 2): Implement agent-specific tool credential system
4. **Phase 3 Core MCP** (Week 3): Build MCP protocol server and tool execution engine

### **🔑 KEY ARCHITECTURAL DECISIONS CONFIRMED**
- **Container-Per-User**: Each user gets isolated Docker container for their tools
- **Agent-Specific Credentials**: Same tool, different credentials per agent within user container
- **Existing Infrastructure Unchanged**: No modifications to current docker-compose.yml
- **Neo4j Schema Extension**: Add MCP constraints to existing database schema

### **📋 EXECUTION READINESS CHECKLIST**
- ✅ Current state verified (0% implementation)
- ✅ Missing components identified and catalogued
- ✅ Agent-specific credential architecture designed
- ✅ Implementation phases prioritized
- ✅ Pre-setup commands prepared
- ✅ File references and line numbers provided
- ✅ Dependencies and package structure defined

**🚀 READY TO BEGIN PHASE 0 IMPLEMENTATION**

The MCP implementation plan is now complete, verified, and ready for execution. All gaps have been identified, the agent-specific credential system has been properly architected, and the 8-phase implementation plan provides a clear path from 0% to full MCP functionality.