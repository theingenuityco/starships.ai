# Domain Context Maps

## Overview

This document defines domain-driven context maps following DDD principles to establish clear boundaries between domains in the starships.ai system. Through analysis of the type system and repository patterns, we've identified five core bounded contexts that need clear schema boundaries and integration points.

## Domain-Driven Design Principles Applied

- **Bounded Contexts**: Clear domain boundaries with distinct vocabularies
- **Ubiquitous Language**: Consistent terminology within each context
- **Aggregate Roots**: Single entry points for consistency boundaries
- **Context Integration**: Explicit integration patterns between domains
- **Anti-Corruption Layers**: Protection from external domain concerns

## Core Bounded Contexts

### 1. User Identity Context

**Domain Purpose**: Authentication, user profiles, and identity management

**Aggregate Root**: `User`

**Core Entities**:
- `User` - Primary identity entity
- `UserProfile` - Extended profile information

**Domain Services**:
- User authentication service
- Profile management service
- Identity validation service

**Value Objects**:
- Email address
- Username
- Display name
- Avatar URL

**Ubiquitous Language**:
- **Identity**: Unique user identification
- **Profile**: User's personal information and preferences
- **Authentication**: Process of verifying user identity
- **Authorization**: Process of granting access rights

**Business Invariants**:
- Each user must have a unique email address
- Each user must have a unique Kinde ID
- Username must be unique across the system
- Email must be valid format

**Domain Boundaries**:
- **Internal**: User profile management, authentication state
- **External**: Kinde authentication provider, Stripe billing integration

### 2. Starship Lifecycle Context

**Domain Purpose**: Starship creation, configuration, ownership, and lifecycle management

**Aggregate Root**: `Starship`

**Core Entities**:
- `Starship` - Primary starship entity
- `StarshipConfiguration` - Capacity and feature configuration

**Domain Services**:
- Starship provisioning service
- Capacity management service
- Slug generation service
- Ownership transfer service

**Value Objects**:
- Starship slug (unique identifier)
- Starship class (scout, cruiser, draught)
- Capacity limits (maxAgents, maxActiveMissions)
- Status enumeration

**Ubiquitous Language**:
- **Starship**: A user's workspace container for agents and connectors
- **Provisioning**: Process of creating and configuring a new starship
- **Class**: Starship tier determining capacity and features
- **Capacity**: Maximum number of agents and missions allowed
- **Ownership**: User's control and responsibility for a starship
- **Lifecycle**: States from creation through decommissioning

**Business Invariants**:
- Each starship must have a unique slug per owner
- Starship class determines capacity limits
- Only the owner can modify starship configuration
- Starship status must be valid for its current lifecycle stage

**Domain Boundaries**:
- **Internal**: Starship configuration, capacity management, lifecycle states
- **External**: User ownership, billing integration, agent deployment

### 3. Agent Marketplace Context

**Domain Purpose**: Agent templates, deployment, marketplace functionality, and usage tracking

**Aggregate Root**: `Agent`

**Core Entities**:
- `Agent` - Deployed agent instance
- `AgentTemplate` - Reusable agent blueprint
- `AgentDeployment` - Deployment metadata

**Domain Services**:
- Agent marketplace service
- Template publishing service
- Agent deployment service
- Usage analytics service

**Value Objects**:
- Agent category (general, coding, creative, analysis, support)
- Rating (1-5 scale)
- Usage metrics
- Template configuration

**Ubiquitous Language**:
- **Agent**: Deployed AI assistant with specific capabilities
- **Template**: Reusable blueprint for creating agents
- **Marketplace**: Public catalog of available agent templates
- **Deployment**: Process of instantiating an agent on a starship
- **Usage Analytics**: Tracking and metrics for agent utilization
- **Rating**: Community feedback on agent quality

**Business Invariants**:
- Each agent must be deployed on exactly one starship
- Public agents must have valid templates
- Agent ratings must be between 1-5
- Agent deployment requires available starship capacity

**Domain Boundaries**:
- **Internal**: Agent configuration, marketplace logic, template management
- **External**: Starship deployment, user authoring, LLM integration

### 4. Connector Management Context

**Domain Purpose**: MCP server connector lifecycle, Docker deployment, and configuration management

**Aggregate Root**: `MCPServerConnector`

**Core Entities**:
- `MCPServerConnector` - Deployed connector instance
- `MCPServerOption` - Available connector template
- `ConnectorConfigTemplate` - Reusable configuration template
- `ConnectorConfigHistory` - Configuration change audit

**Domain Services**:
- Connector deployment service
- Docker orchestration service
- Configuration management service
- Health monitoring service

**Value Objects**:
- Connector status (active, inactive, error, connecting)
- Docker status (pending, building, running, stopped, error)
- Health status (healthy, unhealthy, starting)
- Environment configuration

**Ubiquitous Language**:
- **Connector**: Deployed MCP server instance providing tools/capabilities
- **Template**: Blueprint for creating connector instances
- **Deployment**: Process of instantiating and starting a connector
- **Configuration**: Environment variables and runtime settings
- **Health Check**: Automated monitoring of connector status
- **Docker Container**: Isolated runtime environment for the connector

**Business Invariants**:
- Each connector instance maps to exactly one starship and one template
- Only one connector instance per template per starship
- Connector health status must reflect actual container state
- Configuration changes must be audited

**Domain Boundaries**:
- **Internal**: Connector lifecycle, Docker management, configuration
- **External**: Starship deployment, template catalog, monitoring systems

### 5. Vision Statement Context

**Domain Purpose**: Starship vision statements, quality metrics, and iterative refinement

**Aggregate Root**: `Vision`

**Core Entities**:
- `Vision` - Starship vision statement with metrics
- `VisionMetrics` - Quality assessment scores

**Domain Services**:
- Vision quality assessment service
- Metrics calculation service
- Statement refinement service

**Value Objects**:
- Vision statement text
- Quality scores (clarity, specificity, actionability, inspirational)
- Refinement count
- Confidence level

**Ubiquitous Language**:
- **Vision**: Clear statement of starship's purpose and goals
- **Quality Metrics**: Automated assessment of vision statement quality
- **Refinement**: Process of improving vision clarity and focus
- **Assessment**: Evaluation of vision against quality criteria
- **Confidence**: Measure of vision statement maturity

**Business Invariants**:
- Each starship has exactly one active vision
- Quality metrics must be calculated consistently
- Refinement count tracks statement evolution
- Vision statements must meet minimum quality thresholds

**Domain Boundaries**:
- **Internal**: Vision content, quality assessment, refinement tracking
- **External**: Starship association, AI-powered assessment services

## Context Integration Patterns

### 1. Shared Kernel: Core Value Objects

**Shared Between All Contexts**:
- Entity IDs (UUID format)
- Timestamps (ISO 8601 format)
- Status enumerations

**Integration Pattern**: Direct sharing of common value objects

### 2. Customer-Supplier: User → Starship

**Relationship**: User Identity Context supplies user information to Starship Lifecycle Context

**Integration Pattern**:
- Ownership relationship through graph edge `(:User)-[:OWNS]->(:Starship)`
- Anti-corruption layer in Starship context for user identity changes

**Conformist Pattern**: Starship context conforms to User context's identity model

### 3. Customer-Supplier: Starship → Agent Marketplace

**Relationship**: Starship Lifecycle Context supplies deployment capacity to Agent Marketplace Context

**Integration Pattern**:
- Deployment relationship through graph edge `(:Agent)-[:DEPLOYED_ON]->(:Starship)`
- Capacity validation service in Agent context

**Partnership Pattern**: Both contexts collaborate on deployment constraints

### 4. Customer-Supplier: Starship → Connector Management

**Relationship**: Starship Lifecycle Context supplies deployment platform to Connector Management Context

**Integration Pattern**:
- Instance relationship through graph edge `(:Starship)-[:HAS_CONNECTOR_INSTANCE]->(:MCPServerConnector)`
- Resource allocation service in Connector context

### 5. Customer-Supplier: Starship → Vision Statement

**Relationship**: Starship Lifecycle Context supplies vision association to Vision Statement Context

**Integration Pattern**:
- Vision relationship through graph edge `(:Starship)-[:HAS_VISION]->(:Vision)`
- One-to-one constraint enforcement

**Conformist Pattern**: Vision context conforms to Starship lifecycle states

## Anti-Corruption Layers

### 1. Billing Integration Layer

**Purpose**: Protect domain contexts from Stripe billing complexity

**Location**: Between User/Starship contexts and external Stripe API

**Responsibilities**:
- Map domain entities to Stripe customer/subscription models
- Handle billing state synchronization
- Translate Stripe events to domain events

### 2. Authentication Layer

**Purpose**: Protect User context from Kinde authentication provider changes

**Location**: Between User Identity context and Kinde API

**Responsibilities**:
- Map Kinde user attributes to domain user model
- Handle authentication state transitions
- Translate authentication events to domain events

### 3. Docker Orchestration Layer

**Purpose**: Protect Connector context from Docker API complexity

**Location**: Between Connector Management context and Docker Engine

**Responsibilities**:
- Map connector configuration to Docker container specs
- Handle container lifecycle events
- Translate Docker status to domain status

## Domain Event Integration

### 1. User Events
- `UserRegistered`: New user account created
- `UserProfileUpdated`: User information changed
- `UserDeactivated`: User account disabled

### 2. Starship Events
- `StarshipProvisioned`: New starship created
- `StarshipCapacityChanged`: Starship class/limits updated
- `StarshipDecommissioned`: Starship deleted

### 3. Agent Events
- `AgentDeployed`: Agent deployed to starship
- `AgentUndeployed`: Agent removed from starship
- `AgentTemplatePublished`: Template made available in marketplace

### 4. Connector Events
- `ConnectorInstanceCreated`: New connector instance deployed
- `ConnectorStatusChanged`: Connector status updated
- `ConnectorConfigurationUpdated`: Environment/config changed

### 5. Vision Events
- `VisionCreated`: Initial vision statement added
- `VisionRefined`: Vision statement updated
- `VisionMetricsCalculated`: Quality scores updated

## Context Responsibilities Matrix

| Context | User Management | Starship Lifecycle | Agent Deployment | Connector Management | Vision Quality |
|---------|----------------|-------------------|------------------|---------------------|----------------|
| User Identity | ✓ | ✗ | ✗ | ✗ | ✗ |
| Starship Lifecycle | ✗ | ✓ | Capacity Validation | Resource Allocation | Association |
| Agent Marketplace | Author Validation | Deployment Target | ✓ | ✗ | ✗ |
| Connector Management | ✗ | Resource Consumer | ✗ | ✓ | ✗ |
| Vision Statement | ✗ | Association Target | ✗ | ✗ | ✓ |

## Schema Design Implications

### 1. Clear Aggregate Boundaries
- Each context has distinct node labels and relationship types
- No cross-context direct property references

### 2. Relationship Ownership
- User owns starships: `(:User)-[:OWNS]->(:Starship)`
- Starship hosts agents: `(:Agent)-[:DEPLOYED_ON]->(:Starship)`
- Starship manages connectors: `(:Starship)-[:HAS_CONNECTOR_INSTANCE]->(:MCPServerConnector)`
- Starship defines vision: `(:Starship)-[:HAS_VISION]->(:Vision)`

### 3. Context Integration Points
- Cross-context associations are represented exclusively via graph relationships. Any FK properties are migration-only and will be removed.
- Graph relationships for traversal and complex queries
- Event-driven updates for cross-context synchronization

### 4. Consistency Boundaries
- Each aggregate root manages its internal consistency
- Cross-context eventual consistency through domain events
- Constraint enforcement at aggregate boundaries

## Transitional Patterns

### Legacy Foreign Key Migration

During the migration to a pure graph model, some foreign key properties exist temporarily to maintain compatibility:

**Transitional FK Properties (marked for deprecation)**:
- `Agent.starshipId` → Replaced by `(:Agent)-[:DEPLOYED_ON]->(:Starship)` traversal
- `Vision.starshipId` → Replaced by `(:Starship)-[:HAS_VISION]->(:Vision)` traversal  
- `Starship.ownerId` → Replaced by `(:User)-[:OWNS]->(:Starship)` traversal
- `MCPServerConnector.starshipId` → Replaced by `(:Starship)-[:HAS_CONNECTOR_INSTANCE]->(:MCPServerConnector)` traversal
- `MCPServerConnector.templateId` → Replaced by `(:MCPServerConnector)-[:CREATED_FROM]->(:MCPServerOption)` traversal
- `Agent.authorId` → Replaced by `(:User)-[:AUTHORS]->(:Agent)` traversal

**Migration Timeline**:
1. **Phase 1** (Current): Dual write - maintain both FK properties and relationships
2. **Phase 2** (Migration): Update all query patterns to use relationship traversals
3. **Phase 3** (Validation): Verify 100% consistency between FK and relationship data  
4. **Phase 4** (Cleanup): Remove FK properties and associated constraints/indexes

**Relationship-First Access Patterns**:
All new query patterns must use relationship traversals exclusively. FK properties serve only as a consistency check during the migration phase.

### Uniqueness without FKs

For entities requiring uniqueness constraints that previously relied on FK properties:

**Slug-Claim Node Strategy**:
For starship slug uniqueness per owner, implement either:
- **Option A**: Derived `ownerId` property maintained automatically via triggers for constraint enforcement only
- **Option B**: Separate claim nodes `(:User)-[:CLAIMS_SLUG {slug: "my-starship"}]->(:SlugClaim)` 

**Temporary Node Key Enforcement**:
During migration, maintain derived FK properties solely for Neo4j node key constraints:
```cypher
-- Temporary constraint during migration
CREATE CONSTRAINT starship_owner_slug_key IF NOT EXISTS 
FOR (s:Starship) REQUIRE (s.ownerId, s.slug) IS NODE KEY;
```

**Deprecation Steps**:
1. Implement application-level uniqueness validation
2. Add relationship-based uniqueness checks in business logic
3. Remove node key constraints on FK properties
4. Remove derived FK properties entirely

## Next Steps

This domain analysis provides the foundation for:
- **Canonical Schema Specification** (03-canonical-schema-specification.md)
- **Constraints and Indexes Design** (04-constraints-and-indexes.md)
- **Migration Strategy Planning** (07-migration-strategy.md)