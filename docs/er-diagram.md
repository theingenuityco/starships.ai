# Starships.ai Entity Relationship Diagram

## Comprehensive Data Model

```mermaid
erDiagram
    %% Core User and Starship System
    User {
        string id PK
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

    %% Workflow System

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

    %% Starship Relationships
    Starship ||--|| Vision : "HAS_VISION"
    Starship ||--o{ Agent : "DEPLOYED_ON"

    %% Agent System Relationships
    LLM ||--o{ AgentTemplate : "REFERENCES"
    LLM ||--o{ Agent : "REFERENCES"
    AgentTemplate ||--o{ Agent : "CREATES_FROM"

    %% Workflow Relationships
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

    %% Agent System
    U --> AT[AgentTemplate]
    AT --> A
    L[LLM] --> AT
    L --> A

    %% Workflow System
    WN[WorkflowNode] --> WE[WorkflowEdge]
    WRS[WorkflowRuntimeState]

    %% Stripe Integration
    SE[StripeEvent] -.-> S

    %% Styling
    classDef primary fill:#e1f5fe
    classDef secondary fill:#f3e5f5
    classDef system fill:#e8f5e8
    classDef security fill:#ffebee
    classDef integration fill:#fff3e0

    class U,S primary
    class A,V secondary
    class L,AT system
    class SE integration
```

## Key Relationships and Constraints

### Core Business Logic

- **Starship Classes**: Scout (3 agents, 3 missions), Cruiser (5 agents, 6 missions), Draught (10 agents, 10 missions)
- **Vision**: Each starship has exactly one vision that can be refined over time
- **Agent Deployment**: Agents are deployed to specific starships via `starshipId` FK

### Data Flow Patterns

- **Workflow Execution**: Workflow runtime state tracks execution progress
- **Message Threading**: Message entities maintain conversation history with proper threading
- **Template System**: `AgentTemplate` → `Agent` creation flow with usage tracking

### Security & Integration

- **Stripe Integration**: `StripeEvent` ensures webhook idempotency; `User.stripeCustomerId` and `Starship.stripeCustomerId` link to Stripe

### Technical Implementation Notes

- **PostgreSQL Relationships**: Repository code uses foreign keys and JOIN operations for relationships
- **JSON Storage**: Complex objects (workflow parameters, execution results, metadata) stored as JSONB
- **Soft References**: Agent IDs in missions stored as string arrays for flexibility
- **Slug Generation**: Starship slugs are auto-generated with collision handling
