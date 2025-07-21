# MCP Server Connector Instance Architecture

## Current vs. Proposed Architecture

### Current System (Template Sharing)

```mermaid
graph TD
    U1[User 1 - Starship A] -->|HAS_CONNECTOR| MSO1[MCPServerOption: GitHub]
    U2[User 2 - Starship B] -->|HAS_CONNECTOR| MSO1
    U3[User 3 - Starship C] -->|HAS_CONNECTOR| MSO2[MCPServerOption: Puppeteer]
    U1 -->|HAS_CONNECTOR| MSO2

    MSO1 --> |Shared Config| CONFIG1[command: docker<br/>args: [run, github-mcp]<br/>env: {API_KEY: required}]
    MSO2 --> |Shared Config| CONFIG2[command: npx<br/>args: [@puppeteer/mcp]<br/>env: {}]

    style MSO1 fill:#ffcccc
    style MSO2 fill:#ffcccc
    style CONFIG1 fill:#ffe6e6
    style CONFIG2 fill:#ffe6e6
```

**Problems:**

- Shared configuration across all starships
- No individual customization
- No instance-specific status tracking
- Difficult to manage per-starship settings

### Proposed System (Instance-Based)

```mermaid
graph TD
    subgraph "Templates (Shared)"
        MSO1[MCPServerOption: GitHub<br/>Template]
        MSO2[MCPServerOption: Puppeteer<br/>Template]
    end

    subgraph "User 1 - Starship A"
        SA[Starship A]
        MSC1[MCPServerConnector<br/>GitHub Instance A<br/>Status: Active<br/>Custom Env: {API_KEY: user1_key}]
        MSC2[MCPServerConnector<br/>Puppeteer Instance A<br/>Status: Error<br/>Error: Connection timeout]
    end

    subgraph "User 2 - Starship B"
        SB[Starship B]
        MSC3[MCPServerConnector<br/>GitHub Instance B<br/>Status: Active<br/>Custom Env: {API_KEY: user2_key}]
    end

    subgraph "User 3 - Starship C"
        SC[Starship C]
        MSC4[MCPServerConnector<br/>Puppeteer Instance C<br/>Status: Inactive<br/>Custom Name: Web Scraper]
    end

    SA -->|HAS_CONNECTOR_INSTANCE| MSC1
    SA -->|HAS_CONNECTOR_INSTANCE| MSC2
    SB -->|HAS_CONNECTOR_INSTANCE| MSC3
    SC -->|HAS_CONNECTOR_INSTANCE| MSC4

    MSC1 -->|CREATED_FROM| MSO1
    MSC2 -->|CREATED_FROM| MSO2
    MSC3 -->|CREATED_FROM| MSO1
    MSC4 -->|CREATED_FROM| MSO2

    style MSO1 fill:#e6f3ff
    style MSO2 fill:#e6f3ff
    style MSC1 fill:#ccffcc
    style MSC2 fill:#ffcccc
    style MSC3 fill:#ccffcc
    style MSC4 fill:#ffffcc
```

**Benefits:**

- Individual instances per starship
- Custom configuration per instance
- Independent status tracking
- Personalized naming and settings

## Data Flow Architecture

### Connector Instance Creation Flow

```mermaid
sequenceDiagram
    participant UI as ConnectorSelector UI
    participant API as MCP Server API
    participant SR as StarshipRepository
    participant CR as ConnectorRepository
    participant DB as Neo4j Database

    UI->>API: POST /starships/{id}/connectors
    Note over UI,API: {templateId: "github", customName: "My GitHub"}

    API->>SR: createConnectorInstance(starshipId, templateId, customName)
    SR->>CR: findById(templateId)
    CR->>DB: MATCH (mso:MCPServerOption {id: templateId})
    DB-->>CR: Return template data
    CR-->>SR: MCPServerOption template

    SR->>DB: CREATE (msc:MCPServerConnector {...})
    SR->>DB: CREATE (starship)-[:HAS_CONNECTOR_INSTANCE]->(msc)
    SR->>DB: CREATE (msc)-[:CREATED_FROM]->(template)

    DB-->>SR: MCPServerConnector instance
    SR-->>API: MCPServerConnector instance
    API-->>UI: {connector: MCPServerConnector, template: MCPServerOption}

    UI->>UI: Update connector list display
```

### Connector Instance Status Update Flow

```mermaid
sequenceDiagram
    participant System as Background Process
    participant API as MCP Server API
    participant CR as ConnectorRepository
    participant DB as Neo4j Database
    participant UI as ConnectorSelector UI

    System->>API: PATCH /starships/{id}/connectors/{connectorId}/status
    Note over System,API: {status: "error", errorMessage: "Connection failed"}

    API->>CR: updateStatus(connectorId, status, errorMessage)
    CR->>DB: MATCH (msc:MCPServerConnector {id: connectorId})
    CR->>DB: SET msc.status = status, msc.errorMessage = errorMessage

    DB-->>CR: Updated MCPServerConnector
    CR-->>API: Updated instance
    API-->>System: Success response

    Note over UI: Real-time updates via WebSocket/polling
    UI->>API: GET /starships/{id}/connectors
    API-->>UI: Updated connector instances with status
    UI->>UI: Update status indicators
```

## Database Schema Evolution

### Before (Current)

```cypher
// Current relationship structure
(Starship)-[:HAS_CONNECTOR {connectedAt: datetime, isActive: boolean}]->(MCPServerOption)
```

### After (Proposed)

```cypher
// New relationship structure
(Starship)-[:HAS_CONNECTOR_INSTANCE {createdAt: datetime}]->(MCPServerConnector)
(MCPServerConnector)-[:CREATED_FROM {createdAt: datetime}]->(MCPServerOption)

// MCPServerConnector node properties
MCPServerConnector {
  id: string,
  starshipId: string,
  templateId: string,
  name: string,
  command: string,
  args: [string],
  env: string,
  status: enum,
  isActive: boolean,
  connectedAt: datetime,
  lastUsed: datetime,
  errorMessage: string,
  customConfig: string,
  createdAt: datetime,
  updatedAt: datetime
}
```

## Component Architecture

### UI Component Hierarchy

```mermaid
graph TD
    CC[CrewContent] --> CS[ConnectorSelector]
    CS --> CTB[ConnectorTemplatesBrowser]
    CS --> CIL[ConnectorInstancesList]
    CS --> CIM[ConnectorInstanceModal]

    CTB --> TCard[TemplateCard]
    CIL --> ICard[InstanceCard]
    CIM --> CF[ConfigurationForm]
    CIM --> SF[StatusForm]

    ICard --> SI[StatusIndicator]
    ICard --> AM[ActionMenu]

    style CS fill:#e6f3ff
    style CTB fill:#fff2e6
    style CIL fill:#e6ffe6
    style CIM fill:#ffe6f3
```

### API Layer Structure

```mermaid
graph TD
    subgraph "Client API Layer"
        MSAPI[mcpServerAPI]
        SAPI[starshipAPI]
    end

    subgraph "Server Routes"
        MSR[mcp-servers.ts]
        SR[starships.ts]
    end

    subgraph "Repository Layer"
        MSCR[MCPServerConnectorRepository]
        MSOR[MCPServerOptionRepository]
        STRR[StarshipRepository]
    end

    subgraph "Database"
        NEO[(Neo4j)]
    end

    MSAPI --> MSR
    SAPI --> SR
    MSR --> MSCR
    MSR --> MSOR
    SR --> STRR
    MSCR --> NEO
    MSOR --> NEO
    STRR --> NEO

    style MSAPI fill:#e6f3ff
    style SAPI fill:#e6f3ff
    style MSR fill:#fff2e6
    style SR fill:#fff2e6
    style MSCR fill:#e6ffe6
    style MSOR fill:#e6ffe6
    style STRR fill:#e6ffe6
```

## Migration Strategy Visualization

### Phase 1: Schema Migration

```mermaid
graph LR
    subgraph "Before Migration"
        S1[Starship A] -->|HAS_CONNECTOR| MSO1[GitHub Template]
        S2[Starship B] -->|HAS_CONNECTOR| MSO1
    end

    subgraph "After Migration"
        S1A[Starship A] -->|HAS_CONNECTOR_INSTANCE| MSC1[GitHub Instance A]
        S2A[Starship B] -->|HAS_CONNECTOR_INSTANCE| MSC2[GitHub Instance B]
        MSC1 -->|CREATED_FROM| MSO1A[GitHub Template]
        MSC2 -->|CREATED_FROM| MSO1A
    end

    S1 -.->|Migrate| S1A
    S2 -.->|Migrate| S2A
    MSO1 -.->|Preserve| MSO1A

    style S1 fill:#ffcccc
    style S2 fill:#ffcccc
    style MSO1 fill:#ffcccc
    style S1A fill:#ccffcc
    style S2A fill:#ccffcc
    style MSC1 fill:#ccffcc
    style MSC2 fill:#ccffcc
    style MSO1A fill:#e6f3ff
```

### Migration Cypher Query

```cypher
// Step 1: Create connector instances from existing relationships
MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
CREATE (msc:MCPServerConnector {
  id: randomUUID(),
  starshipId: s.id,
  templateId: mso.id,
  name: mso.name,
  command: mso.command,
  args: mso.args,
  env: mso.env,
  status: 'active',
  isActive: coalesce(r.isActive, true),
  connectedAt: coalesce(r.connectedAt, datetime()),
  createdAt: datetime(),
  updatedAt: datetime()
})

// Step 2: Create new relationships
CREATE (s)-[:HAS_CONNECTOR_INSTANCE {createdAt: datetime()}]->(msc)
CREATE (msc)-[:CREATED_FROM {createdAt: datetime()}]->(mso)

// Step 3: Remove old relationships (after validation)
DELETE r
```

This architecture provides a clear separation between templates and instances, enabling personalized connector management while maintaining the flexibility of the template system.
