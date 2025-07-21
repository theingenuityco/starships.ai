# MCP Server Connector Instance Examples

## What an MCPServerConnector Node Looks Like

Let me show you exactly what an `MCPServerConnector` node would look like for a specific user's starship with concrete examples.

## Example: User "Alice" with Starship "Explorer-1"

### Scenario

Alice has a Scout-class starship called "Explorer-1" and she wants to add GitHub and Puppeteer connectors to help with her development work.

### Template Nodes (Shared across all users)

```cypher
// These are the shared templates that all users can use
(:MCPServerOption {
  id: "github-template",
  name: "GitHub",
  command: "docker",
  args: ["run", "--rm", "-i", "mcp/github"],
  env: '{"GITHUB_PERSONAL_ACCESS_TOKEN": "required"}'
})

(:MCPServerOption {
  id: "puppeteer-template",
  name: "Puppeteer",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-puppeteer"],
  env: '{}'
})
```

### Alice's Connector Instance Nodes

When Alice selects these templates for her starship, the system creates dedicated instances:

```cypher
// Alice's GitHub connector instance
(:MCPServerConnector {
  id: "msc_alice_github_001",
  starshipId: "starship_alice_explorer1",
  templateId: "github-template",
  name: "Alice's GitHub Connector",           // She can customize the name
  command: "docker",                          // Copied from template
  args: ["run", "--rm", "-i", "mcp/github"], // Copied from template
  env: '{"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_alice_personal_token_xyz123"}', // Her personal token
  status: "active",
  isActive: true,
  connectedAt: "2025-01-20T10:30:00Z",
  lastUsed: "2025-01-20T11:15:00Z",
  errorMessage: null,
  customConfig: '{"max_repos": 50, "default_branch": "main"}', // Alice's custom settings
  createdAt: "2025-01-20T10:30:00Z",
  updatedAt: "2025-01-20T11:15:00Z"
})

// Alice's Puppeteer connector instance
(:MCPServerConnector {
  id: "msc_alice_puppeteer_001",
  starshipId: "starship_alice_explorer1",
  templateId: "puppeteer-template",
  name: "Web Scraper Pro",                    // Alice gave it a custom name
  command: "npx",                             // Copied from template
  args: ["-y", "@modelcontextprotocol/server-puppeteer"], // Copied from template
  env: '{"PUPPETEER_HEADLESS": "true", "PUPPETEER_TIMEOUT": "30000"}', // Alice's custom env
  status: "error",                            // Currently having issues
  isActive: false,
  connectedAt: "2025-01-20T10:35:00Z",
  lastUsed: "2025-01-20T10:45:00Z",
  errorMessage: "Connection timeout after 30 seconds",
  customConfig: '{"viewport": {"width": 1920, "height": 1080}, "user_agent": "Alice-Bot/1.0"}',
  createdAt: "2025-01-20T10:35:00Z",
  updatedAt: "2025-01-20T10:50:00Z"
})
```

### Relationships in Neo4j

```cypher
// Alice's starship has these connector instances
(:Starship {id: "starship_alice_explorer1"})-[:HAS_CONNECTOR_INSTANCE]->(:MCPServerConnector {id: "msc_alice_github_001"})
(:Starship {id: "starship_alice_explorer1"})-[:HAS_CONNECTOR_INSTANCE]->(:MCPServerConnector {id: "msc_alice_puppeteer_001"})

// Each instance knows which template it came from
(:MCPServerConnector {id: "msc_alice_github_001"})-[:CREATED_FROM]->(:MCPServerOption {id: "github-template"})
(:MCPServerConnector {id: "msc_alice_puppeteer_001"})-[:CREATED_FROM]->(:MCPServerOption {id: "puppeteer-template"})
```

## Comparison: Another User "Bob" with Same Templates

Bob also uses GitHub and Puppeteer, but his instances are completely separate:

```cypher
// Bob's GitHub connector instance - different configuration
(:MCPServerConnector {
  id: "msc_bob_github_001",
  starshipId: "starship_bob_voyager2",
  templateId: "github-template",
  name: "GitHub Integration",                 // Different name
  command: "docker",
  args: ["run", "--rm", "-i", "mcp/github"],
  env: '{"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_bob_different_token_abc789"}', // Bob's token
  status: "active",
  isActive: true,
  connectedAt: "2025-01-19T14:20:00Z",
  lastUsed: "2025-01-20T09:30:00Z",
  errorMessage: null,
  customConfig: '{"max_repos": 100, "include_private": true}', // Bob's different settings
  createdAt: "2025-01-19T14:20:00Z",
  updatedAt: "2025-01-20T09:30:00Z"
})
```

## What This Enables

### 1. **Personalization**

- Alice calls her Puppeteer connector "Web Scraper Pro"
- Bob calls his "GitHub Integration"
- Each has their own API tokens and configuration

### 2. **Independent Status**

- Alice's Puppeteer connector is having errors
- Bob's GitHub connector is working fine
- They don't affect each other

### 3. **Custom Configuration**

- Alice sets viewport size for Puppeteer
- Bob includes private repos in GitHub
- Each optimized for their workflow

### 4. **Individual Lifecycle**

- Alice can update her GitHub token without affecting Bob
- Bob can restart his connector without impacting Alice
- Each has separate usage tracking and error logs

## In the UI, Alice Would See:

```
┌─ Connectors for Explorer-1 ─────────────────────────┐
│                                                     │
│ ✅ Alice's GitHub Connector                         │
│    Status: Active • Last used: 2 minutes ago       │
│    Template: GitHub • Custom config: 2 settings    │
│    [Configure] [Restart] [Remove]                   │
│                                                     │
│ ❌ Web Scraper Pro                                  │
│    Status: Error - Connection timeout              │
│    Template: Puppeteer • Last used: 30 minutes ago │
│    [Troubleshoot] [Configure] [Remove]              │
│                                                     │
│ [+ Add Connector]                                   │
└─────────────────────────────────────────────────────┘
```

## Key Differences from Current System

### Current System (Template Sharing)

```cypher
// Multiple starships share the same template node
(Alice_Starship)-[:HAS_CONNECTOR]->(GitHub_Template)
(Bob_Starship)-[:HAS_CONNECTOR]->(GitHub_Template)
// No individual configuration possible
```

### New System (Instance-Based)

```cypher
// Each starship has its own connector instance
(Alice_Starship)-[:HAS_CONNECTOR_INSTANCE]->(Alice_GitHub_Instance)
(Bob_Starship)-[:HAS_CONNECTOR_INSTANCE]->(Bob_GitHub_Instance)

// Instances reference the template they came from
(Alice_GitHub_Instance)-[:CREATED_FROM]->(GitHub_Template)
(Bob_GitHub_Instance)-[:CREATED_FROM]->(GitHub_Template)
```

## Real-World Benefits

1. **Alice can have her GitHub token** while Bob has his own
2. **Alice can name her connectors** descriptively for her workflow
3. **Alice's connector errors** don't affect Bob's connectors
4. **Alice can customize settings** like timeout values, viewport sizes, etc.
5. **Alice can see usage statistics** specific to her connectors
6. **Alice can restart/troubleshoot** her connectors independently

This gives Alice complete control over her connector instances while keeping them isolated from other users' configurations, just like how each user can create their own agents from shared agent templates.
