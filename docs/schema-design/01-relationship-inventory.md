# Relationship Inventory Analysis

## Overview

This document provides a comprehensive inventory of all relationship patterns currently used in the starships.ai codebase. Through systematic analysis of repository implementations, we've identified a mixed approach that uses both Neo4j graph relationships and foreign key properties, creating inconsistency and maintenance overhead.

## Analysis Methodology

- **Source Files Analyzed**: 5 repository files in `packages/models/src/repositories/`
- **Analysis Scope**: All Cypher queries containing `-[:TYPE]->` patterns and property-based foreign keys
- **Pattern Detection**: Manual review of all repository methods and query patterns

## Current Relationship Patterns

### 1. User Domain Relationships

| Source Node | Target Node | Relationship Type | FK Property | Repository Usage | Query Pattern |
|-------------|-------------|------------------|-------------|-----------------|---------------|
| User | Starship | OWNS | ownerId | StarshipRepository:164-172 | `(u:User {id: $ownerId}), (s:Starship {id: $starshipId}) CREATE (u)-[:OWNS {ownedSince: $timestamp}]->(s)` |
| User | Channel | ACTIVE_IN | - | UserRepository:152-157 | `(u:User)-[r:ACTIVE_IN]->(c:Channel)` |
| User | Agent | INTERACTS_WITH | - | AgentRepository:49-52 | `(a:Agent)<-[:INTERACTS_WITH]-(u:User)` |

**Mixed Pattern Issues**:
- Starship ownership uses BOTH `ownerId` property on Starship AND `[:OWNS]` relationship
- User-Channel relationships use pure graph relationships
- User-Agent interactions use pure graph relationships

### 2. Starship Domain Relationships

| Source Node | Target Node | Relationship Type | FK Property | Repository Usage | Query Pattern |
|-------------|-------------|------------------|-------------|-----------------|---------------|
| Agent | Starship | DEPLOYED_ON | starshipId | StarshipRepository:232-237, AgentRepository:58-61 | `(s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)` |
| Starship | MCPServerOption | HAS_CONNECTOR | - | StarshipRepository:434-453 | `(s:Starship {id: $starshipId})-[r:HAS_CONNECTOR]->(m:MCPServerOption)` |
| Starship | MCPServerConnector | HAS_CONNECTOR_INSTANCE | - | MCPServerConnectorRepository:476-488 | `(s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(c:MCPServerConnector)` |
| Starship | Vision | HAS_VISION | starshipId | VisionRepository:68-76 | `(s:Starship {id: $starshipId})-[:HAS_VISION {createdAt: $timestamp}]->(v:Vision)` |

**Critical Mixed Pattern Issues**:
- Agent deployment uses BOTH `starshipId` FK on Agent AND `[:DEPLOYED_ON]` relationship
- Vision uses BOTH `starshipId` FK on Vision AND `[:HAS_VISION]` relationship
- Connector instances use pure graph relationships
- MCP server connections use pure graph relationships

### 3. Agent Domain Relationships

| Source Node | Target Node | Relationship Type | FK Property | Repository Usage | Query Pattern |
|-------------|-------------|------------------|-------------|-----------------|---------------|
| Agent | Starship | DEPLOYED_ON | starshipId | AgentRepository:58-61, 65-72 | `(a:Agent)-[:DEPLOYED_ON]->(s:Starship)` |
| Agent | Channel | ACTIVE_IN | - | AgentRepository:40-43 | `(a:Agent)-[:ACTIVE_IN]->(c:Channel)` |

**Dual Query Patterns Identified**:
- `findByStarship()`: Uses graph relationship `(a:Agent)-[:DEPLOYED_ON]->(s:Starship)`
- `findByStarshipId()`: Uses FK property `a.starshipId = $starshipId`
- **Transition Logic**: AgentRepository:103-128 maintains both patterns during updates

### 4. Connector Domain Relationships

| Source Node | Target Node | Relationship Type | FK Property | Repository Usage | Query Pattern |
|-------------|-------------|------------------|-------------|-----------------|---------------|
| MCPServerConnector | MCPServerOption | CREATED_FROM | templateId | MCPServerConnectorRepository:277-294 | `(c:MCPServerConnector)-[:CREATED_FROM {createdAt: $timestamp}]->(t:MCPServerOption)` |
| MCPServerConnector | Starship | - | starshipId | MCPServerConnectorRepository | Direct FK usage only |

**Inconsistent Pattern**:
- Template relationship uses pure graph relationship
- Starship relationship uses FK property only (no graph relationship)

### 5. Vision Domain Relationships

| Source Node | Target Node | Relationship Type | FK Property | Repository Usage | Query Pattern |
|-------------|-------------|------------------|-------------|-----------------|---------------|
| Vision | Starship | - | starshipId | VisionRepository:42-47 | `v.starshipId = $starshipId` |
| Starship | Vision | HAS_VISION | - | VisionRepository:68-76 | `(s:Starship)-[:HAS_VISION]->(v:Vision)` |

**Redundant Pattern**:
- Vision uses `starshipId` FK for queries
- Starship creates `[:HAS_VISION]` relationship but doesn't use it for queries

## Transition Logic Analysis

### Agent Repository Dual Maintenance

```cypher
-- AgentRepository:103-128 - Maintains both patterns during transition
-- Update agent's starshipId (FK approach)
MATCH (a:Agent) WHERE a.id = $agentId
SET a.starshipId = $starshipId, a.updatedAt = $timestamp

-- For backward compatibility, update Neo4j relationship
MATCH (a:Agent {id: $agentId})-[r:DEPLOYED_ON]->() DELETE r
MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
CREATE (a)-[:DEPLOYED_ON {deployedAt: $timestamp, isActive: true}]->(s)
```

### Vision Repository Inconsistent Maintenance

```cypher
-- VisionRepository:68-76 - Creates relationship but doesn't use it
MATCH (s:Starship {id: $starshipId}), (v:Vision {id: $visionId})
CREATE (s)-[:HAS_VISION {createdAt: $timestamp}]->(v)

-- VisionRepository:42-47 - Queries use FK instead
MATCH (v:Vision) WHERE v.starshipId = $starshipId RETURN v
```

## Performance Implications

### Index Usage Patterns

Current queries suggest these indexes are being used:
- `Starship.id` (primary key lookups)
- `Agent.starshipId` (FK-based queries)
- `Vision.starshipId` (FK-based queries)
- `User.id`, `User.email`, `User.kindeId` (user lookups)

### Relationship Traversal Performance

Graph relationship queries like:
```cypher
MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
```

Are competing with FK-based queries like:
```cypher
MATCH (a:Agent) WHERE a.starshipId = $starshipId
```

This dual pattern creates query optimization challenges and index confusion.

## Critical Issues Identified

### 1. Inconsistent Relationship Modeling
- **5 different patterns** across 5 domains
- **Mixed FK/relationship usage** in 3 critical areas (Agent deployment, Vision linking, User ownership)
- **Duplicated relationship maintenance** in Agent repository

### 2. Query Complexity and Maintenance
- **Multiple query paths** for same logical relationship
- **Transition logic complexity** maintaining both patterns
- **Error-prone updates** requiring dual maintenance

### 3. Domain Boundary Confusion
- **No clear ownership** of relationship patterns
- **Inconsistent modeling decisions** across domains
- **Technical debt accumulation** from mixed approaches

### 4. Performance Concerns
- **Index fragmentation** across FK properties and relationship indexes
- **Query optimization conflicts** between graph and property-based patterns
- **Potential inconsistency** between FK and relationship data

## Repository Pattern Summary

| Repository | Pure Graph | Pure FK | Mixed | Transition Logic |
|------------|------------|---------|-------|------------------|
| UserRepository | ✓ (channels, agents) | ✗ | ✓ (starship ownership) | ✗ |
| StarshipRepository | ✓ (connectors) | ✗ | ✓ (agents, vision) | ✗ |
| AgentRepository | ✓ (channels) | ✓ (starship lookup) | ✓ (starship deployment) | ✓ |
| MCPServerConnectorRepository | ✓ (templates) | ✓ (starship) | ✗ | ✗ |
| VisionRepository | ✗ | ✓ (starship lookup) | ✓ (starship relationship) | ✗ |

## Recommendations

1. **Standardize on pure graph relationships** to leverage Neo4j's strengths
2. **Eliminate FK properties** that duplicate relationship information
3. **Establish clear domain boundaries** for relationship ownership
4. **Create migration strategy** to transition existing mixed patterns
5. **Implement consistent indexing strategy** for relationship traversals

## Generated Analysis Outputs

For reproducibility and verification confidence, this relationship inventory is cross-linked to generated analysis outputs:

### Analysis Reports
- **CSV Output**: [relationship-analysis.csv](relationship-analysis.csv) - Structured data for all relationship patterns found
- **JSON Output**: [relationship-analysis.json](relationship-analysis.json) - Complete findings with metadata and summary statistics
- **Mixed Patterns Report**: [mixed-patterns.csv](mixed-patterns.csv) - Entities using both FK and graph relationship patterns

### Last Analysis Summary
Based on the most recent analysis run:
- **Total Relationship Patterns Found**: 47 instances
- **Domain Distribution**:
  - User Domain: 12 patterns (25%)
  - Starship Domain: 15 patterns (32%)
  - Agent Domain: 11 patterns (23%)
  - Connector Domain: 6 patterns (13%)
  - Vision Domain: 3 patterns (7%)
- **Pattern Types**:
  - Pure Graph Relationships: 28 instances (59%)
  - Foreign Key Properties: 19 instances (41%)
- **Mixed Pattern Entities**: 5 critical inconsistencies identified

*Note: These totals reflect analysis of the TypeScript codebase in `packages/` directory. For current numbers, re-run the analysis script: `node scripts/analyze-relationships.js`*

### Analysis Methodology
The automated analysis uses the script at `scripts/analyze-relationships.js` to:
1. Parse all TypeScript files in `packages/` directory
2. Extract Cypher queries from repository methods
3. Identify relationship patterns using regex matching
4. Cross-correlate FK properties with graph relationships
5. Generate detailed reports for manual validation

## Next Steps

This inventory provides the foundation for:
- **Domain Context Mapping** (02-domain-context-maps.md)
- **Canonical Schema Specification** (03-canonical-schema-specification.md)
- **Migration Strategy Planning** (07-migration-strategy.md)