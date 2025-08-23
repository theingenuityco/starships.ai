# Starships.ai ER Diagram

Render with a Mermaid-capable Markdown viewer (VS Code preview, GitHub web, etc.).

```mermaid
erDiagram
  %% Conventions: Enums/arrays/json are stored as strings for visualization
  USER {
    string id PK
    string kindeId
    string username
    string email
    string displayName
    string avatar
    string stripeCustomerId
    string createdAt
  }

  STARSHIP {
    string id PK
    string slug
    string ownerId FK
    string class
    string name
    int maxAgents
    int maxActiveMissions
    string status
    string subscriptionId
    string plan
    string billingPeriod
    string stripeCustomerId
    string createdAt
    string updatedAt
  }

  AGENT {
    string id PK
    string starshipId FK
    string name
    string authorId
    boolean isPublic
    string tags
    string category
    string version
    int usageCount
    float rating
    string createdAt
    string updatedAt
  }

  MISSION {
    string id PK
    string starshipId FK
    string name
    string description
    string status
    string phase
    string agentIds
    string createdBy
    string executionState
    string executionResult
    string createdAt
    string updatedAt
  }

  MISSION_MESSAGE {
    string id PK
    string missionId FK
    string role
    string content
    string timestamp
    string userId
    string senderName
  }

  WORKFLOW {
    string id PK
    string missionId FK
    string approvalStatus
    string createdAt
    string approvedAt
  }

  WORKFLOW_NODE {
    string id PK
    string type
    string title
    string parameters
  }

  WORKFLOW_EDGE {
    string id PK
    string fromNodeId FK
    string toNodeId FK
  }

  VISION {
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

  MCP_SERVER_OPTION {
    string id PK
    string name
    string slug
    string command
    string args
    string env
  }

  MCP_SERVER_CONNECTOR {
    string id PK
    string starshipId FK
    string templateId FK
    string status
    boolean isActive
    string connectedAt
    string lastUsed
    string errorMessage
    string env
    string configTemplateId
    int configVersion
    string dockerServiceName
    string dockerStatus
    string dockerContainerId
    string dockerHealthStatus
    string dockerLastHealthCheck
    string dockerNetworkName
    string dockerImageName
    string dockerErrorMessage
    int dockerPort
    boolean httpBridgeEnabled
    string internalUrl
    string bridgeVersion
    string lastToolsSync
    string availableTools
    string availableResources
    string bridgeCapabilities
    string createdAt
    string updatedAt
  }

  CONNECTOR_CONFIG_TEMPLATE {
    string id PK
    string name
    string description
    string category
    string tags
    string config
    boolean isPublic
    string authorId FK
    int usageCount
    string createdAt
    string updatedAt
  }

  CONNECTOR_CONFIG_HISTORY {
    string id PK
    string connectorId FK
    string config
    string changedBy FK
    string changeSummary
    string changeReason
    string createdAt
  }

  CHANNEL {
    string id PK
    string name
    string guildId
    string type
    string createdAt
  }

  LLM {
    string id PK
    string name
    string provider
    int maxTokens
    float temperature
    string embeddingModel
    boolean supportsStreaming
    boolean supportsTools
    float costPer1kTokens
    string createdAt
  }

  AGENT_TEMPLATE {
    string id PK
    string name
    string description
    string category
    string tags
    string systemPrompt
    string model FK
    float temperature
    int maxTokens
    string authorId FK
    boolean isPublic
    int usageCount
    float rating
    string icon
    string previewPrompts
    string createdAt
    string updatedAt
  }

  %% Relationships
  USER ||--o{ STARSHIP : owns
  USER ||--o{ MISSION : creates
  USER ||--o{ AGENT : creates
  USER ||--o{ AGENT_TEMPLATE : creates
  USER ||--o{ MISSION_MESSAGE : sends

  STARSHIP ||--o{ AGENT : has
  STARSHIP ||--o{ MISSION : has
  STARSHIP ||--|| VISION : has

  MISSION ||--o{ MISSION_MESSAGE : has
  MISSION ||--|| WORKFLOW : has
  WORKFLOW ||--o{ WORKFLOW_NODE : contains
  WORKFLOW_NODE ||--o{ WORKFLOW_EDGE : outbound
  WORKFLOW_NODE ||--o{ WORKFLOW_EDGE : inbound

  MISSION ||--o{ AGENT : assigned_to
  USER ||--o{ AGENT : interacts_with
  AGENT ||--o{ CHANNEL : active_in

  STARSHIP ||--o{ MCP_SERVER_CONNECTOR : has_connector
  MCP_SERVER_OPTION ||--o{ MCP_SERVER_CONNECTOR : created_from
  CONNECTOR_CONFIG_TEMPLATE ||--o{ MCP_SERVER_CONNECTOR : applied_to
  MCP_SERVER_CONNECTOR ||--o{ CONNECTOR_CONFIG_HISTORY : has_history
  USER ||--o{ CONNECTOR_CONFIG_HISTORY : changes
  LLM ||--o{ AGENT_TEMPLATE : provides_model
  AGENT_TEMPLATE ||--o{ AGENT : instantiates