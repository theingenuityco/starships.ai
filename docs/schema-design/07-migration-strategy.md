# Migration Strategy

## Overview

This document defines a comprehensive migration strategy from the current mixed FK/relationship patterns to the pure domain-driven graph model. The strategy emphasizes safety, zero-downtime deployment, data consistency validation, and rollback capabilities while maintaining service availability throughout the transition.

## Migration Principles

1. **Zero-Downtime Deployment**: Service remains available throughout migration
2. **Data Consistency**: Maintain data integrity during transition
3. **Rollback Capability**: Support for emergency rollbacks at each phase
4. **Incremental Progress**: Gradual migration with validation checkpoints
5. **Feature Flag Control**: Gradual rollout with selective query pattern switching
6. **Monitoring and Alerting**: Comprehensive monitoring during transition

## Migration Phases Overview

| Phase | Duration | Description | Rollback Risk |
|-------|----------|-------------|---------------|
| **Phase 0** | 1 week | Pre-migration preparation and baseline establishment | None |
| **Phase 1** | 2 weeks | Constraint and index creation, relationship establishment | Low |
| **Phase 2** | 3 weeks | Dual-write implementation and data consistency validation | Medium |
| **Phase 3** | 2 weeks | Query pattern migration with feature flags | Medium |
| **Phase 4** | 1 week | Foreign key property deprecation and cleanup | High |
| **Phase 5** | 1 week | Performance optimization and monitoring setup | Low |

**Total Estimated Duration**: 10 weeks

---

## Phase 0: Pre-Migration Preparation

### Objectives
- Establish performance baselines
- Set up monitoring infrastructure
- Prepare rollback procedures
- Validate current data consistency

### Duration: 1 week

### 0.1 Performance Baseline Establishment

> **⚠️ CAUTION: STAGING/LOCAL-ONLY MONITOR NODES**  
> **The following CREATE (...) monitoring/progress nodes are for staging and local development only.**  
> **DO NOT create persistent monitor nodes in production. Use external monitoring systems instead.**  
> **See "External Monitoring Setup" section in this document and 04-constraints-and-indexes.md for production-ready alternatives.**

```cypher
-- Create performance monitoring infrastructure (STAGING/LOCAL-ONLY)
CREATE (pb:PerformanceBaseline {
  id: 'domain_migration_baseline',
  name: 'Domain-Driven Schema Migration Baseline',
  createdAt: datetime(),
  queryMetrics: {},
  indexStats: {},
  resourceUtilization: {},
  concurrencyStats: {}
});

-- Capture current query performance (STAGING/LOCAL-ONLY)
CREATE (qm:QueryMetrics {
  id: 'baseline_query_metrics',
  timestamp: datetime(),
  starshipDashboardAvg: 0.0,    // Will be populated by monitoring
  marketplaceSearchAvg: 0.0,    // Will be populated by monitoring
  connectorHealthAvg: 0.0,      // Will be populated by monitoring
  visionAssessmentAvg: 0.0,     // Will be populated by monitoring
  billingWebhookAvg: 0.0        // Will be populated by monitoring
});
```

### 0.2 Data Consistency Validation
```cypher
-- Validate current data consistency
MATCH (a:Agent)
WHERE a.starshipId IS NOT NULL
WITH a
OPTIONAL MATCH (s:Starship {id: a.starshipId})
RETURN count(a) as totalAgents,
       count(s) as validStarshipRefs,
       count(a) - count(s) as orphanedAgents;

-- Check for data integrity issues
MATCH (s:Starship)
WHERE s.ownerId IS NOT NULL
WITH s
OPTIONAL MATCH (u:User {id: s.ownerId})
RETURN count(s) as totalStarships,
       count(u) as validOwnerRefs,
       count(s) - count(u) as orphanedStarships;
```

### 0.3 Backup and Recovery Preparation
- Database backup creation
- Recovery procedure validation
- Rollback script preparation
- Monitoring dashboard setup

### Success Criteria
- ✅ Performance baseline established
- ✅ Data consistency validated (0 orphaned records)
- ✅ Backup and recovery procedures verified
- ✅ Monitoring infrastructure operational

---

## Phase 1: Schema Foundation

### Objectives
- Create new constraints and indexes
- Establish relationship types
- Prepare infrastructure for dual-write pattern

### Duration: 2 weeks

### 1.1 Constraint Creation (Week 1)
```cypher
-- Execute constraint creation from 04-constraints-and-indexes.md
-- Primary key constraints
CREATE CONSTRAINT user_id_unique IF NOT EXISTS 
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT starship_id_unique IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT agent_id_unique IF NOT EXISTS 
FOR (a:Agent) REQUIRE a.id IS UNIQUE;

-- Enhanced property constraints
-- NOTE: Neo4j 5.x does not support enumeration/range constraints; enforce in application or via APOC triggers.
-- CREATE CONSTRAINT starship_class_values_enhanced IF NOT EXISTS 
-- FOR (s:Starship) REQUIRE s.class IN ['scout', 'cruiser', 'draught'];

-- CREATE CONSTRAINT starship_status_values_enhanced IF NOT EXISTS 
-- FOR (s:Starship) REQUIRE s.status IN ['active', 'inactive', 'restricted', 'disabled', 'pending_payment'];

-- Node key constraints
CREATE CONSTRAINT starship_owner_slug_key IF NOT EXISTS 
FOR (s:Starship) REQUIRE (s.ownerId, s.slug) IS NODE KEY;

CREATE CONSTRAINT connector_starship_template_key IF NOT EXISTS 
FOR (msc:MCPServerConnector) REQUIRE (msc.starshipId, msc.templateId) IS NODE KEY;
```

### 1.2 Index Creation (Week 1-2)
```cypher
-- Performance indexes from 04-constraints-and-indexes.md
-- User context indexes
CREATE INDEX user_email_lookup IF NOT EXISTS FOR (u:User) ON (u.email);
CREATE INDEX user_kinde_id_lookup IF NOT EXISTS FOR (u:User) ON (u.kindeId);

-- Starship context indexes
CREATE INDEX starship_owner_status_composite_enhanced IF NOT EXISTS 
FOR (s:Starship) ON (s.ownerId, s.status);

-- Agent marketplace indexes
CREATE INDEX agent_category_public_rating_composite IF NOT EXISTS 
FOR (a:Agent) ON (a.category, a.isPublic, a.rating);

-- Connector management indexes
CREATE INDEX mcp_connector_starship_status_composite IF NOT EXISTS 
FOR (msc:MCPServerConnector) ON (msc.starshipId, msc.status);

-- Full-text search indexes
CREATE FULLTEXT INDEX agent_search_index IF NOT EXISTS 
FOR (a:Agent) ON EACH [a.name, a.description];
```

### 1.3 Relationship Type Validation
```cypher
-- Verify relationship types are ready for use
CALL db.relationshipTypes() YIELD relationshipType
WHERE relationshipType IN ['OWNS', 'DEPLOYED_ON', 'HAS_CONNECTOR_INSTANCE', 'HAS_VISION', 'CREATED_FROM', 'AUTHORS']
RETURN count(*) as supportedRelationshipTypes;
```

### 1.4 Migration Tracking Setup
```cypher
-- Create migration progress tracking (STAGING/LOCAL-ONLY)
CREATE (mp:MigrationProgress {
  id: 'domain_driven_migration',
  name: 'Domain-Driven Schema Migration',
  currentPhase: 'Phase 1: Schema Foundation',
  startedAt: datetime(),
  phases: [
    {phase: 0, status: 'completed', completedAt: datetime()},
    {phase: 1, status: 'in_progress', startedAt: datetime()}
  ],
  dataConsistencyChecks: [],
  performanceMetrics: []
});
```

### Success Criteria
- ✅ All constraints created without violations
- ✅ All indexes created and populated (>95%)
- ✅ Relationship types validated
- ✅ No performance degradation from new constraints

### Rollback Procedure (Phase 1)
```cypher
-- Drop newly created constraints (if needed)
DROP CONSTRAINT starship_class_values_enhanced IF EXISTS;
DROP CONSTRAINT starship_status_values_enhanced IF EXISTS;
-- ... (drop all newly created constraints)

-- Drop newly created indexes
DROP INDEX starship_owner_status_composite_enhanced IF EXISTS;
-- ... (drop all newly created indexes)
```

---

## Phase 2: Dual-Write Implementation

### Objectives
- Implement relationship creation alongside existing FK updates
- Validate data consistency between FK and relationship patterns
- Establish monitoring for dual-write performance

### Duration: 3 weeks

### 2.1 Repository Enhancement (Week 1-2)

#### StarshipRepository Dual-Write
```typescript
// Enhanced create method with relationship establishment
async create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'maxActiveMissions' | 'updatedAt' | 'slug'> & { slug?: string }): Promise<Starship> {
  return this.executeWithErrorHandling(async () => {
    const connection = getConnection();
    
    // ... existing starship creation logic ...
    
    // PHASE 2: Create ownership relationship alongside FK
    await connection.executeWrite(
      `MATCH (u:User {id: $ownerId}), (s:Starship {id: $starshipId})
       CREATE (u)-[:OWNS {
         ownedSince: $timestamp,
         role: 'owner'
       }]->(s)`,
      {
        ownerId: starship.ownerId,
        starshipId: starship.id,
        timestamp: starship.createdAt,
      }
    );

    return starship;
  }, 'create', 'Starship');
}
```

#### AgentRepository Dual-Write Enhancement
```typescript
// Enhanced deployment method
async updateStarshipId(agentId: string, starshipId: string): Promise<void> {
  const connection = getConnection();
  
  // Existing FK update (maintain during transition)
  const result = await connection.executeWrite<{ count: number }>(
    `MATCH (a:Agent) WHERE a.id = $agentId
     SET a.starshipId = $starshipId, a.updatedAt = $timestamp
     RETURN count(a) as count`,
    {
      agentId,
      starshipId,
      timestamp: new Date().toISOString()
    }
  );
  
  // PHASE 2: Enhanced relationship management
  try {
    // Remove existing deployment relationships
    await connection.executeWrite(
      'MATCH (a:Agent {id: $agentId})-[r:DEPLOYED_ON]->() DELETE r',
      { agentId }
    );
    
    // Create new deployment relationship
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
       CREATE (a)-[:DEPLOYED_ON {
         deployedAt: $timestamp,
         isActive: true,
         version: a.version
       }]->(s)`,
      {
        starshipId,
        agentId,
        timestamp: new Date().toISOString()
      }
    );
  } catch (error) {
    // Log relationship errors but don't fail the operation during transition
    console.warn('Relationship creation failed during dual-write phase:', error);
  }
}
```

### 2.2 Data Consistency Validation (Week 2-3)
```cypher
-- Continuous consistency monitoring (STAGING/LOCAL-ONLY)
CREATE (cc:ConsistencyCheck {
  id: 'dual_write_consistency_' + randomUUID(),
  timestamp: datetime(),
  checkType: 'agent_deployment_consistency',
  results: {}
});

-- Agent deployment consistency check
MATCH (a:Agent)
WHERE a.starshipId IS NOT NULL
WITH a
OPTIONAL MATCH (s:Starship {id: a.starshipId})
OPTIONAL MATCH (a)-[:DEPLOYED_ON]->(relS:Starship)
RETURN count(*) as totalAgents,
       count(s) as fkMatches,
       count(relS) as relationshipMatches,
       count(CASE WHEN s.id = relS.id THEN 1 END) as consistentMatches,
       count(CASE WHEN s.id IS NOT NULL AND relS.id IS NULL THEN 1 END) as missingRelationships,
       count(CASE WHEN s.id IS NULL AND relS.id IS NOT NULL THEN 1 END) as orphanedRelationships;

-- Starship ownership consistency check
MATCH (s:Starship)
WHERE s.ownerId IS NOT NULL
WITH s
OPTIONAL MATCH (u:User {id: s.ownerId})
OPTIONAL MATCH (relU:User)-[:OWNS]->(s)
RETURN count(*) as totalStarships,
       count(u) as fkMatches,
       count(relU) as relationshipMatches,
       count(CASE WHEN u.id = relU.id THEN 1 END) as consistentMatches;
```

### 2.3 Performance Impact Monitoring
```cypher
-- Monitor dual-write performance impact (STAGING/LOCAL-ONLY)
CREATE (pm:PerformanceMonitor {
  id: 'dual_write_performance_' + randomUUID(),
  timestamp: datetime(),
  phase: 'dual_write',
  metrics: {
    avgWriteTime: 0.0,
    consistencyCheckTime: 0.0,
    relationshipCreationTime: 0.0,
    errorRate: 0.0
  }
});
```

### 2.4 Data Healing Process
```cypher
-- Heal missing relationships for existing data
// Starship ownership relationships
MATCH (s:Starship)
WHERE s.ownerId IS NOT NULL 
  AND NOT EXISTS { (:User)-[:OWNS]->(s) }
WITH s
MATCH (u:User {id: s.ownerId})
CREATE (u)-[:OWNS {
  ownedSince: s.createdAt,
  role: 'owner'
}]->(s);

// Agent deployment relationships  
MATCH (a:Agent)
WHERE a.starshipId IS NOT NULL 
  AND NOT EXISTS { (a)-[:DEPLOYED_ON]->(:Starship) }
WITH a
MATCH (s:Starship {id: a.starshipId})
CREATE (a)-[:DEPLOYED_ON {
  deployedAt: a.createdAt,
  isActive: true,
  version: a.version
}]->(s);

// Vision relationships
MATCH (v:Vision)
WHERE v.starshipId IS NOT NULL 
  AND NOT EXISTS { (:Starship)-[:HAS_VISION]->(v) }
WITH v
MATCH (s:Starship {id: v.starshipId})
CREATE (s)-[:HAS_VISION {
  establishedAt: v.createdAt
}]->(v);
```

### Success Criteria
- ✅ Dual-write implemented for all critical operations
- ✅ Data consistency >99% between FK and relationships
- ✅ Performance degradation <10% during dual-write
- ✅ Data healing completed for existing records

### Rollback Procedure (Phase 2)
```cypher
-- Remove dual-write relationships (keep FK intact)
MATCH ()-[r:OWNS]->() WHERE r.ownedSince >= $migrationStartTime DELETE r;
MATCH ()-[r:DEPLOYED_ON]->() WHERE r.deployedAt >= $migrationStartTime DELETE r;
MATCH ()-[r:HAS_VISION]->() WHERE r.establishedAt >= $migrationStartTime DELETE r;

-- Revert repository code to Phase 1 state
-- Remove dual-write logic from repository methods
```

---

## Phase 3: Query Pattern Migration

### Objectives
- Gradually migrate queries from FK-based to relationship-based
- Use feature flags for controlled rollout
- Validate query performance improvements

### Duration: 2 weeks

### 3.1 Feature Flag Implementation (Week 1)
```typescript
// Feature flag service for query pattern migration
class QueryPatternFeatureFlags {
  private flags: Map<string, boolean> = new Map();
  
  constructor() {
    // Initialize with conservative settings
    this.flags.set('USE_RELATIONSHIP_STARSHIP_OWNERSHIP', false);
    this.flags.set('USE_RELATIONSHIP_AGENT_DEPLOYMENT', false);
    this.flags.set('USE_RELATIONSHIP_VISION_LOOKUP', false);
    this.flags.set('USE_RELATIONSHIP_CONNECTOR_MANAGEMENT', false);
  }
  
  isEnabled(flagName: string): boolean {
    return this.flags.get(flagName) ?? false;
  }
  
  enable(flagName: string): void {
    this.flags.set(flagName, true);
  }
  
  disable(flagName: string): void {
    this.flags.set(flagName, false);
  }
}
```

### 3.2 Gradual Query Migration (Week 1-2)

#### Starship Dashboard Migration
```typescript
// StarshipRepository with feature flag support
async findByOwner(ownerId: string): Promise<Starship[]> {
  if (this.featureFlags.isEnabled('USE_RELATIONSHIP_STARSHIP_OWNERSHIP')) {
    // New relationship-based query
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        `MATCH (u:User {id: $ownerId})-[:OWNS]->(s:Starship)
         RETURN s ORDER BY s.updatedAt DESC`,
        { ownerId }
      );
      return result.map((record) => record.s);
    }, 'findByOwner', 'Starship');
  } else {
    // Legacy FK-based query (fallback)
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
        { ownerId }
      );
      return result.map((record) => record.s);
    }, 'findByOwner', 'Starship');
  }
}
```

#### Agent Deployment Migration
```typescript
// AgentRepository with feature flag support
async findByStarship(starshipId: string): Promise<Agent[]> {
  if (this.featureFlags.isEnabled('USE_RELATIONSHIP_AGENT_DEPLOYMENT')) {
    // New relationship-based query
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent) RETURN a ORDER BY a.name',
      { starshipId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  } else {
    // Legacy FK-based query (fallback)
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.starshipId = $starshipId RETURN a ORDER BY a.name',
      { starshipId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }
}
```

### 3.3 Performance Validation During Migration
```cypher
-- Performance comparison tracking (STAGING/LOCAL-ONLY)
CREATE (pv:PerformanceValidation {
  id: 'query_migration_validation_' + randomUUID(),
  timestamp: datetime(),
  flagStates: {},
  queryMetrics: {
    relationshipQueries: {},
    fkQueries: {},
    performanceComparison: {}
  }
});
```

### 3.4 Gradual Feature Flag Rollout Schedule

| Week | Feature Flag | Rollout % | Validation Period |
|------|-------------|-----------|-------------------|
| 1.1 | `USE_RELATIONSHIP_STARSHIP_OWNERSHIP` | 10% | 2 days |
| 1.3 | `USE_RELATIONSHIP_STARSHIP_OWNERSHIP` | 50% | 2 days |
| 1.5 | `USE_RELATIONSHIP_STARSHIP_OWNERSHIP` | 100% | 1 day |
| 2.1 | `USE_RELATIONSHIP_AGENT_DEPLOYMENT` | 10% | 2 days |
| 2.3 | `USE_RELATIONSHIP_AGENT_DEPLOYMENT` | 50% | 2 days |
| 2.5 | `USE_RELATIONSHIP_AGENT_DEPLOYMENT` | 100% | 1 day |

### Success Criteria
- ✅ All feature flags successfully enabled at 100%
- ✅ Query performance meets or exceeds baseline
- ✅ No data consistency issues during query migration
- ✅ Error rates remain within acceptable thresholds (<0.1%)

### Rollback Procedure (Phase 3)
```typescript
// Emergency rollback: disable all feature flags
featureFlags.disable('USE_RELATIONSHIP_STARSHIP_OWNERSHIP');
featureFlags.disable('USE_RELATIONSHIP_AGENT_DEPLOYMENT');
featureFlags.disable('USE_RELATIONSHIP_VISION_LOOKUP');
featureFlags.disable('USE_RELATIONSHIP_CONNECTOR_MANAGEMENT');

// Revert to FK-based queries immediately
// Monitor for system stability recovery
```

---

## Phase 4: Foreign Key Deprecation

### Objectives
- Remove FK properties that duplicate relationship information
- Clean up legacy dual-write code
- Optimize queries for pure relationship patterns

### Duration: 1 week

### ⚠️ **HIGH RISK PHASE** ⚠️

### 4.1 Pre-Deprecation Validation
```cypher
-- Comprehensive data consistency validation before FK removal
MATCH (a:Agent)
WHERE a.starshipId IS NOT NULL
WITH a
OPTIONAL MATCH (a)-[:DEPLOYED_ON]->(s:Starship)
WHERE s.id = a.starshipId
RETURN count(*) as totalAgents,
       count(s) as consistentDeployments;

-- Must be 100% consistent before proceeding
```

### 4.2 FK Property Deprecation
```cypher
-- Mark FK properties as deprecated (don't delete yet)
MATCH (a:Agent) 
WHERE a.starshipId IS NOT NULL 
SET a._deprecated_starshipId = a.starshipId,
    a.starshipId = null;

MATCH (v:Vision) 
WHERE v.starshipId IS NOT NULL 
SET v._deprecated_starshipId = v.starshipId,
    v.starshipId = null;

MATCH (s:Starship) 
WHERE s.ownerId IS NOT NULL 
SET s._deprecated_ownerId = s.ownerId,
    s.ownerId = null;
```

### 4.3 Repository Code Cleanup
```typescript
// Remove dual-write logic and FK-based fallbacks
// Clean up feature flag conditional code
// Optimize for pure relationship patterns

// Example: Simplified agent deployment query
async findByStarship(starshipId: string): Promise<Agent[]> {
  const connection = getConnection();
  const result = await connection.executeQuery<{ a: Agent }>(
    'MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent) RETURN a ORDER BY a.name',
    { starshipId }
  );
  return convertNeo4jIntsInArray(result.map((record) => record.a));
}
```

### 4.4 Index Cleanup
```cypher
-- Remove FK-based indexes that are no longer needed
DROP INDEX agent_starship_id_fk_lookup IF EXISTS;
DROP INDEX vision_starship_id_fk_lookup IF EXISTS;
DROP INDEX starship_owner_id_fk_lookup IF EXISTS;

-- Keep relationship indexes optimized
```

### Success Criteria
- ✅ All FK properties successfully deprecated
- ✅ No query functionality lost
- ✅ Performance improvement from simplified queries
- ✅ Repository code cleaned and optimized

### Rollback Procedure (Phase 4)
```cypher
-- EMERGENCY: Restore FK properties from deprecated copies
MATCH (a:Agent) 
WHERE a._deprecated_starshipId IS NOT NULL 
SET a.starshipId = a._deprecated_starshipId;

MATCH (v:Vision) 
WHERE v._deprecated_starshipId IS NOT NULL 
SET v.starshipId = v._deprecated_starshipId;

MATCH (s:Starship) 
WHERE s._deprecated_ownerId IS NOT NULL 
SET s.ownerId = s._deprecated_ownerId;

-- Restore FK-based indexes
CREATE INDEX agent_starship_id_fk_lookup FOR (a:Agent) ON (a.starshipId);
-- ... (restore all FK indexes)

-- Revert repository code to Phase 3 state
```

---

## Phase 5: Optimization and Monitoring

### Objectives
- Optimize relationship indexes based on actual usage patterns
- Set up long-term performance monitoring
- Clean up migration artifacts

### Duration: 1 week

### 5.1 Performance Optimization
```cypher
-- Analyze query patterns and optimize indexes
CALL db.stats.retrieve('GRAPH COUNTS') YIELD section, data
WHERE section = 'relationships'
RETURN section, data;

-- Create additional indexes based on usage patterns
CREATE INDEX high_frequency_relationship_patterns IF NOT EXISTS 
FOR ()-[r:DEPLOYED_ON]->() ON (r.isActive, r.deployedAt);

-- Remove unused indexes
SHOW INDEXES YIELD name, type, entityType, state, populationPercent
WHERE populationPercent < 50 OR state <> 'ONLINE'
RETURN name;
```

### 5.2 Long-term Monitoring Setup
```cypher
-- Create permanent monitoring infrastructure (STAGING/LOCAL-ONLY)
CREATE (lm:LongTermMonitor {
  id: 'domain_driven_schema_monitor',
  name: 'Domain-Driven Schema Long-term Monitor',
  createdAt: datetime(),
  monitoringIntervals: {
    performanceCheck: 'hourly',
    consistencyCheck: 'daily',
    indexHealth: 'daily',
    queryAnalysis: 'weekly'
  },
  alertThresholds: {
    slowQueryThreshold: 50,      // milliseconds
    errorRateThreshold: 0.1,     // percentage
    indexUtilizationMin: 75      // percentage
  }
});
```

### 5.3 Migration Artifact Cleanup
```cypher
-- Remove deprecated FK properties after validation period
MATCH (a:Agent) 
WHERE a._deprecated_starshipId IS NOT NULL 
REMOVE a._deprecated_starshipId;

MATCH (v:Vision) 
WHERE v._deprecated_starshipId IS NOT NULL 
REMOVE v._deprecated_starshipId;

MATCH (s:Starship) 
WHERE s._deprecated_ownerId IS NOT NULL 
REMOVE s._deprecated_ownerId;

-- Remove migration tracking nodes
MATCH (n) 
WHERE n.id STARTS WITH 'dual_write_' OR n.id STARTS WITH 'migration_'
DELETE n;
```

### 5.4 Final Performance Validation
```cypher
-- Final performance comparison with baseline (STAGING/LOCAL-ONLY)
MATCH (pb:PerformanceBaseline {id: 'domain_migration_baseline'})
WITH pb
CREATE (pf:PerformanceFinal {
  id: 'domain_migration_final',
  timestamp: datetime(),
  baselineMetrics: pb.queryMetrics,
  finalMetrics: {},  // To be populated
  improvementPercentages: {},
  migrationSuccess: true
});
```

### Success Criteria
- ✅ All migration artifacts cleaned up
- ✅ Long-term monitoring operational
- ✅ Performance improvements validated and documented
- ✅ System stability confirmed over 48-hour period

---

## Data Consistency Validation Framework

### Continuous Consistency Checks
```cypher
-- Automated consistency validation queries
// Agent deployment consistency
MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship)
WITH s, count(a) as relationshipCount
MATCH (directAgent:Agent) 
WHERE directAgent.starshipId = s.id  // During dual-write phase
WITH s, relationshipCount, count(directAgent) as fkCount
WHERE relationshipCount <> fkCount
RETURN s.id, relationshipCount, fkCount;

// Starship ownership consistency  
MATCH (u:User)-[:OWNS]->(s:Starship)
WITH u, count(s) as relationshipCount
MATCH (directStarship:Starship)
WHERE directStarship.ownerId = u.id  // During dual-write phase
WITH u, relationshipCount, count(directStarship) as fkCount
WHERE relationshipCount <> fkCount
RETURN u.id, relationshipCount, fkCount;
```

### Consistency Repair Procedures
```cypher
-- Repair missing relationships (safe to run multiple times)
// Fix missing ownership relationships
MATCH (s:Starship)
WHERE s.ownerId IS NOT NULL 
  AND NOT EXISTS { (:User)-[:OWNS]->(s) }
WITH s
MATCH (u:User {id: s.ownerId})
CREATE (u)-[:OWNS {
  ownedSince: s.createdAt,
  role: 'owner',
  repairedAt: datetime()
}]->(s);

// Fix missing deployment relationships
MATCH (a:Agent)
WHERE a.starshipId IS NOT NULL 
  AND NOT EXISTS { (a)-[:DEPLOYED_ON]->(:Starship) }
WITH a
MATCH (s:Starship {id: a.starshipId})
CREATE (a)-[:DEPLOYED_ON {
  deployedAt: a.createdAt,
  isActive: true,
  version: a.version,
  repairedAt: datetime()
}]->(s);
```

## Rollback Procedures

### Emergency Rollback Decision Matrix

| Criteria | Phase 1-2 | Phase 3 | Phase 4 | Phase 5 |
|----------|-----------|---------|---------|---------|
| Data Consistency Issues | Immediate | Immediate | Immediate | Immediate |
| Performance Degradation >20% | Immediate | Immediate | Consider | Monitor |
| Error Rate >1% | Immediate | Immediate | Immediate | Consider |
| Query Failures | Immediate | Feature Flag | Immediate | Monitor |

### Complete Rollback Procedure
```cypher
-- Phase 4 Emergency Rollback (most critical)
// 1. Restore FK properties
MATCH (a:Agent) WHERE a._deprecated_starshipId IS NOT NULL 
SET a.starshipId = a._deprecated_starshipId;

// 2. Restore FK indexes
CREATE INDEX agent_starship_id_fk_lookup FOR (a:Agent) ON (a.starshipId);

// 3. Revert application code to FK-based queries
// 4. Disable all relationship-based features

-- Phase 3 Rollback
// 1. Disable all feature flags
// 2. Ensure FK data is consistent
// 3. Monitor for stability

-- Phase 2 Rollback  
// 1. Remove dual-write logic
// 2. Keep FK properties intact
// 3. Remove relationship data created during phase

-- Phase 1 Rollback
// 1. Drop new constraints and indexes
// 2. Return to baseline schema
```

## Monitoring and Alerting

### Key Monitoring Metrics

#### Performance Metrics
- **Query Execution Time**: Per query type and pattern
- **Index Utilization**: Seek vs scan ratios
- **Memory Usage**: Relationship cache efficiency
- **Concurrency**: Lock wait times and throughput

#### Data Integrity Metrics
- **Consistency Percentage**: FK vs relationship data alignment
- **Orphaned Record Count**: Missing relationships or invalid FKs
- **Constraint Violations**: Schema integrity issues

#### Migration Progress Metrics
- **Phase Completion**: Timeline and milestone tracking
- **Feature Flag Status**: Rollout percentages and stability
- **Error Rates**: By query type and migration phase

### Alert Configuration
```cypher
-- Set up automated alerting thresholds (STAGING/LOCAL-ONLY)
CREATE (ac:AlertConfig {
  id: 'migration_alerts',
  thresholds: {
    consistencyAlert: 95,        // Below 95% consistency
    performanceAlert: 150,       // 50% slower than baseline
    errorRateAlert: 0.5,         // Above 0.5% error rate
    indexHealthAlert: 80         // Below 80% index utilization
  },
  notificationChannels: ['slack', 'email', 'pagerduty'],
  escalationPolicy: {
    immediate: ['data_consistency', 'query_failures'],
    hourly: ['performance_degradation'],
    daily: ['index_health']
  }
});
```

## Success Validation

### Final Migration Success Criteria

#### Functional Success
- ✅ All use cases functional with relationship-based queries
- ✅ Data consistency maintained at >99.9%
- ✅ No feature regression or functionality loss
- ✅ All domain boundaries properly implemented

#### Performance Success
- ✅ Query performance improved per analysis in 06-performance-analysis.md
- ✅ Memory usage reduced by ≥30%
- ✅ Concurrency improved by ≥25%
- ✅ Index efficiency improved by ≥20%

#### Quality Success
- ✅ Code complexity reduced through consistent patterns
- ✅ Domain-driven design principles fully implemented
- ✅ Schema constraints enforcing business rules
- ✅ Long-term maintainability improved

### Post-Migration Validation Period
- **Week 1**: Intensive monitoring and immediate issue resolution
- **Week 2**: Performance optimization and fine-tuning
- **Week 3**: Stability validation and documentation updates
- **Week 4**: Final review and migration closure

## Documentation Updates

### Required Documentation Updates Post-Migration
1. **Repository Documentation**: Update all repository interfaces and examples
2. **Query Pattern Guidelines**: Document new relationship-based patterns
3. **Performance Benchmarks**: Update with new baseline metrics
4. **Domain Model Documentation**: Reflect new pure graph schema
5. **Troubleshooting Guides**: Include relationship-specific debugging

## Next Steps

This migration strategy provides the roadmap for transitioning to the domain-driven graph schema and completes the schema design documentation series. The strategy ensures:

- **Safe Migration**: Zero-downtime approach with comprehensive rollback procedures
- **Data Integrity**: Continuous validation and repair mechanisms
- **Performance Optimization**: Expected improvements validated throughout migration
- **Long-term Maintainability**: Clean, consistent schema aligned with domain boundaries

The migration can begin with Phase 0 preparation once stakeholder approval is obtained for the complete schema design specification.