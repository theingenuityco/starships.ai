# Canonical Schema Specification

## Overview

This document defines the target pure graph-based schema for the starships.ai system. Based on the domain context maps and relationship inventory analysis, this specification eliminates the current mixed FK/relationship patterns in favor of a consistent, domain-driven graph model that leverages Neo4j's strengths.

## Design Principles

1. **Pure Graph Relationships**: Eliminate foreign key properties that duplicate relationship information
2. **Domain-Driven Boundaries**: Clear separation between bounded contexts
3. **Consistent Patterns**: Uniform relationship modeling across all domains
4. **Performance Optimized**: Designed for efficient traversals and queries
5. **Constraint Enforced**: Leverage Neo4j constraints for data integrity

## Node Label Definitions

### User Identity Context

#### User Node
```cypher
(:User {
  id: string,           // UUID - Primary identifier
  kindeId: string,      // External auth provider ID
  username: string,     // Unique username
  email: string,        // Email address
  displayName: string,  // Display name
  avatar: string,       // Avatar URL
  stripeCustomerId: string, // Stripe integration
  createdAt: datetime   // Creation timestamp
})
```

**Mandatory Properties**: `id`, `kindeId`, `email`, `createdAt`
**Optional Properties**: `username`, `displayName`, `avatar`, `stripeCustomerId`
**Data Types**: All strings except `createdAt` (datetime)
**Validation Rules**: 
- `id` must be valid UUID format
- `email` must be valid email format
- `kindeId` must be unique across all users
- `email` must be unique across all users

### Starship Lifecycle Context

#### Starship Node
```cypher
(:Starship {
  id: string,              // UUID - Primary identifier
  slug: string,            // URL-friendly identifier
  name: string,            // Display name
  class: string,           // 'scout' | 'cruiser' | 'draught'
  maxAgents: integer,      // Capacity limit (class-based)
  maxActiveMissions: integer, // Mission limit (class-based)
  status: string,          // 'active' | 'inactive' | 'restricted' | 'disabled' | 'pending_payment'
  subscriptionId: string,  // Stripe subscription ID
  plan: string,            // 'scout' | 'cruiser' | 'draught'
  billingPeriod: string,   // 'monthly' | 'yearly'
  stripeCustomerId: string, // Stripe customer ID
  createdAt: datetime,     // Creation timestamp
  updatedAt: datetime      // Last update timestamp
})
```

**Mandatory Properties**: `id`, `slug`, `name`, `class`, `maxAgents`, `maxActiveMissions`, `status`, `createdAt`, `updatedAt`
**Optional Properties**: `subscriptionId`, `plan`, `billingPeriod`, `stripeCustomerId`
**Data Types**: 
- Strings: `id`, `slug`, `name`, `class`, `status`, `subscriptionId`, `plan`, `billingPeriod`, `stripeCustomerId`
- Integers: `maxAgents`, `maxActiveMissions`
- Datetimes: `createdAt`, `updatedAt`

**Validation Rules**:
- `class` must be one of: 'scout', 'cruiser', 'draught'
- `status` must be one of: 'active', 'inactive', 'restricted', 'disabled', 'pending_payment'
- `maxAgents`: scout=3, cruiser=5, draught=10
- `maxActiveMissions`: scout=3, cruiser=6, draught=10

### Agent Marketplace Context

#### Agent Node
```cypher
(:Agent {
  id: string,              // UUID - Primary identifier
  name: string,            // Agent name
  description: string,     // Agent description
  systemPrompt: string,    // AI system prompt
  model: string,           // LLM model identifier
  temperature: float,      // Generation temperature
  maxTokens: integer,      // Token limit
  category: string,        // 'general' | 'coding' | 'creative' | 'analysis' | 'support'
  tags: [string],          // Category tags
  isPublic: boolean,       // Marketplace visibility
  usageCount: integer,     // Usage statistics
  rating: float,           // Community rating (1-5)
  version: string,         // Agent version
  allowedStarshipClasses: [string], // Deployment restrictions
  createdAt: datetime,     // Creation timestamp
  updatedAt: datetime      // Last update timestamp
})
```

**Mandatory Properties**: `id`, `name`, `systemPrompt`, `model`, `category`, `isPublic`, `usageCount`, `version`, `createdAt`, `updatedAt`
**Optional Properties**: `description`, `temperature`, `maxTokens`, `tags`, `rating`, `allowedStarshipClasses`

**Legacy Compatibility Fields (migration only)**:
- `authorId`: Temporary FK to User → Replaced by `(:User)-[:AUTHORS]->(:Agent)` relationship
- **Note**: Constraint including `authorId` marked as LEGACY/MIGRATION-ONLY in 04-constraints-and-indexes.md and will be dropped in Phase 4

**Data Types**:
- Strings: `id`, `name`, `description`, `systemPrompt`, `model`, `category`, `version`
- Arrays: `tags`, `allowedStarshipClasses`
- Floats: `temperature`, `rating`
- Integers: `maxTokens`, `usageCount`
- Boolean: `isPublic`
- Datetimes: `createdAt`, `updatedAt`

#### AgentTemplate Node
```cypher
(:AgentTemplate {
  id: string,              // UUID - Primary identifier
  name: string,            // Template name
  description: string,     // Template description
  category: string,        // 'general' | 'coding' | 'creative' | 'analysis' | 'support'
  tags: [string],          // Category tags
  systemPrompt: string,    // Default system prompt
  model: string,           // Default LLM model
  temperature: float,      // Default temperature
  maxTokens: integer,      // Default token limit
  isPublic: boolean,       // Template visibility
  usageCount: integer,     // Usage statistics
  rating: float,           // Community rating
  icon: string,            // Template icon URL
  previewPrompts: [string], // Example prompts
  createdAt: datetime,     // Creation timestamp
  updatedAt: datetime      // Last update timestamp
})
```

**Legacy Compatibility Fields (migration only)**:
- `authorId`: Temporary FK to User → Replaced by `(:User)-[:CREATES]->(:AgentTemplate)` relationship
- **Note**: Constraint including `authorId` marked as LEGACY/MIGRATION-ONLY in 04-constraints-and-indexes.md and will be dropped in Phase 4

### Connector Management Context

#### MCPServerOption Node
```cypher
(:MCPServerOption {
  id: string,              // UUID - Primary identifier
  name: string,            // Display name
  slug: string,            // Docker-compatible identifier
  command: string,         // Execution command
  args: [string],          // Command arguments
  env: string,             // Default environment variables (JSON)
  createdAt: datetime,     // Creation timestamp
  updatedAt: datetime      // Last update timestamp
})
```

#### MCPServerConnector Node
```cypher
(:MCPServerConnector {
  id: string,              // UUID - Primary identifier
  status: string,          // 'active' | 'inactive' | 'error' | 'connecting'
  isActive: boolean,       // Active flag
  connectedAt: datetime,   // Connection timestamp
  lastUsed: datetime,      // Last usage timestamp
  errorMessage: string,    // Error details
  env: string,             // Environment variables (JSON)
  configVersion: integer,  // Configuration version
  
  // Docker-specific fields
  dockerServiceName: string,      // Docker service name
  dockerStatus: string,           // 'pending' | 'building' | 'running' | 'stopped' | 'error'
  dockerContainerId: string,      // Container ID
  dockerHealthStatus: string,     // 'healthy' | 'unhealthy' | 'starting'
  dockerLastHealthCheck: datetime, // Last health check
  dockerNetworkName: string,      // Network name
  dockerImageName: string,        // Image name
  dockerErrorMessage: string,     // Docker error details
  dockerPort: integer,            // Allocated port
  
  // HTTP Bridge fields
  httpBridgeEnabled: boolean,     // Bridge enabled flag
  internalUrl: string,            // Internal bridge URL
  bridgeVersion: string,          // Bridge version
  lastToolsSync: datetime,        // Last tools sync
  availableTools: string,         // Available tools (JSON)
  availableResources: string,     // Available resources (JSON)
  bridgeCapabilities: string,     // Bridge capabilities (JSON)
  
  createdAt: datetime,     // Creation timestamp
  updatedAt: datetime      // Last update timestamp
})
```

**Legacy Compatibility Fields (migration only)**:
- `starshipId`: Temporary FK to Starship → Replaced by `(:Starship)-[:HAS_CONNECTOR_INSTANCE]->(:MCPServerConnector)` relationship
- `templateId`: Temporary FK to MCPServerOption → Replaced by `(:MCPServerConnector)-[:CREATED_FROM]->(:MCPServerOption)` relationship

### Vision Statement Context

#### Vision Node
```cypher
(:Vision {
  id: string,              // UUID - Primary identifier
  statement: string,       // Vision statement text
  confidence: float,       // Confidence level (0-1)
  refinementCount: integer, // Number of refinements
  lastRefined: datetime,   // Last refinement timestamp
  isActive: boolean,       // Active flag
  
  // Quality metrics
  clarityScore: float,     // Clarity assessment (0-1)
  specificityScore: float, // Specificity assessment (0-1)
  actionabilityScore: float, // Actionability assessment (0-1)
  inspirationalScore: float, // Inspirational assessment (0-1)
  overallQuality: float,   // Overall quality score (0-1)
  hasObjectives: boolean,  // Contains measurable objectives
  hasTimeframe: boolean,   // Contains time-bound goals
  hasMeasurables: boolean, // Contains quantifiable metrics
  
  createdAt: datetime,     // Creation timestamp
  updatedAt: datetime      // Last update timestamp
})
```

**Legacy Compatibility Fields (migration only)**:
- `starshipId`: Temporary FK to Starship → Replaced by `(:Starship)-[:HAS_VISION]->(:Vision)` relationship
- **Note**: One-to-one Vision enforcement uses relationship-based uniqueness post-migration via application-level MERGE guards rather than FK-based constraints

## Relationship Type Definitions

### User Identity Relationships

#### User → Starship: OWNS
```cypher
(:User)-[:OWNS {
  ownedSince: datetime,    // Ownership start timestamp
  role: string             // 'owner' | 'admin' | 'member'
}]->(:Starship)
```

**Cardinality**: One-to-Many (User can own multiple Starships)
**Business Rules**: 
- Each Starship has exactly one owner
- Ownership can be transferred but not shared
- `ownedSince` tracks ownership history

#### User → Agent: AUTHORS
```cypher
(:User)-[:AUTHORS {
  authoredAt: datetime     // Authoring timestamp
}]->(:Agent)
```

**Cardinality**: One-to-Many (User can author multiple Agents)
**Business Rules**:
- Each Agent has exactly one author
- Authorship cannot be transferred
- Used for attribution and permissions

#### User → AgentTemplate: CREATES
```cypher
(:User)-[:CREATES {
  createdAt: datetime      // Creation timestamp
}]->(:AgentTemplate)
```

### Starship Lifecycle Relationships

#### Agent → Starship: DEPLOYED_ON
```cypher
(:Agent)-[:DEPLOYED_ON {
  deployedAt: datetime,    // Deployment timestamp
  isActive: boolean,       // Active deployment flag
  version: string          // Deployed version
}]->(:Starship)
```

**Cardinality**: Many-to-One (Multiple Agents can deploy on one Starship)
**Business Rules**:
- Each Agent can be deployed on exactly one Starship at a time
- Deployment respects Starship capacity limits
- Deployment history is maintained

#### Starship → MCPServerConnector: HAS_CONNECTOR_INSTANCE
```cypher
(:Starship)-[:HAS_CONNECTOR_INSTANCE {
  createdAt: datetime      // Instance creation timestamp
}]->(:MCPServerConnector)
```

**Cardinality**: One-to-Many (Starship can have multiple Connector instances)
**Business Rules**:
- Each Connector instance belongs to exactly one Starship
- Multiple instances of same template not allowed per Starship

#### Starship → Vision: HAS_VISION
```cypher
(:Starship)-[:HAS_VISION {
  establishedAt: datetime  // Vision establishment timestamp
}]->(:Vision)
```

**Cardinality**: One-to-One (Each Starship has exactly one Vision)
**Business Rules**:
- Each Starship must have exactly one active Vision
- Vision updates modify existing node rather than creating new ones

### Connector Management Relationships

#### MCPServerConnector → MCPServerOption: CREATED_FROM
```cypher
(:MCPServerConnector)-[:CREATED_FROM {
  createdAt: datetime,     // Instance creation timestamp
  version: string          // Template version used
}]->(:MCPServerOption)
```

**Cardinality**: Many-to-One (Multiple instances from one template)
**Business Rules**:
- Each Connector instance was created from exactly one template
- Template relationship is immutable after creation
- Version tracking for template evolution

### Marketplace Relationships

#### Agent → AgentTemplate: DERIVED_FROM
```cypher
(:Agent)-[:DERIVED_FROM {
  derivedAt: datetime,     // Derivation timestamp
  templateVersion: string  // Template version used
}]->(:AgentTemplate)
```

**Cardinality**: Many-to-One (Multiple Agents from one Template)
**Business Rules**:
- Agents can be created from templates
- Template relationship is optional (agents can be created independently)
- Template version tracking for evolution

#### User → Agent: INTERACTS_WITH
```cypher
(:User)-[:INTERACTS_WITH {
  firstInteraction: datetime, // First interaction timestamp
  lastInteraction: datetime,  // Last interaction timestamp
  messageCount: integer       // Total message count
}]->(:Agent)
```

**Cardinality**: Many-to-Many (Users can interact with multiple Agents)
**Business Rules**:
- Interaction tracking for analytics
- Message count for usage statistics

## Aggregate Boundaries

### User Aggregate
- **Root**: User
- **Entities**: User profile data
- **Consistency Boundary**: User identity and authentication state
- **Invariants**: Unique email, unique kindeId, valid contact information

### Starship Aggregate
- **Root**: Starship
- **Entities**: Starship configuration, capacity settings
- **Consistency Boundary**: Starship state and configuration
- **Invariants**: Valid status transitions, capacity limits, slug uniqueness per owner

### Agent Aggregate
- **Root**: Agent
- **Entities**: Agent configuration, deployment state
- **Consistency Boundary**: Agent configuration and deployment
- **Invariants**: Valid model configuration, deployment constraints

### MCPServerConnector Aggregate
- **Root**: MCPServerConnector
- **Entities**: Connector instance state, Docker deployment
- **Consistency Boundary**: Connector lifecycle and health
- **Invariants**: Valid status transitions, health consistency, unique instance per template per starship

### Vision Aggregate
- **Root**: Vision
- **Entities**: Vision statement, quality metrics
- **Consistency Boundary**: Vision content and assessment
- **Invariants**: Valid quality scores, consistent metrics

## Property Specifications

### Temporal Fields
- **Standard Format**: ISO 8601 datetime strings
- **Timezone**: UTC for all timestamps
- **Precision**: Millisecond precision for ordering
- **Nullable**: Creation timestamps never null, update timestamps can be null initially

### Computed Properties
- **Usage Metrics**: Calculated from relationship traversals
- **Quality Scores**: Computed by external AI services
- **Capacity Utilization**: Derived from deployment relationships

### Legacy Compatibility Fields
During migration phase only, these FK properties will be marked for deprecation:
- `Agent.starshipId` → Replace with `(:Agent)-[:DEPLOYED_ON]->(:Starship)` traversal
- `Agent.authorId` → Replace with `(:User)-[:AUTHORS]->(:Agent)` traversal  
- `AgentTemplate.authorId` → Replace with `(:User)-[:CREATES]->(:AgentTemplate)` traversal
- `Vision.starshipId` → Replace with `(:Starship)-[:HAS_VISION]->(:Vision)` traversal
- `Starship.ownerId` → Replace with `(:User)-[:OWNS]->(:Starship)` traversal

**Migration Strategy**:
1. Add graph relationships alongside existing FK properties
2. Update query patterns to use relationships
3. Validate data consistency between FK and relationships
4. Remove FK properties after migration completion

## Property Naming Conventions

### Standard Suffixes
- `Id`: Unique identifiers (UUIDs)
- `At`: Timestamp properties
- `Count`: Integer counters
- `Score`: Numeric ratings (0-1 or 1-5)
- `Status`: Enumerated states
- `Enabled`: Boolean flags

### Prefix Conventions
- `is`: Boolean state properties
- `has`: Boolean capability properties
- `max`: Upper limit properties
- `last`: Most recent timestamp properties

### Enumeration Values
- **Lowercase**: All enumeration values use lowercase
- **Underscore Separation**: Multi-word values use underscores
- **Descriptive**: Values clearly indicate the state or type

## Versioning Strategy

### Schema Evolution
- **Additive Changes**: New properties and relationships can be added
- **Breaking Changes**: Require migration scripts and version coordination
- **Deprecation Process**: 3-phase deprecation with warnings

### Data Migration
- **Backward Compatibility**: Maintain during transition period
- **Dual Write**: Write to both old and new patterns during migration
- **Validation**: Continuous consistency checking between patterns

### Version Tracking
- **Schema Version**: Global schema version number
- **Migration Log**: Track applied migrations and their status
- **Rollback Capability**: Support for emergency rollbacks

## Performance Considerations

### Index Requirements
- **Primary Keys**: Unique indexes on all `id` properties
- **Foreign Keys**: Indexes on relationship endpoint properties
- **Query Patterns**: Composite indexes for common filter combinations
- **Full-Text**: Search indexes for name and description fields

### Query Optimization
- **Relationship Traversal**: Optimized for common graph patterns
- **Aggregation**: Efficient counting and summing operations
- **Filtering**: Support for complex WHERE clause combinations

### Constraint Enforcement
- **Uniqueness**: Primary and composite unique constraints
- **Existence**: Required property constraints
- **Relationships**: Cardinality constraint enforcement where supported

## Next Steps

This canonical schema provides the foundation for:
- **Constraints and Indexes Design** (04-constraints-and-indexes.md)
- **Use Case Validation** (05-use-case-validation.md)
- **Performance Analysis** (06-performance-analysis.md)
- **Migration Strategy Implementation** (07-migration-strategy.md)