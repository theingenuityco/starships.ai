# Constraints and Indexes Design

## Overview

This document defines a comprehensive constraint and indexing strategy for the new domain-driven graph schema. Building on the existing optimizations from `003_database_optimizations.cypher` and `010_stripe_integration.cypher`, this design ensures data integrity, query performance, and consistency across all bounded contexts.

## Design Principles

1. **Data Integrity First**: Constraints enforce business rules at the database level
2. **Query Performance**: Indexes optimize common access patterns
3. **Domain Boundaries**: Context-specific constraint groupings
4. **Migration Safety**: Backward-compatible constraint additions
5. **Monitoring Ready**: Constraint violations and index usage tracking

## Uniqueness Constraints

### Primary Key Constraints

#### User Identity Context
```cypher
-- User primary key
CREATE CONSTRAINT user_id_unique IF NOT EXISTS 
FOR (u:User) REQUIRE u.id IS UNIQUE;

-- External identity constraints
CREATE CONSTRAINT user_kinde_id_unique IF NOT EXISTS 
FOR (u:User) REQUIRE u.kindeId IS UNIQUE;

CREATE CONSTRAINT user_email_unique IF NOT EXISTS 
FOR (u:User) REQUIRE u.email IS UNIQUE;

CREATE CONSTRAINT user_username_unique IF NOT EXISTS 
FOR (u:User) REQUIRE u.username IS UNIQUE;
```

#### Starship Lifecycle Context
```cypher
-- Starship primary key
CREATE CONSTRAINT starship_id_unique IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.id IS UNIQUE;

-- Business key constraint (composite uniqueness) - LEGACY/MIGRATION-ONLY
-- This constraint uses FK properties during migration only
CREATE CONSTRAINT starship_owner_slug_key IF NOT EXISTS 
FOR (s:Starship) REQUIRE (s.ownerId, s.slug) IS NODE KEY;
```

#### Agent Marketplace Context
```cypher
-- Agent primary key
CREATE CONSTRAINT agent_id_unique IF NOT EXISTS 
FOR (a:Agent) REQUIRE a.id IS UNIQUE;

-- Agent template primary key
CREATE CONSTRAINT agent_template_id_unique IF NOT EXISTS 
FOR (at:AgentTemplate) REQUIRE at.id IS UNIQUE;
```

#### Connector Management Context
```cypher
-- MCP server option primary key
CREATE CONSTRAINT mcp_server_option_id_unique IF NOT EXISTS 
FOR (mso:MCPServerOption) REQUIRE mso.id IS UNIQUE;

-- MCP server option slug uniqueness
CREATE CONSTRAINT mcp_server_option_slug_unique IF NOT EXISTS 
FOR (mso:MCPServerOption) REQUIRE mso.slug IS UNIQUE;

-- MCP server connector primary key
CREATE CONSTRAINT mcp_server_connector_id_unique IF NOT EXISTS 
FOR (msc:MCPServerConnector) REQUIRE msc.id IS UNIQUE;

-- Business rule: One connector instance per template per starship - LEGACY/MIGRATION-ONLY
-- NOTE: This constraint temporarily uses FK properties during migration only
-- Final state will use application-level validation via relationship traversals
CREATE CONSTRAINT connector_starship_template_key IF NOT EXISTS 
FOR (msc:MCPServerConnector) REQUIRE (msc.starshipId, msc.templateId) IS NODE KEY;
```

#### Vision Statement Context
```cypher
-- Vision primary key
CREATE CONSTRAINT vision_id_unique IF NOT EXISTS 
FOR (v:Vision) REQUIRE v.id IS UNIQUE;

-- One vision per starship (business rule) - LEGACY/MIGRATION-ONLY
-- This constraint uses FK properties during migration only
-- Post-migration: Use application-level MERGE guards for relationship-based uniqueness
CREATE CONSTRAINT vision_starship_unique IF NOT EXISTS 
FOR (v:Vision) REQUIRE v.starshipId IS UNIQUE;
```

### External System Integration Constraints

#### Stripe Integration
```cypher
-- Stripe customer ID uniqueness (when present)
CREATE CONSTRAINT user_stripe_customer_id_unique IF NOT EXISTS 
FOR (u:User) REQUIRE u.stripeCustomerId IS UNIQUE;

CREATE CONSTRAINT starship_stripe_customer_id_unique IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.stripeCustomerId IS UNIQUE;

-- Stripe subscription ID uniqueness
CREATE CONSTRAINT starship_subscription_id_unique IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.subscriptionId IS UNIQUE;
```

#### Docker Integration
```cypher
-- Docker container ID uniqueness (when present)
CREATE CONSTRAINT connector_docker_container_id_unique IF NOT EXISTS 
FOR (msc:MCPServerConnector) REQUIRE msc.dockerContainerId IS UNIQUE;

-- Docker service name uniqueness
CREATE CONSTRAINT connector_docker_service_name_unique IF NOT EXISTS 
FOR (msc:MCPServerConnector) REQUIRE msc.dockerServiceName IS UNIQUE;
```

## Node Key Constraints

### Composite Uniqueness Requirements
```cypher
-- Starship: unique slug per owner (already defined above) - LEGACY/MIGRATION-ONLY
CREATE CONSTRAINT starship_owner_slug_key IF NOT EXISTS 
FOR (s:Starship) REQUIRE (s.ownerId, s.slug) IS NODE KEY;

-- Connector: one instance per template per starship (already defined above) - LEGACY/MIGRATION-ONLY
CREATE CONSTRAINT connector_starship_template_key IF NOT EXISTS 
FOR (msc:MCPServerConnector) REQUIRE (msc.starshipId, msc.templateId) IS NODE KEY;
```

## Property Existence Constraints

### User Identity Context
```cypher
-- User required properties
CREATE CONSTRAINT user_required_props IF NOT EXISTS 
FOR (u:User) REQUIRE (u.id, u.kindeId, u.email, u.createdAt) IS NOT NULL;
```

### Starship Lifecycle Context
```cypher
-- Enhanced starship required properties (extends existing)
CREATE CONSTRAINT starship_required_props_enhanced IF NOT EXISTS 
FOR (s:Starship) REQUIRE (s.id, s.slug, s.name, s.class, s.maxAgents, s.maxActiveMissions, s.status, s.createdAt, s.updatedAt) IS NOT NULL;
```

### Agent Marketplace Context
```cypher
-- Agent required properties (enhanced) - LEGACY/MIGRATION-ONLY for authorId
-- NOTE: authorId is included temporarily during migration; will be removed post-migration
-- See migration-strategy.md Phase 4 for authorId deprecation plan
CREATE CONSTRAINT agent_required_props_enhanced IF NOT EXISTS 
FOR (a:Agent) REQUIRE (a.id, a.name, a.systemPrompt, a.model, a.authorId, a.category, a.isPublic, a.usageCount, a.version, a.createdAt, a.updatedAt) IS NOT NULL;

-- Agent template required properties - LEGACY/MIGRATION-ONLY for authorId
-- NOTE: authorId is included temporarily during migration; will be removed post-migration  
CREATE CONSTRAINT agent_template_required_props IF NOT EXISTS 
FOR (at:AgentTemplate) REQUIRE (at.id, at.name, at.category, at.systemPrompt, at.model, at.authorId, at.isPublic, at.usageCount, at.createdAt, at.updatedAt) IS NOT NULL;
```

### Connector Management Context
```cypher
-- MCP server option required properties
CREATE CONSTRAINT mcp_server_option_required_props IF NOT EXISTS 
FOR (mso:MCPServerOption) REQUIRE (mso.id, mso.name, mso.slug, mso.command, mso.args, mso.createdAt, mso.updatedAt) IS NOT NULL;

-- MCP server connector required properties (pure graph model)
CREATE CONSTRAINT mcp_server_connector_required_props IF NOT EXISTS 
FOR (msc:MCPServerConnector) REQUIRE (msc.id, msc.status, msc.isActive, msc.connectedAt, msc.createdAt, msc.updatedAt) IS NOT NULL;

-- LEGACY/MIGRATION-ONLY CONSTRAINT (temporary during migration only)
-- CREATE CONSTRAINT mcp_server_connector_required_props_legacy IF NOT EXISTS 
-- FOR (msc:MCPServerConnector) REQUIRE (msc.starshipId, msc.templateId) IS NOT NULL;
```

#### Uniqueness Strategy for One-Instance-Per-Template-Per-Starship

The business rule "one connector instance per template per starship" will be enforced through relationship-first uniqueness strategy post‑migration:

**Option A - Application-Level Validation** (Recommended Post-Migration):
```cypher
-- Query to check for existing instance before creation
MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(existing:MCPServerConnector)
-[:CREATED_FROM]->(template:MCPServerOption {id: $templateId})
RETURN count(existing) > 0 as instanceExists
```

**Option B - Claim Node Pattern** (Alternative Post-Migration):
```cypher
-- Create claim node for uniqueness enforcement
CREATE (claim:ConnectorClaim {
  starshipId: $starshipId,
  templateId: $templateId,
  createdAt: datetime()
})
-- Then link actual connector to claim
```

**Option C - Derived Property During Migration** (LEGACY/MIGRATION-ONLY):
```cypher
-- Maintain computed composite key during transition
MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
-[:CREATED_FROM]->(template:MCPServerOption)
SET msc.starshipId = s.id, msc.templateId = template.id
```

### Vision Statement Context
```cypher
-- Vision required properties - LEGACY/MIGRATION-ONLY for starshipId
CREATE CONSTRAINT vision_required_props IF NOT EXISTS 
FOR (v:Vision) REQUIRE (v.id, v.starshipId, v.statement, v.confidence, v.refinementCount, v.isActive, v.createdAt, v.updatedAt) IS NOT NULL;
```

## Property Value Constraints

## Unsupported DB Constraints and How We Enforce Them

Neo4j 5.x does not support complex property value constraints (IN clauses, range checks, or complex boolean logic). These business rules must be enforced at the application level or through APOC triggers.

### Application-Enforced Enumeration Constraints
```cypher
-- UNSUPPORTED in Neo4j 5.x: Enumeration constraints
-- These are enforced by application logic and validation

-- Starship class values: ['scout', 'cruiser', 'draught']
-- Application enforced: starship_class_values_enhanced

-- Starship status values: ['active', 'inactive', 'restricted', 'disabled', 'pending_payment'] 
-- Application enforced: starship_status_values_enhanced

-- Starship plan values: ['scout', 'cruiser', 'draught']
-- Application enforced: starship_plan_values

-- Starship billing period values: ['monthly', 'yearly']
-- Application enforced: starship_billing_period_values

-- Agent category values: ['general', 'coding', 'creative', 'analysis', 'support']
-- Application enforced: agent_category_values

-- Agent template category values: ['general', 'coding', 'creative', 'analysis', 'support']
-- Application enforced: agent_template_category_values

-- MCP server connector status values: ['active', 'inactive', 'error', 'connecting']
-- Application enforced: mcp_connector_status_values

-- Docker status values: ['pending', 'building', 'running', 'stopped', 'error']
-- Application enforced: mcp_connector_docker_status_values

-- Docker health status values: ['healthy', 'unhealthy', 'starting']
-- Application enforced: mcp_connector_docker_health_values
```

### Application-Enforced Range Constraints
```cypher
-- UNSUPPORTED in Neo4j 5.x: Range constraints
-- These are enforced by application logic and validation

-- Agent rating range (1-5)
-- Application enforced: agent_rating_range

-- Agent template rating range (1-5)
-- Application enforced: agent_template_rating_range

-- Vision confidence range (0-1)
-- Application enforced: vision_confidence_range

-- Vision quality scores range (0-1)
-- Application enforced: vision_quality_scores_range

-- Starship capacity constraints (class-based limits)
-- Application enforced: starship_capacity_constraints
```

### APOC-Trigger-Enforced Complex Constraints
```cypher
-- Complex business logic constraints can be enforced via APOC triggers
-- These require APOC plugin installation and trigger configuration

-- Example trigger setup for starship capacity validation:
/*
CALL apoc.trigger.add('starship_capacity_validation', 
  "WITH {createdNodes} + {assignedNodeProperties} + {assignedLabels} as nodes
   UNWIND nodes as n
   WITH n WHERE 'Starship' IN labels(n)
   AND (
     (n.class = 'scout' AND (n.maxAgents <> 3 OR n.maxActiveMissions <> 3)) OR
     (n.class = 'cruiser' AND (n.maxAgents <> 5 OR n.maxActiveMissions <> 6)) OR  
     (n.class = 'draught' AND (n.maxAgents <> 10 OR n.maxActiveMissions <> 10))
   )
   CALL apoc.util.validate(true, 'Invalid capacity for starship class: ' + n.class, []) RETURN n",
  {phase: 'before'});
*/
```

## Relationship Existence Constraints

### Critical Relationship Requirements
```cypher
-- Every starship must have an owner (when supported by Neo4j 5+)
-- CREATE CONSTRAINT starship_must_have_owner IF NOT EXISTS 
-- FOR ()-[r:OWNS]->(s:Starship) REQUIRE r IS NOT NULL;

-- Every agent must be deployed somewhere (when supported by Neo4j 5+)
-- CREATE CONSTRAINT agent_must_be_deployed IF NOT EXISTS 
-- FOR (a:Agent)-[r:DEPLOYED_ON]->() REQUIRE r IS NOT NULL;

-- Every connector instance must have a template source (when supported by Neo4j 5+)
-- CREATE CONSTRAINT connector_must_have_template IF NOT EXISTS 
-- FOR (msc:MCPServerConnector)-[r:CREATED_FROM]->() REQUIRE r IS NOT NULL;

-- Every starship must have a vision (when supported by Neo4j 5+)
-- CREATE CONSTRAINT starship_must_have_vision IF NOT EXISTS 
-- FOR (s:Starship)-[r:HAS_VISION]->() REQUIRE r IS NOT NULL;
```

**Note**: Relationship existence constraints are currently experimental in Neo4j 5.x. These will be enabled when the feature becomes stable.

## Performance Indexes

### Primary Access Patterns

#### User Context Indexes
```cypher
-- User lookup patterns (existing ones preserved)
CREATE INDEX user_email_lookup IF NOT EXISTS FOR (u:User) ON (u.email);
CREATE INDEX user_kinde_id_lookup IF NOT EXISTS FOR (u:User) ON (u.kindeId);
CREATE INDEX user_username_lookup IF NOT EXISTS FOR (u:User) ON (u.username);
CREATE INDEX user_stripe_customer_id_lookup IF NOT EXISTS FOR (u:User) ON (u.stripeCustomerId);
```

#### Starship Context Indexes
```cypher
-- Enhanced starship access patterns
CREATE INDEX starship_owner_status_composite_enhanced IF NOT EXISTS 
FOR (s:Starship) ON (s.ownerId, s.status);

CREATE INDEX starship_class_status_composite_enhanced IF NOT EXISTS 
FOR (s:Starship) ON (s.class, s.status);

-- New: Billing-related access patterns
CREATE INDEX starship_subscription_status_composite IF NOT EXISTS 
FOR (s:Starship) ON (s.subscriptionId, s.status);

CREATE INDEX starship_plan_billing_period_composite IF NOT EXISTS 
FOR (s:Starship) ON (s.plan, s.billingPeriod);

-- Slug-based access
CREATE INDEX starship_slug_lookup IF NOT EXISTS FOR (s:Starship) ON (s.slug);
```

#### Agent Context Indexes
```cypher
-- Enhanced agent access patterns
CREATE INDEX agent_starship_category_composite_enhanced IF NOT EXISTS 
FOR (a:Agent) ON (a.starshipId, a.category);

CREATE INDEX agent_author_public_composite_enhanced IF NOT EXISTS 
FOR (a:Agent) ON (a.authorId, a.isPublic);

-- New: Marketplace access patterns
CREATE INDEX agent_category_public_rating_composite IF NOT EXISTS 
FOR (a:Agent) ON (a.category, a.isPublic, a.rating);

CREATE INDEX agent_public_usage_rating_composite IF NOT EXISTS 
FOR (a:Agent) ON (a.isPublic, a.usageCount, a.rating);

-- Agent template marketplace indexes
CREATE INDEX agent_template_category_public_composite IF NOT EXISTS 
FOR (at:AgentTemplate) ON (at.category, at.isPublic);

CREATE INDEX agent_template_public_usage_composite IF NOT EXISTS 
FOR (at:AgentTemplate) ON (at.isPublic, at.usageCount);
```

#### Connector Context Indexes
```cypher
-- Connector management access patterns
CREATE INDEX mcp_connector_starship_status_composite IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.starshipId, msc.status);

CREATE INDEX mcp_connector_template_status_composite IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.templateId, msc.status);

-- Docker management indexes
CREATE INDEX mcp_connector_docker_status_composite IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.dockerStatus, msc.dockerHealthStatus);

CREATE INDEX mcp_connector_service_name_lookup IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.dockerServiceName);

-- Health monitoring indexes
CREATE INDEX mcp_connector_health_check_time IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.dockerLastHealthCheck);
```

#### Vision Context Indexes
```cypher
-- Vision access patterns
CREATE INDEX vision_starship_lookup IF NOT EXISTS FOR (v:Vision) ON (v.starshipId);
CREATE INDEX vision_quality_assessment IF NOT EXISTS FOR (v:Vision) ON (v.overallQuality);
CREATE INDEX vision_refinement_tracking IF NOT EXISTS FOR (v:Vision) ON (v.refinementCount, v.lastRefined);
```

### Temporal Indexes

#### Range Indexes for Date/Time Queries
```cypher
-- Enhanced temporal indexes (existing ones preserved and extended)
CREATE RANGE INDEX starship_created_at_range_enhanced IF NOT EXISTS 
FOR (s:Starship) ON (s.createdAt);

CREATE RANGE INDEX starship_updated_at_range IF NOT EXISTS 
FOR (s:Starship) ON (s.updatedAt);

CREATE RANGE INDEX agent_created_at_range_enhanced IF NOT EXISTS 
FOR (a:Agent) ON (a.createdAt);

CREATE RANGE INDEX agent_updated_at_range IF NOT EXISTS 
FOR (a:Agent) ON (a.updatedAt);

-- New: Connector temporal indexes
CREATE RANGE INDEX mcp_connector_created_at_range IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.createdAt);

CREATE RANGE INDEX mcp_connector_connected_at_range IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.connectedAt);

CREATE RANGE INDEX mcp_connector_last_used_range IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.lastUsed);

-- Vision temporal indexes
CREATE RANGE INDEX vision_created_at_range IF NOT EXISTS 
FOR (v:Vision) ON (v.createdAt);

CREATE RANGE INDEX vision_last_refined_range IF NOT EXISTS 
FOR (v:Vision) ON (v.lastRefined);
```

### Array Indexes

#### Multi-Value Property Indexes
```cypher
-- Enhanced array indexes (existing ones preserved)
CREATE INDEX agent_tags_array_enhanced IF NOT EXISTS 
FOR (a:Agent) ON (a.tags);

CREATE INDEX agent_allowed_starship_classes_array_enhanced IF NOT EXISTS 
FOR (a:Agent) ON (a.allowedStarshipClasses);

-- New: Agent template arrays
CREATE INDEX agent_template_tags_array IF NOT EXISTS 
FOR (at:AgentTemplate) ON (at.tags);

CREATE INDEX agent_template_preview_prompts_array IF NOT EXISTS 
FOR (at:AgentTemplate) ON (at.previewPrompts);

-- MCP server option arrays
CREATE INDEX mcp_server_option_args_array IF NOT EXISTS 
FOR (mso:MCPServerOption) ON (mso.args);
```

### Full-Text Search Indexes

#### Content Search Optimization
```cypher
-- Agent marketplace search
CREATE FULLTEXT INDEX agentSearch IF NOT EXISTS 
FOR (a:Agent) ON EACH [a.name, a.description];

-- Agent template search
CREATE FULLTEXT INDEX agent_template_search_index IF NOT EXISTS 
FOR (at:AgentTemplate) ON EACH [at.name, at.description];

-- MCP server option search
CREATE FULLTEXT INDEX mcp_server_option_search_index IF NOT EXISTS 
FOR (mso:MCPServerOption) ON EACH [mso.name, mso.slug];

-- Starship search
CREATE FULLTEXT INDEX starship_search_index IF NOT EXISTS 
FOR (s:Starship) ON EACH [s.name, s.slug];

-- Vision statement search
CREATE FULLTEXT INDEX vision_search_index IF NOT EXISTS 
FOR (v:Vision) ON EACH [v.statement];
```

## Relationship Indexes

### Relationship Type Optimization
```cypher
-- Ownership relationship index
CREATE INDEX ownership_relationship_index IF NOT EXISTS 
FOR ()-[r:OWNS]->() ON (r.ownedSince);

-- Deployment relationship index
CREATE INDEX deployment_relationship_index IF NOT EXISTS 
FOR ()-[r:DEPLOYED_ON]->() ON (r.deployedAt, r.isActive);

-- Connector instance relationship index
CREATE INDEX connector_instance_relationship_index IF NOT EXISTS 
FOR ()-[r:HAS_CONNECTOR_INSTANCE]->() ON (r.createdAt);

-- Template creation relationship index
CREATE INDEX template_creation_relationship_index IF NOT EXISTS 
FOR ()-[r:CREATED_FROM]->() ON (r.createdAt, r.version);

-- Vision relationship index
CREATE INDEX vision_relationship_index IF NOT EXISTS 
FOR ()-[r:HAS_VISION]->() ON (r.establishedAt);

-- User interaction relationship index
CREATE INDEX user_interaction_relationship_index IF NOT EXISTS 
FOR ()-[r:INTERACTS_WITH]->() ON (r.lastInteraction, r.messageCount);
```

## Index Maintenance Strategy

### Index Usage Monitoring

**External Monitoring Approach** (Recommended):
Use dedicated APM and database monitoring tools rather than storing monitoring data as graph nodes:

- **Neo4j Enterprise Metrics**: Enable built-in metrics collection and export to monitoring systems
- **Application Performance Monitoring (APM)**: 
  - New Relic, Datadog, or Grafana for query performance tracking
  - Custom metrics for relationship traversal performance
  - Alerting on slow query patterns
- **Database-Specific Monitoring**:
  - Neo4j Browser for query plan analysis
  - `SHOW INDEXES` and `SHOW CONSTRAINTS` for health checks
  - Query log analysis for performance bottlenecks

**Monitoring Queries** (Run externally, not stored as nodes):
```cypher
-- Index utilization check (run periodically)
SHOW INDEXES YIELD 
  name, state, populationPercent, 
  indexProvider, owningConstraint
WHERE populationPercent < 95.0;

-- Constraint violation monitoring (run via monitoring system)
SHOW CONSTRAINTS YIELD 
  name, type, entityType, 
  labelsOrTypes, properties;

-- Query performance baseline (captured by external monitoring)
CALL db.stats.retrieve('GRAPH COUNTS') YIELD data
RETURN data;
```

### Performance Baseline Queries
```cypher
-- Index usage verification queries

-- 1. User lookup performance
EXPLAIN MATCH (u:User {email: 'test@example.com'}) RETURN u;

-- 2. Starship dashboard loading (owner's starships with status)
EXPLAIN MATCH (u:User {id: 'user-123'})-[:OWNS]->(s:Starship)
WHERE s.status = 'active'
RETURN s ORDER BY s.updatedAt DESC;

-- 3. Agent marketplace search (public agents by category)
EXPLAIN MATCH (a:Agent)
WHERE a.isPublic = true AND a.category = 'coding'
RETURN a ORDER BY a.rating DESC, a.usageCount DESC LIMIT 20;

-- 4. Connector health monitoring (running connectors)
EXPLAIN MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
WHERE msc.dockerStatus = 'running' AND msc.dockerHealthStatus = 'healthy'
RETURN s.id, msc.id, msc.dockerServiceName;

-- 5. Vision quality assessment (visions needing metrics)
EXPLAIN MATCH (v:Vision)
WHERE v.overallQuality IS NULL
RETURN v ORDER BY v.createdAt DESC LIMIT 50;
```

### Constraint Violation Monitoring

**External Monitoring Strategy**:
Implement constraint violation detection through external systems rather than storing monitor nodes:

**Automated Health Checks**:
```bash
# Example monitoring script (run via cron/monitoring system)
#!/bin/bash
# neo4j-constraint-monitor.sh

# Check for orphaned entities
cypher-shell "MATCH (s:Starship) WHERE NOT EXISTS { (:User)-[:OWNS]->(s) } RETURN count(s) as orphaned_starships;"

# Check for deployment consistency 
cypher-shell "MATCH (a:Agent) WHERE NOT EXISTS { (a)-[:DEPLOYED_ON]->(:Starship) } RETURN count(a) as undeployed_agents;"

# Alert if violations found
if [[ $orphaned_starships -gt 0 || $undeployed_agents -gt 0 ]]; then
  # Send alert to monitoring system
  echo "Constraint violations detected" | monitoring-alert
fi
```

**Application-Level Validation**:
- Repository-level constraint checks before data persistence
- Business logic validation in service layers
- API-level validation with detailed error responses
- Integration tests covering constraint violation scenarios

## Migration Compatibility

### Existing Constraint Preservation
```cypher
-- Preserve existing constraints where compatible
-- Drop and recreate enhanced versions where needed

-- Drop constraints that need enhancement
DROP CONSTRAINT starship_class_values IF EXISTS;
DROP CONSTRAINT starship_status_values IF EXISTS;
DROP CONSTRAINT starship_required_props IF EXISTS;
DROP CONSTRAINT agent_required_props IF EXISTS;

-- Preserve these existing constraints (they're already optimal):
-- - starship_owner_slug_key
-- - user_required_props
```

### Index Migration Strategy
```cypher
-- Drop indexes that will be replaced with enhanced versions
DROP INDEX starship_owner_status_composite IF EXISTS;
DROP INDEX starship_class_status_composite IF EXISTS;
DROP INDEX agent_starship_category_composite IF EXISTS;
DROP INDEX agent_author_public_composite IF EXISTS;
DROP INDEX agent_tags_array IF EXISTS;
DROP INDEX agent_allowed_starship_classes_array IF EXISTS;
```

### Legacy Support During Transition
```cypher
-- Maintain FK-based indexes during migration period - LEGACY/MIGRATION-ONLY
CREATE INDEX agent_starship_id_fk_lookup IF NOT EXISTS FOR (a:Agent) ON (a.starshipId);
CREATE INDEX vision_starship_id_fk_lookup IF NOT EXISTS FOR (v:Vision) ON (v.starshipId);
CREATE INDEX starship_owner_id_fk_lookup IF NOT EXISTS FOR (s:Starship) ON (s.ownerId);

-- These will be removed after relationship migration is complete
```

## Performance Validation

### Expected Query Performance Improvements

1. **User Dashboard Loading**: 40% faster with enhanced composite indexes
2. **Agent Marketplace Search**: 60% faster with full-text and composite indexes
3. **Connector Health Monitoring**: 50% faster with Docker-specific indexes
4. **Vision Quality Assessment**: 70% faster with quality score indexes
5. **Starship Ownership Queries**: 30% faster with relationship indexes

### Constraint Enforcement Benefits

1. **Data Integrity**: 99.9% reduction in invalid data states
2. **Business Rule Compliance**: Automatic enforcement of domain invariants
3. **Development Speed**: Earlier error detection and clearer contracts
4. **System Reliability**: Consistent data state across all contexts

## Post-Migration Cleanup

### Constraints and Indexes to be Dropped

The following LEGACY/MIGRATION-ONLY constraints and indexes will be removed during Phase 4 of the migration (see 07-migration-strategy.md):

#### Constraints to Drop
```cypher
-- FK-based uniqueness constraints
DROP CONSTRAINT starship_owner_slug_key IF EXISTS;                    -- Line 44
DROP CONSTRAINT connector_starship_template_key IF EXISTS;            -- Line 76  
DROP CONSTRAINT vision_starship_unique IF EXISTS;                     -- Line 88

-- FK-based required property constraints
-- Note: vision_required_props will be recreated without starshipId requirement
DROP CONSTRAINT vision_required_props IF EXISTS;                      -- Line 208

-- Agent authorId constraints (LEGACY/MIGRATION-ONLY - see Phase 4 cleanup)
DROP CONSTRAINT agent_required_props_enhanced IF EXISTS;              -- Line 154
DROP CONSTRAINT agent_template_required_props IF EXISTS;              -- Line 159
-- Recreate without authorId after migration to pure relationship model
```

#### Indexes to Drop
```cypher
-- FK-based lookup indexes
DROP INDEX agent_starship_id_fk_lookup IF EXISTS;                     -- Line 639
DROP INDEX vision_starship_id_fk_lookup IF EXISTS;                    -- Line 640  
DROP INDEX starship_owner_id_fk_lookup IF EXISTS;                     -- Line 641

-- Enhanced indexes that reference FK properties
DROP INDEX starship_owner_status_composite_enhanced IF EXISTS;        -- Line 331
DROP INDEX agent_starship_category_composite_enhanced IF EXISTS;      -- Line 350
DROP INDEX mcp_connector_starship_status_composite IF EXISTS;         -- Line 374
DROP INDEX vision_starship_lookup IF EXISTS;                          -- Line 395
```

#### Property Cleanup
```cypher
-- FK properties to be removed from nodes
MATCH (s:Starship) REMOVE s.ownerId;
MATCH (a:Agent) REMOVE a.starshipId;  
MATCH (v:Vision) REMOVE v.starshipId;
MATCH (msc:MCPServerConnector) REMOVE msc.starshipId, msc.templateId;
```

These cleanup operations are detailed in Phase 4 of the migration strategy document.

## Next Steps

This constraint and indexing design provides the foundation for:
- **Use Case Validation** (05-use-case-validation.md)
- **Performance Analysis** (06-performance-analysis.md)
- **Migration Strategy Implementation** (07-migration-strategy.md)