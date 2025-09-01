# Starships.ai Entity Relationship Diagram

## Comprehensive Data Model

```mermaid
erDiagram
    %% Core User and Starship System
    User {
        string id PK
        string kindeId UK
        string username
        string email
        string displayName
        string avatar
        string stripeCustomerId "Stripe integration"
        string createdAt
    }

    Starship {
        string id PK
        string slug UK "Unique per owner"
        string ownerId FK
        string class "scout|cruiser|draught"
        string name
        int maxAgents "Class-based limits"
        int maxActiveMissions
        string status "active|inactive|restricted|disabled|pending_payment"
        string subscriptionId
        string plan "scout|cruiser|draught"
        string billingPeriod "monthly|yearly"
        string stripeCustomerId "Stripe integration"
        string createdAt
        string updatedAt
    }

    Vision {
        string id PK
        string starshipId FK
        string statement
        float confidence
        int refinementCount
        string lastRefined
        boolean isActive
        float clarityScore
        float specificityScore
        float actionabilityScore
        float inspirationalScore
        float overallQuality
        boolean hasObjectives
        boolean hasTimeframe
        boolean hasMeasurables
        string createdAt
        string updatedAt
    }

    %% AI Agent System
    LLM {
        string id PK
        string name
        string provider "openai|anthropic"
        int maxTokens
        float temperature
        boolean supportsStreaming
        boolean supportsTools
        float costPer1kTokens
        string createdAt
    }

    AgentTemplate {
        string id PK
        string name
        string description
        string category "general|coding|creative|analysis|support"
        string[] tags
        string model FK "References LLM.id"
        float temperature
        int maxTokens
        string authorId FK
        boolean isPublic
        int usageCount
        float rating
        string icon
        string[] previewPrompts
        string createdAt
        string updatedAt
    }

    Agent {
        string id PK
        string starshipId FK "Direct FK - Key Change"
        string name
        string model FK "References LLM.id"
        string description
        string[] tags
        string category "general|coding|creative|analysis|support"
        string authorId FK
        boolean isPublic
        string version
        int usageCount
        float rating
        float temperature
        int maxTokens
        string[] allowedStarshipClasses
        string[] requiredPermissions
        string createdAt
        string updatedAt
    }

    %% Mission System
    Mission {
        string id PK
        string starshipId FK
        string name
        string description
        string status "draft|active|completed|failed|cancelled"
        string phase "welcome|analysis|plan|execute|converse"
        string[] agentIds "Assigned agent IDs"
        string createdBy FK
        json executionState "Workflow execution progress"
        json executionResult "Final execution results"
        string createdAt
        string updatedAt
    }

    MissionMessage {
        string id PK
        string missionId FK
        string role "user|orchestrator|system"
        string content
        string timestamp
        string userId FK "When role=user"
        string senderName "Cached display name"
        json metadata
    }

    MissionClarity {
        string id PK
        string missionId FK
        float objectiveClarity "0-10 scoring"
        float successMetrics
        float timelineDefinition
        float scopeBoundaries
        float visionAlignment
        float overallScore "Calculated average"
        string reasoning "AI qualitative analysis"
        int iteration "Assessment iteration"
        string createdAt
        string updatedAt
    }

    %% Workflow System
    MissionWorkflow {
        string id PK
        string missionId FK
        json nodes "WorkflowNode[]"
        json edges "WorkflowEdge[]"
        string approvalStatus "pending|approved|rejected"
        string createdAt
        string approvedAt
    }

    WorkflowNode {
        string id PK
        string workflowId FK
        string type "agent|conditional|user_prompt|output|start|end"
        string name
        string description
        int estimatedTime "In minutes"
        json parameters "Node-specific parameters"
        json position "For visual layout"
        json metadata "Additional node metadata"
    }

    WorkflowEdge {
        string id PK
        string workflowId FK
        string from FK "Source node ID"
        string to FK "Target node ID"
        string condition "Condition key for routing"
        string label "Human-readable edge label"
        json metadata "Additional edge metadata"
    }

    WorkflowRuntimeState {
        string id PK
        string workflowId FK
        string currentNodeId FK
        string status "not_started|running|paused|completed|failed|cancelled"
        json executionResults "Map of nodeId to result"
        string startTime
        string endTime
        string pausedAt
        json error
        string createdAt
        string updatedAt
    }

    %% Security and API Management
    NativeToolApiKey {
        string id PK
        string starshipId FK
        string toolName
        string encryptedApiKey "AES-256-GCM encrypted"
        string createdAt
        string updatedAt
    }

    %% Stripe Integration
    StripeEvent {
        string eventId PK
        string eventType
        string processedAt
    }

    %% Primary Relationships
    User ||--o{ Starship : "OWNS"
    User ||--o{ Agent : "CREATES"
    User ||--o{ AgentTemplate : "CREATES"
    User ||--o{ Mission : "CREATES"
    User ||--o{ MissionMessage : "SENDS"

    %% Starship Relationships
    Starship ||--|| Vision : "HAS_VISION"
    Starship ||--o{ Agent : "DEPLOYED_ON"
    Starship ||--o{ Mission : "HAS"
    Starship ||--o{ NativeToolApiKey : "HAS_API_KEYS"

    %% Agent System Relationships
    LLM ||--o{ AgentTemplate : "REFERENCES"
    LLM ||--o{ Agent : "REFERENCES"
    AgentTemplate ||--o{ Agent : "CREATES_FROM"

    %% Mission Relationships
    Mission ||--|| MissionWorkflow : "HAS_WORKFLOW"
    Mission ||--o{ MissionMessage : "BELONGS_TO"
    Mission ||--o{ MissionClarity : "HAS_CLARITY"

    %% Workflow Relationships
    MissionWorkflow ||--o{ WorkflowNode : "CONTAINS"
    MissionWorkflow ||--|| WorkflowRuntimeState : "HAS_RUNTIME_STATE"
    WorkflowNode ||--o{ WorkflowEdge : "FLOWS_FROM"
    WorkflowNode ||--o{ WorkflowEdge : "FLOWS_TO"

```

## Concise Core Domain Model

```mermaid
graph TD
    %% Core Entities
    U[User] --> S[Starship]
    S --> V[Vision]
    S --> A[Agent]
    S --> M[Mission]
    S --> NK[NativeToolApiKey]

    %% Agent System
    U --> AT[AgentTemplate]
    AT --> A
    L[LLM] --> AT
    L --> A

    %% Mission System
    M --> MW[MissionWorkflow]
    MW --> WN[WorkflowNode]
    WN --> WE[WorkflowEdge]
    MW --> WRS[WorkflowRuntimeState]
    M --> MM[MissionMessage]
    M --> MC[MissionClarity]
    U --> MM

    %% Stripe Integration
    SE[StripeEvent] -.-> S

    %% Styling
    classDef primary fill:#e1f5fe
    classDef secondary fill:#f3e5f5
    classDef system fill:#e8f5e8
    classDef security fill:#ffebee
    classDef integration fill:#fff3e0

    class U,S primary
    class A,M,V secondary
    class L,AT system
    class NK security
    class SE integration
```

## Key Relationships and Constraints

### Core Business Logic
- **Starship Classes**: Scout (3 agents, 3 missions), Cruiser (5 agents, 6 missions), Draught (10 agents, 10 missions)
- **Vision**: Each starship has exactly one vision that can be refined over time
- **Agent Deployment**: Agents are deployed to specific starships via `starshipId` FK
- **Mission Assignment**: Missions belong to starships and reference assigned agent IDs as arrays

### Data Flow Patterns
- **Workflow Execution**: `Mission` → `MissionWorkflow` → `WorkflowRuntimeState` tracks execution progress
- **Message Threading**: `MissionMessage` entities belong to missions and maintain conversation history
- **Clarity Assessment**: `MissionClarity` provides AI-driven mission assessment with 5-dimensional scoring
- **Template System**: `AgentTemplate` → `Agent` creation flow with usage tracking

### Security & Integration
- **API Key Management**: `NativeToolApiKey` stores encrypted tool credentials per starship
- **Stripe Integration**: `StripeEvent` ensures webhook idempotency; `User.stripeCustomerId` and `Starship.stripeCustomerId` link to Stripe
- **Authentication**: `User.kindeId` provides external auth integration

### Technical Implementation Notes
- **Neo4j Relationships**: Repository code maintains both FK references and Neo4j relationship patterns
- **JSON Storage**: Complex objects (workflow parameters, execution results, metadata) stored as JSON
- **Soft References**: Agent IDs in missions stored as string arrays for flexibility
- **Encryption**: Native tool API keys use AES-256-GCM encryption
- **Slug Generation**: Starship slugs are auto-generated with collision handling