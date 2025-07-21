# MCP Server Connector Instance Implementation Plan

## 📊 Implementation Status Tracker

### Phase 1: Database Schema & Migration

- [ ] **1.1** Create MCPServerConnector node type and constraints
- [ ] **1.2** Create migration script with rollback capability
- [ ] **1.3** Test migration on development environment
- [ ] **1.4** Validate data integrity post-migration
- [ ] **1.5** Create backup and recovery procedures

### Phase 2: Backend Implementation

- [ ] **2.1** Update type definitions in models package
- [ ] **2.2** Implement MCPServerConnectorRepository
- [ ] **2.3** Update StarshipRepository methods
- [ ] **2.4** Update Repository Factory integration
- [ ] **2.5** Add server initialization and dependency injection
- [ ] **2.6** Move API endpoints to starships routes
- [ ] **2.7** Implement uniqueness constraints and validation
- [ ] **2.8** Add comprehensive error handling
- [ ] **2.9** Create unit tests for repositories
- [ ] **2.10** Create integration tests for API endpoints

### Phase 3: Frontend Updates

- [ ] **3.1** Update cache keys and invalidation strategy
- [ ] **3.2** Update API client methods
- [ ] **3.3** Update ConnectorSelector component
- [ ] **3.4** Update StarshipCrewContent component
- [ ] **3.5** Add error handling for new scenarios
- [ ] **3.6** Create component unit tests
- [ ] **3.7** Create integration tests for UI flows

### Phase 4: Testing & Validation

- [ ] **4.1** End-to-end testing of connector instance creation
- [ ] **4.2** Multi-starship isolation testing
- [ ] **4.3** Performance impact assessment
- [ ] **4.4** Load testing with multiple concurrent operations
- [ ] **4.5** Error scenario testing and recovery
- [ ] **4.6** UI/UX validation and user acceptance testing

### Phase 5: Deployment & Cleanup

- [ ] **5.1** Deploy to staging environment
- [ ] **5.2** Run migration on staging data
- [ ] **5.3** Validate functionality in staging
- [ ] **5.4** Deploy to production with feature flags
- [ ] **5.5** Monitor system performance and errors
- [ ] **5.6** Remove deprecated methods and endpoints
- [ ] **5.7** Update documentation and API specs
- [ ] **5.8** Conduct post-deployment review

**Overall Progress: 0/38 tasks completed (0%)**

---

## Overview

This plan outlines the implementation of a dedicated connector instance system where each starship creates individual `MCPServerConnector` nodes based on `MCPServerOption` templates, similar to how `AgentTemplate` creates `Agent` instances.

## Current System Analysis

### What Exists

- **MCPServerOption**: Template nodes with command, args, env configuration
- **HAS_CONNECTOR**: Direct relationship between Starship and MCPServerOption
- **UI**: ConnectorSelector component for selecting templates
- **API**: Endpoints for connecting/disconnecting templates to starships
- **Repository Factory**: Centralized singleton pattern for repository management
- **Existing Routes**: MCP server routes in `/mcp-servers.ts`, starship routes in `/starships.ts`
- **Server Initialization**: Direct repository instantiation in `index.ts` (lines 56-68)
- **Cache System**: Client-side caching with pattern-based invalidation

### The Gap

Currently, multiple starships share the same `MCPServerOption` template nodes. We need individual connector instances per starship that:

- Store the relationship between starshipId and templateId
- Have their own lifecycle management
- Allow for future extensibility (status tracking, custom config)
- Maintain data isolation between starships

## Proposed Architecture

### New Entity: MCPServerConnector

```typescript
interface MCPServerConnector {
  id: string; // Unique instance ID
  starshipId: string; // Owner starship
  templateId: string; // Source MCPServerOption ID
  status: 'active' | 'inactive' | 'error' | 'connecting';
  isActive: boolean; // Connection state
  connectedAt: string; // When instance was created/connected
  lastUsed?: string; // Last activity timestamp (optional)
  errorMessage?: string; // Error details if status is 'error' (optional)
  createdAt: string;
  updatedAt: string;
}
```

### New Relationships

```cypher
// Replace current HAS_CONNECTOR relationship
(Starship)-[:HAS_CONNECTOR_INSTANCE]->(MCPServerConnector)
(MCPServerConnector)-[:CREATED_FROM]->(MCPServerOption)
```

## Detailed Implementation Steps

### Phase 1: Database Schema & Migration

#### Task 1.1: Create MCPServerConnector Node Type

**Estimated Time**: 2 hours  
**Dependencies**: None  
**Deliverables**:

- Neo4j schema constraints
- Node property definitions
- Index creation for performance

**Implementation Details**:

```cypher
// Create constraints
CREATE CONSTRAINT connector_instance_id IF NOT EXISTS FOR (c:MCPServerConnector) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT connector_instance_starship_template IF NOT EXISTS FOR (c:MCPServerConnector) REQUIRE (c.starshipId, c.templateId) IS UNIQUE;

// Create indexes for performance
CREATE INDEX connector_instance_starship IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.starshipId);
CREATE INDEX connector_instance_template IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.templateId);
CREATE INDEX connector_instance_status IF NOT EXISTS FOR (c:MCPServerConnector) ON (c.status);
```

**Validation Criteria**:

- [ ] Constraints created successfully
- [ ] Indexes improve query performance by >50%
- [ ] No duplicate instances can be created

#### Task 1.2: Create Migration Script with Rollback

**Estimated Time**: 4 hours  
**Dependencies**: Task 1.1  
**Deliverables**:

- Migration script with transaction support
- Rollback script for emergency recovery
- Data validation queries

**File**: [`packages/models/src/migrations/001-connector-instances.ts`](packages/models/src/migrations/001-connector-instances.ts)

```typescript
import { getConnection } from '../connection';

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errors: string[];
  rollbackData?: any[];
}

export class ConnectorInstanceMigration {
  private connection = getConnection();

  async migrate(): Promise<MigrationResult> {
    const session = this.connection.session();
    const tx = session.beginTransaction();

    try {
      // Store rollback data
      const rollbackData = await this.captureRollbackData(tx);

      // Perform migration
      const result = await tx.run(`
        MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
        CREATE (msc:MCPServerConnector {
          id: randomUUID(),
          starshipId: s.id,
          templateId: mso.id,
          status: 'active',
          isActive: coalesce(r.isActive, true),
          connectedAt: coalesce(r.connectedAt, datetime()),
          createdAt: datetime(),
          updatedAt: datetime()
        })
        CREATE (s)-[:HAS_CONNECTOR_INSTANCE]->(msc)
        CREATE (msc)-[:CREATED_FROM]->(mso)
        DELETE r
        RETURN count(msc) as migratedCount
      `);

      const migratedCount = result.records[0].get('migratedCount').toNumber();

      // Validate migration
      const isValid = await this.validateMigration(tx);
      if (!isValid) {
        throw new Error('Migration validation failed');
      }

      await tx.commit();

      return {
        success: true,
        migratedCount,
        errors: [],
        rollbackData,
      };
    } catch (error) {
      await tx.rollback();
      return {
        success: false,
        migratedCount: 0,
        errors: [error.message],
      };
    } finally {
      await session.close();
    }
  }

  async rollback(rollbackData: any[]): Promise<boolean> {
    // Implementation for emergency rollback
    // Restore original HAS_CONNECTOR relationships
    // Remove MCPServerConnector nodes
  }

  private async validateMigration(tx: any): Promise<boolean> {
    // Validate no orphaned relationships
    // Validate all starships have correct connector instances
    // Validate data integrity
    return true;
  }
}
```

**Validation Criteria**:

- [ ] Migration completes without data loss
- [ ] Rollback restores original state
- [ ] All relationships are properly migrated
- [ ] Performance impact is minimal (<5% degradation)

#### Task 1.3: Test Migration on Development Environment

**Estimated Time**: 3 hours  
**Dependencies**: Task 1.2  
**Deliverables**:

- Migration test results
- Performance benchmarks
- Data integrity validation report

**Test Scenarios**:

1. Empty database migration
2. Database with existing connectors
3. Large dataset migration (1000+ starships)
4. Concurrent access during migration
5. Rollback after partial migration

#### Task 1.4: Validate Data Integrity Post-Migration

**Estimated Time**: 2 hours  
**Dependencies**: Task 1.3  
**Deliverables**:

- Data integrity validation queries
- Automated validation script
- Integrity report template

**Validation Queries**:

```cypher
// Validate no orphaned connector instances
MATCH (msc:MCPServerConnector)
WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
RETURN count(msc) as orphanedConnectors;

// Validate all connector instances have templates
MATCH (msc:MCPServerConnector)
WHERE NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
RETURN count(msc) as connectorsWithoutTemplates;

// Validate uniqueness constraint
MATCH (msc:MCPServerConnector)
WITH msc.starshipId as starshipId, msc.templateId as templateId, count(msc) as instanceCount
WHERE instanceCount > 1
RETURN starshipId, templateId, instanceCount;
```

#### Task 1.5: Create Backup and Recovery Procedures

**Estimated Time**: 2 hours  
**Dependencies**: Task 1.4  
**Deliverables**:

- Automated backup script
- Recovery procedures documentation
- Disaster recovery plan

### Phase 2: Backend Implementation

#### Task 2.1: Update Type Definitions

**Estimated Time**: 1 hour  
**Dependencies**: Phase 1 complete  
**File**: [`packages/models/src/types.ts`](packages/models/src/types.ts)

**Implementation**:

```typescript
// Add after line 329 (after MCPServerOptionRepository interface)

// New MCPServerConnector entity
export interface MCPServerConnector {
  id: string;
  starshipId: string;
  templateId: string;
  status: 'active' | 'inactive' | 'error' | 'connecting';
  isActive: boolean;
  connectedAt: string;
  lastUsed?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// New repository interface
export interface MCPServerConnectorRepository extends Repository<MCPServerConnector> {
  findByStarship(starshipId: string): Promise<MCPServerConnector[]>;
  findByTemplate(templateId: string): Promise<MCPServerConnector[]>;
  createFromTemplate(starshipId: string, templateId: string): Promise<MCPServerConnector>;
  updateStatus(
    id: string,
    status: MCPServerConnector['status'],
    errorMessage?: string
  ): Promise<MCPServerConnector | null>;
  deactivate(id: string): Promise<boolean>;
  activate(id: string): Promise<boolean>;
  findByStarshipAndTemplate(
    starshipId: string,
    templateId: string
  ): Promise<MCPServerConnector | null>;
}

// Update StarshipRepository interface - ADD these methods to existing interface
export interface StarshipRepository {
  // ... existing methods ...

  // NEW: Updated MCP Server Connector methods (replace existing ones)
  getConnectorInstances(starshipId: string): Promise<MCPServerConnector[]>;
  createConnectorInstance(starshipId: string, templateId: string): Promise<MCPServerConnector>;
  removeConnectorInstance(starshipId: string, connectorId: string): Promise<boolean>;
  updateConnectorInstance(
    starshipId: string,
    connectorId: string,
    updates: Partial<MCPServerConnector>
  ): Promise<MCPServerConnector | null>;

  // DEPRECATED: Remove these methods after migration
  // getConnectedMCPServers(starshipId: string): Promise<MCPServerOption[]>
  // connectMCPServer(starshipId: string, mcpServerId: string): Promise<boolean>
  // disconnectMCPServer(starshipId: string, mcpServerId: string): Promise<boolean>
}

// New relationship types
export interface HasConnectorInstanceRelationship {
  type: 'HAS_CONNECTOR_INSTANCE';
  properties?: {
    createdAt?: string;
  };
}

export interface CreatedFromRelationship {
  type: 'CREATED_FROM';
  properties?: {
    createdAt?: string;
  };
}
```

**Validation Criteria**:

- [ ] TypeScript compilation succeeds
- [ ] All interfaces are properly exported
- [ ] No breaking changes to existing types

#### Task 2.2: Implement MCPServerConnectorRepository

**Estimated Time**: 6 hours  
**Dependencies**: Task 2.1  
**File**: [`packages/models/src/repositories/MCPServerConnectorRepository.ts`](packages/models/src/repositories/MCPServerConnectorRepository.ts)

**Implementation**:

```typescript
import { getConnection } from '../connection';
import {
  MCPServerConnector,
  MCPServerConnectorRepository as MCPServerConnectorRepositoryInterface,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

export class MCPServerConnectorRepository implements MCPServerConnectorRepositoryInterface {
  async findAll(): Promise<MCPServerConnector[]> {
    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ msc: MCPServerConnector }>(
        'MATCH (msc:MCPServerConnector) RETURN msc ORDER BY msc.createdAt DESC'
      );
      return result.map((record) => record.msc);
    } catch (error) {
      console.error('[MCPServerConnectorRepository] Error in findAll:', error);
      throw new Error(
        `Failed to retrieve connector instances: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async findById(id: string): Promise<MCPServerConnector | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ msc: MCPServerConnector }>(
        'MATCH (msc:MCPServerConnector) WHERE msc.id = $id RETURN msc',
        { id }
      );
      return result[0]?.msc || null;
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in findById for id ${id}:`, error);
      throw new Error(
        `Failed to retrieve connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async findByStarship(starshipId: string): Promise<MCPServerConnector[]> {
    if (!starshipId) {
      throw new Error('Starship ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ msc: MCPServerConnector }>(
        `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
         RETURN msc ORDER BY msc.createdAt DESC`,
        { starshipId }
      );
      return result.map((record) => record.msc);
    } catch (error) {
      console.error(
        `[MCPServerConnectorRepository] Error in findByStarship for starship ${starshipId}:`,
        error
      );
      throw new Error(
        `Failed to retrieve connector instances for starship: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async findByTemplate(templateId: string): Promise<MCPServerConnector[]> {
    if (!templateId) {
      throw new Error('Template ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ msc: MCPServerConnector }>(
        `MATCH (msc:MCPServerConnector)-[:CREATED_FROM]->(mso:MCPServerOption {id: $templateId})
         RETURN msc ORDER BY msc.createdAt DESC`,
        { templateId }
      );
      return result.map((record) => record.msc);
    } catch (error) {
      console.error(
        `[MCPServerConnectorRepository] Error in findByTemplate for template ${templateId}:`,
        error
      );
      throw new Error(
        `Failed to retrieve connector instances for template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async findByStarshipAndTemplate(
    starshipId: string,
    templateId: string
  ): Promise<MCPServerConnector | null> {
    if (!starshipId || !templateId) {
      throw new Error('Both starship ID and template ID parameters are required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ msc: MCPServerConnector }>(
        `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)-[:CREATED_FROM]->(mso:MCPServerOption {id: $templateId})
         RETURN msc`,
        { starshipId, templateId }
      );
      return result[0]?.msc || null;
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in findByStarshipAndTemplate:`, error);
      throw new Error(
        `Failed to find connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async createFromTemplate(starshipId: string, templateId: string): Promise<MCPServerConnector> {
    if (!starshipId || !templateId) {
      throw new Error('Both starship ID and template ID are required');
    }

    // Check if instance already exists
    const existing = await this.findByStarshipAndTemplate(starshipId, templateId);
    if (existing) {
      throw new Error(
        `Connector instance already exists for template ${templateId} on starship ${starshipId}`
      );
    }

    const connection = getConnection();
    const connectorInstance: MCPServerConnector = {
      id: uuidv4(),
      starshipId,
      templateId,
      status: 'active',
      isActive: true,
      connectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      // Verify starship and template exist
      const validationResult = await connection.executeQuery(
        `MATCH (s:Starship {id: $starshipId}), (mso:MCPServerOption {id: $templateId})
         RETURN count(s) as starshipExists, count(mso) as templateExists`,
        { starshipId, templateId }
      );

      const { starshipExists, templateExists } = validationResult[0];
      if (starshipExists === 0) {
        throw new Error(`Starship with ID ${starshipId} not found`);
      }
      if (templateExists === 0) {
        throw new Error(`MCP Server template with ID ${templateId} not found`);
      }

      // Create connector instance and relationships
      await connection.executeWrite(
        `MATCH (s:Starship {id: $starshipId}), (mso:MCPServerOption {id: $templateId})
         CREATE (msc:MCPServerConnector $props)
         CREATE (s)-[:HAS_CONNECTOR_INSTANCE {createdAt: $timestamp}]->(msc)
         CREATE (msc)-[:CREATED_FROM {createdAt: $timestamp}]->(mso)
         RETURN msc`,
        {
          starshipId,
          templateId,
          props: connectorInstance,
          timestamp: connectorInstance.createdAt,
        }
      );

      console.log(
        `[MCPServerConnectorRepository] Created connector instance: ${connectorInstance.id} for starship ${starshipId}`
      );
      return connectorInstance;
    } catch (error) {
      console.error('[MCPServerConnectorRepository] Error in createFromTemplate:', error);
      throw new Error(
        `Failed to create connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async create(entity: Omit<MCPServerConnector, 'id' | 'createdAt'>): Promise<MCPServerConnector> {
    const connectorInstance: MCPServerConnector = {
      ...entity,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const connection = getConnection();
    try {
      await connection.executeWrite('CREATE (msc:MCPServerConnector $props) RETURN msc', {
        props: connectorInstance,
      });
      return connectorInstance;
    } catch (error) {
      console.error('[MCPServerConnectorRepository] Error in create:', error);
      throw new Error(
        `Failed to create connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async update(
    id: string,
    updates: Partial<MCPServerConnector>
  ): Promise<MCPServerConnector | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const connection = getConnection();
    try {
      const result = await connection.executeWrite<{ msc: MCPServerConnector }>(
        'MATCH (msc:MCPServerConnector) WHERE msc.id = $id SET msc += $updates RETURN msc',
        { id, updates: updateProps }
      );
      return result[0]?.msc || null;
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in update for id ${id}:`, error);
      throw new Error(
        `Failed to update connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async updateStatus(
    id: string,
    status: MCPServerConnector['status'],
    errorMessage?: string
  ): Promise<MCPServerConnector | null> {
    const updates: Partial<MCPServerConnector> = {
      status,
      isActive: status === 'active',
      updatedAt: new Date().toISOString(),
    };

    if (errorMessage !== undefined) {
      updates.errorMessage = errorMessage;
    }

    return this.update(id, updates);
  }

  async activate(id: string): Promise<boolean> {
    const result = await this.updateStatus(id, 'active');
    return result !== null;
  }

  async deactivate(id: string): Promise<boolean> {
    const result = await this.updateStatus(id, 'inactive');
    return result !== null;
  }

  async delete(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (msc:MCPServerConnector) WHERE msc.id = $id DETACH DELETE msc RETURN count(msc) as deletedCount',
        { id }
      );
      return result[0]?.deletedCount > 0;
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in delete for id ${id}:`, error);
      throw new Error(
        `Failed to delete connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
```

**Validation Criteria**:

- [ ] All repository methods work correctly
- [ ] Proper error handling and logging
- [ ] Uniqueness constraints are enforced
- [ ] Performance is acceptable (<100ms for single operations)

#### Task 2.3: Update StarshipRepository Methods

**Estimated Time**: 4 hours  
**Dependencies**: Task 2.2  
**File**: [`packages/models/src/repositories/StarshipRepository.ts`](packages/models/src/repositories/StarshipRepository.ts)

**Implementation**: Replace existing MCP server methods (lines 257-435) with:

```typescript
// NEW: MCP Server Connector Instance Methods

async getConnectorInstances(starshipId: string): Promise<MCPServerConnector[]> {
  if (!starshipId) {
    throw new Error('Starship ID parameter is required');
  }

  const connection = getConnection();
  try {
    console.log(`[StarshipRepository] Getting connector instances for starship: ${starshipId}`);

    const result = await connection.executeQuery<{ msc: MCPServerConnector }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
       WHERE msc.isActive = true
       RETURN msc
       ORDER BY msc.connectedAt DESC`,
      { starshipId }
    );

    const connectorInstances = result.map(record => record.msc);

    console.log(`[StarshipRepository] Found ${connectorInstances.length} connector instances for starship: ${starshipId}`);
    return connectorInstances;
  } catch (error) {
    console.error(`[StarshipRepository] Error getting connector instances for starship ${starshipId}:`, error);
    throw new Error(`Failed to retrieve connector instances: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async createConnectorInstance(starshipId: string, templateId: string): Promise<MCPServerConnector> {
  if (!starshipId) {
    throw new Error('Starship ID parameter is required');
  }
  if (!templateId) {
    throw new Error('Template ID parameter is required');
  }

  // Use the MCPServerConnectorRepository for the actual creation
  const mcpConnectorRepo = new (await import('./MCPServerConnectorRepository')).MCPServerConnectorRepository();

  try {
    console.log(`[StarshipRepository] Creating connector instance for starship ${starshipId} with template ${templateId}`);

    const connectorInstance = await mcpConnectorRepo.createFromTemplate(starshipId, templateId);

    console.log(`[StarshipRepository] Successfully created connector instance: ${connectorInstance.id}`);
    return connectorInstance;
  } catch (error) {
    console.error(`[StarshipRepository] Error creating connector instance:`, error);
    throw error; // Re-throw to preserve original error message
  }
}

async removeConnectorInstance(starshipId: string, connectorId: string): Promise<boolean> {
  if (!starshipId) {
    throw new Error('Starship ID parameter is required');
  }
  if (!connectorId) {
    throw new Error('Connector ID parameter is required');
  }

  const connection = getConnection();
  try {
    console.log(`[StarshipRepository] Removing connector instance ${connectorId} from starship ${starshipId}`);

    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector {id: $connectorId})
       DETACH DELETE msc
       RETURN count(msc) as deletedCount`,
      { starshipId, connectorId }
    );

    const deletedCount = result[0]?.deletedCount || 0;
    const success = deletedCount > 0;

    if (success) {
      console.log(`[StarshipRepository] Successfully removed connector instance ${connectorId} from starship ${starshipId}`);
    } else {
      console.log(`[StarshipRepository] No connector instance found with ID ${connectorId} for starship ${starshipId}`);
    }

    return success;
  } catch (error) {
    console.error(`[StarshipRepository] Error removing connector instance ${connectorId} from starship ${starshipId}:`, error);
    throw new Error(`Failed to remove connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async updateConnectorInstance(starshipId: string, connectorId: string, updates: Partial<MCPServerConnector>): Promise<MCPServerConnector | null> {
  if (!starshipId) {
    throw new Error('Starship ID parameter is required');
  }
  if (!connectorId) {
    throw new Error('Connector ID parameter is required');
  }

  const connection = getConnection();
  try {
    console.log(`[StarshipRepository] Updating connector instance ${connectorId} for starship ${starshipId}`);

    // Verify the connector belongs to the starship
    const verificationResult = await connection.executeQuery(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector {id: $connectorId})
       RETURN count(msc) as connectorExists`,
      { starshipId, connectorId }
    );

    if (verificationResult[0]?.connectorExists === 0) {
      throw new Error(`Connector instance ${connectorId} not found for starship ${starshipId}`);
    }

    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const result = await connection.executeWrite<{ msc: MCPServerConnector }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector {id: $connectorId})
       SET msc += $updates
       RETURN msc`,
      { starshipId, connectorId, updates: updateProps }
    );

    const updatedConnector = result[0]?.msc || null;
    if (updatedConnector) {
      console.log(`[StarshipRepository] Successfully updated connector instance ${connectorId}`);
    }

    return updatedConnector;
  } catch (error) {
    console.error(`[StarshipRepository] Error updating connector instance ${connectorId} for starship ${starshipId}:`, error);
    throw new Error(`Failed to update connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// DEPRECATED: Keep these methods for backward compatibility during migration
// TODO: Remove after Phase 5 cleanup
async getConnectedMCPServers(starshipId: string): Promise<MCPServerOption[]> {
  console.warn('[StarshipRepository] getConnectedMCPServers is deprecated. Use getConnectorInstances instead.');

  // For backward compatibility, return template data
  const connectorInstances = await this.getConnectorInstances(starshipId);
  const connection = getConnection();

  const templateIds = connectorInstances.map(instance => instance.templateId);
  if (templateIds.length === 0) {
    return [];
  }

  const result = await connection.executeQuery<{ mso: MCPServerOption }>(
    'MATCH (mso:MCPServerOption) WHERE mso.id IN $templateIds RETURN mso',
    { templateIds }
  );

  return result.map(record => record.mso);
}

async connectMCPServer(
```
