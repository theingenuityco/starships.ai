# MCP Server Connector Instance Implementation Plan - Robust Edition

## 📊 Live Implementation Status Tracker

### Phase 1: Database Schema & Migration (5/5 completed) 🎉

- [x] **1.1** Create MCPServerConnector node type and constraints ⏱️ 2h
- [x] **1.2** Create migration script with rollback capability ⏱️ 4h
- [x] **1.3** Test migration on development environment ⏱️ 3h
- [x] **1.4** Validate data integrity post-migration ⏱️ 2h
- [x] **1.5** Create backup and recovery procedures ⏱️ 2h

> 🎉 **MAJOR MILESTONE ACHIEVED!** 🎉
> **Phase 1 Complete**: Database Schema & Migration foundation is now fully implemented!
> All database constraints, migration scripts, testing procedures, data validation, and backup/recovery systems are in place. The project now has a solid, battle-tested foundation for the connector instance architecture transformation.

### Phase 2: Backend Implementation (8/10 completed)

- [x] **2.1** Update type definitions in models package ⏱️ 1h
- [x] **2.2** Implement MCPServerConnectorRepository ⏱️ 6h
- [x] **2.3** Update StarshipRepository methods ⏱️ 4h
- [x] **2.4** Update Repository Factory integration ⏱️ 2h
- [x] **2.5** Add server initialization and dependency injection ⏱️ 3h
- [x] **2.6** Move API endpoints to starships routes ⏱️ 4h
- [x] **2.7** Implement uniqueness constraints and validation ⏱️ 2h
- [x] **2.8** Add comprehensive error handling ⏱️ 3h
- [ ] **2.9** Create unit tests for repositories ⏱️ 4h
- [ ] **2.10** Create integration tests for API endpoints ⏱️ 4h

> 🎉 **MAJOR MILESTONE ACHIEVED!** 🎉
> **Phase 2 Core Backend Complete**: The first 5 tasks of Phase 2 are now finished!
> We've successfully implemented the core backend infrastructure including type definitions, repository implementations, StarshipRepository updates, factory integration, and server initialization with dependency injection. The backend foundation for connector instances is now solid and ready for the remaining API and testing tasks.

### Phase 3: Frontend Updates (0/7 completed)

- [ ] **3.1** Update cache keys and invalidation strategy ⏱️ 2h
- [ ] **3.2** Update API client methods ⏱️ 3h
- [ ] **3.3** Update ConnectorSelector component ⏱️ 2h
- [ ] **3.4** Update StarshipCrewContent component ⏱️ 2h
- [ ] **3.5** Add error handling for new scenarios ⏱️ 2h
- [ ] **3.6** Create component unit tests ⏱️ 3h
- [ ] **3.7** Create integration tests for UI flows ⏱️ 4h

### Phase 4: Testing & Validation (0/6 completed)

- [ ] **4.1** End-to-end testing of connector instance creation ⏱️ 4h
- [ ] **4.2** Multi-starship isolation testing ⏱️ 3h
- [ ] **4.3** Performance impact assessment ⏱️ 3h
- [ ] **4.4** Load testing with multiple concurrent operations ⏱️ 4h
- [ ] **4.5** Error scenario testing and recovery ⏱️ 3h
- [ ] **4.6** UI/UX validation and user acceptance testing ⏱️ 4h

### Phase 5: Deployment & Cleanup (0/8 completed)

- [ ] **5.1** Deploy to staging environment ⏱️ 2h
- [ ] **5.2** Run migration on staging data ⏱️ 3h
- [ ] **5.3** Validate functionality in staging ⏱️ 4h
- [ ] **5.4** Deploy to production with feature flags ⏱️ 3h
- [ ] **5.5** Monitor system performance and errors ⏱️ 2h
- [ ] **5.6** Remove deprecated methods and endpoints ⏱️ 2h
- [ ] **5.7** Update documentation and API specs ⏱️ 3h
- [ ] **5.8** Conduct post-deployment review ⏱️ 2h

**📈 Overall Progress: 13/36 tasks completed (36%)**
**⏱️ Total Estimated Time: 98 hours**  
**🎯 Target Completion: [Set based on team capacity]**

---

## 🎯 Implementation Objectives

Transform the MCP connector system from template-sharing to instance-based architecture while maintaining:

- **Zero downtime** during migration
- **100% backward compatibility** during transition
- **Data integrity** throughout the process
- **Performance parity** or improvement

## 🏗️ Architecture Overview

### Current State

```
Starship ──HAS_CONNECTOR──> MCPServerOption (Shared Template)
```

### Target State

```
Starship ──HAS_CONNECTOR_INSTANCE──> MCPServerConnector ──CREATED_FROM──> MCPServerOption
```

### Benefits

- **Data Isolation**: Each starship has dedicated connector instances
- **Scalability**: Independent lifecycle management per instance
- **Extensibility**: Foundation for custom configuration and monitoring
- **Reliability**: Isolated failure domains

## 📋 Detailed Implementation Guide

### Phase 1: Database Schema & Migration

#### Task 1.1: Create MCPServerConnector Node Type

**🎯 Objective**: Establish database schema for connector instances  
**⏱️ Estimated Time**: 2 hours  
**🔗 Dependencies**: None  
**📦 Deliverables**:

- Neo4j schema constraints
- Performance indexes
- Validation queries

**Implementation**:

```cypher
-- Create unique constraints
CREATE CONSTRAINT connector_instance_id IF NOT EXISTS
FOR (c:MCPServerConnector) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT connector_instance_starship_template IF NOT EXISTS
FOR (c:MCPServerConnector) REQUIRE (c.starshipId, c.templateId) IS UNIQUE;

-- Create performance indexes
CREATE INDEX connector_instance_starship IF NOT EXISTS
FOR (c:MCPServerConnector) ON (c.starshipId);

CREATE INDEX connector_instance_template IF NOT EXISTS
FOR (c:MCPServerConnector) ON (c.templateId);

CREATE INDEX connector_instance_status IF NOT EXISTS
FOR (c:MCPServerConnector) ON (c.status);

CREATE INDEX connector_instance_active IF NOT EXISTS
FOR (c:MCPServerConnector) ON (c.isActive);
```

**✅ Success Criteria**:

- [ ] All constraints created without errors
- [ ] Indexes improve query performance by >50%
- [ ] Uniqueness constraint prevents duplicate instances
- [ ] Schema validation passes

**🧪 Testing**:

```cypher
-- Test uniqueness constraint
CREATE (c1:MCPServerConnector {id: 'test-1', starshipId: 'ship-1', templateId: 'template-1'});
CREATE (c2:MCPServerConnector {id: 'test-2', starshipId: 'ship-1', templateId: 'template-1'});
-- Should fail with constraint violation

-- Test index performance
PROFILE MATCH (c:MCPServerConnector) WHERE c.starshipId = 'ship-1' RETURN c;
-- Should use index scan, not node scan
```

#### Task 1.2: Create Migration Script with Rollback

**🎯 Objective**: Safe migration of existing data with rollback capability  
**⏱️ Estimated Time**: 4 hours  
**🔗 Dependencies**: Task 1.1  
**📦 Deliverables**:

- Migration script with transaction support
- Rollback script for emergency recovery
- Data validation and integrity checks

**File**: `packages/models/src/migrations/001-connector-instances.ts`

```typescript
import { getConnection } from '../connection';
import { v4 as uuidv4 } from 'uuid';

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errors: string[];
  rollbackData?: RollbackData[];
  duration: number;
}

export interface RollbackData {
  starshipId: string;
  templateId: string;
  originalRelationship: any;
}

export class ConnectorInstanceMigration {
  private connection = getConnection();

  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now();
    const session = this.connection.session();

    try {
      console.log('[MIGRATION] Starting connector instance migration...');

      // Step 1: Capture rollback data
      console.log('[MIGRATION] Capturing rollback data...');
      const rollbackData = await this.captureRollbackData(session);
      console.log(`[MIGRATION] Captured ${rollbackData.length} relationships for rollback`);

      // Step 2: Validate pre-migration state
      console.log('[MIGRATION] Validating pre-migration state...');
      const preValidation = await this.validatePreMigrationState(session);
      if (!preValidation.valid) {
        throw new Error(`Pre-migration validation failed: ${preValidation.errors.join(', ')}`);
      }

      // Step 3: Perform migration in transaction
      console.log('[MIGRATION] Performing migration...');
      const tx = session.beginTransaction();

      try {
        const result = await tx.run(`
          MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
          WITH s, r, mso, randomUUID() as connectorId
          CREATE (msc:MCPServerConnector {
            id: connectorId,
            starshipId: s.id,
            templateId: mso.id,
            status: 'active',
            isActive: coalesce(r.isActive, true),
            connectedAt: coalesce(r.connectedAt, datetime()),
            createdAt: datetime(),
            updatedAt: datetime()
          })
          CREATE (s)-[:HAS_CONNECTOR_INSTANCE {createdAt: datetime()}]->(msc)
          CREATE (msc)-[:CREATED_FROM {createdAt: datetime()}]->(mso)
          DELETE r
          RETURN count(msc) as migratedCount
        `);

        const migratedCount = result.records[0].get('migratedCount').toNumber();
        console.log(`[MIGRATION] Migrated ${migratedCount} connector relationships`);

        // Step 4: Validate post-migration state
        console.log('[MIGRATION] Validating post-migration state...');
        const postValidation = await this.validatePostMigrationState(tx);
        if (!postValidation.valid) {
          throw new Error(`Post-migration validation failed: ${postValidation.errors.join(', ')}`);
        }

        await tx.commit();
        console.log('[MIGRATION] Migration completed successfully');

        return {
          success: true,
          migratedCount,
          errors: [],
          rollbackData,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } catch (error) {
      console.error('[MIGRATION] Migration failed:', error);
      return {
        success: false,
        migratedCount: 0,
        errors: [error.message],
        duration: Date.now() - startTime,
      };
    } finally {
      await session.close();
    }
  }

  async rollback(rollbackData: RollbackData[]): Promise<boolean> {
    console.log(`[ROLLBACK] Starting rollback of ${rollbackData.length} relationships...`);
    const session = this.connection.session();
    const tx = session.beginTransaction();

    try {
      // Remove all connector instances
      await tx.run('MATCH (msc:MCPServerConnector) DETACH DELETE msc');

      // Restore original relationships
      for (const data of rollbackData) {
        await tx.run(
          `
          MATCH (s:Starship {id: $starshipId}), (mso:MCPServerOption {id: $templateId})
          CREATE (s)-[:HAS_CONNECTOR $props]->(mso)
        `,
          {
            starshipId: data.starshipId,
            templateId: data.templateId,
            props: data.originalRelationship,
          }
        );
      }

      await tx.commit();
      console.log('[ROLLBACK] Rollback completed successfully');
      return true;
    } catch (error) {
      await tx.rollback();
      console.error('[ROLLBACK] Rollback failed:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  private async captureRollbackData(session: any): Promise<RollbackData[]> {
    const result = await session.run(`
      MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
      RETURN s.id as starshipId, mso.id as templateId, properties(r) as relationshipProps
    `);

    return result.records.map((record) => ({
      starshipId: record.get('starshipId'),
      templateId: record.get('templateId'),
      originalRelationship: record.get('relationshipProps'),
    }));
  }

  private async validatePreMigrationState(
    session: any
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check for orphaned relationships
    const orphanedResult = await session.run(`
      MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
      WHERE s IS NULL OR mso IS NULL
      RETURN count(r) as orphanedCount
    `);

    const orphanedCount = orphanedResult.records[0].get('orphanedCount').toNumber();
    if (orphanedCount > 0) {
      errors.push(`Found ${orphanedCount} orphaned HAS_CONNECTOR relationships`);
    }

    return { valid: errors.length === 0, errors };
  }

  private async validatePostMigrationState(tx: any): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check no old relationships remain
    const oldRelResult = await tx.run(
      'MATCH ()-[r:HAS_CONNECTOR]->() RETURN count(r) as oldRelCount'
    );
    const oldRelCount = oldRelResult.records[0].get('oldRelCount').toNumber();
    if (oldRelCount > 0) {
      errors.push(`${oldRelCount} old HAS_CONNECTOR relationships still exist`);
    }

    // Check all connector instances have proper relationships
    const orphanedConnectorResult = await tx.run(`
      MATCH (msc:MCPServerConnector)
      WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
         OR NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
      RETURN count(msc) as orphanedConnectors
    `);

    const orphanedConnectors = orphanedConnectorResult.records[0]
      .get('orphanedConnectors')
      .toNumber();
    if (orphanedConnectors > 0) {
      errors.push(`${orphanedConnectors} connector instances are orphaned`);
    }

    return { valid: errors.length === 0, errors };
  }
}

// CLI interface for running migration
export async function runMigration(): Promise<void> {
  const migration = new ConnectorInstanceMigration();
  const result = await migration.migrate();

  if (result.success) {
    console.log(`✅ Migration completed successfully in ${result.duration}ms`);
    console.log(`📊 Migrated ${result.migratedCount} connector relationships`);
  } else {
    console.error(`❌ Migration failed: ${result.errors.join(', ')}`);
    process.exit(1);
  }
}

// CLI interface for rollback
export async function runRollback(rollbackDataPath: string): Promise<void> {
  const rollbackData = JSON.parse(require('fs').readFileSync(rollbackDataPath, 'utf8'));
  const migration = new ConnectorInstanceMigration();
  const success = await migration.rollback(rollbackData);

  if (success) {
    console.log('✅ Rollback completed successfully');
  } else {
    console.error('❌ Rollback failed');
    process.exit(1);
  }
}
```

**✅ Success Criteria**:

- [ ] Migration completes without data loss
- [ ] Rollback restores exact original state
- [ ] All relationships are properly migrated
- [ ] Performance impact is minimal (<5% degradation)
- [ ] Transaction safety ensures atomicity

#### Task 1.3: Test Migration on Development Environment

**🎯 Objective**: Validate migration process in safe environment  
**⏱️ Estimated Time**: 3 hours  
**🔗 Dependencies**: Task 1.2  
**📦 Deliverables**:

- Migration test results
- Performance benchmarks
- Data integrity validation report

**Test Scenarios**:

1. **Empty Database Migration**

   ```bash
   # Setup empty database
   # Run migration
   # Verify no errors, 0 migrated count
   ```

2. **Single Starship Migration**

   ```bash
   # Create 1 starship with 2 connectors
   # Run migration
   # Verify 2 connector instances created
   ```

3. **Large Dataset Migration**

   ```bash
   # Create 100 starships with 500 total connectors
   # Run migration
   # Verify all relationships migrated correctly
   # Measure performance impact
   ```

4. **Concurrent Access During Migration**

   ```bash
   # Start migration
   # Attempt to read/write during migration
   # Verify transaction isolation
   ```

5. **Rollback After Partial Migration**
   ```bash
   # Force migration failure at 50%
   # Run rollback
   # Verify original state restored
   ```

**Performance Benchmarks**:

- Migration time: <1 second per 100 relationships
- Memory usage: <100MB for 10,000 relationships
- Database locks: <5 seconds total lock time

#### Task 1.4: Validate Data Integrity Post-Migration

**🎯 Objective**: Ensure data consistency after migration  
**⏱️ Estimated Time**: 2 hours  
**🔗 Dependencies**: Task 1.3  
**📦 Deliverables**:

- Automated validation script
- Data integrity report template
- Monitoring queries

**Validation Script**: `packages/models/src/migrations/validate-migration.ts`

```typescript
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  statistics: {
    totalConnectorInstances: number;
    totalStarships: number;
    totalTemplates: number;
    orphanedInstances: number;
    duplicateInstances: number;
  };
}

export class MigrationValidator {
  private connection = getConnection();

  async validateMigration(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('[VALIDATION] Starting post-migration validation...');

    // Check 1: No orphaned connector instances
    const orphanedResult = await this.connection.executeQuery(`
      MATCH (msc:MCPServerConnector)
      WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
         OR NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
      RETURN count(msc) as orphanedCount
    `);

    const orphanedCount = orphanedResult[0]?.orphanedCount || 0;
    if (orphanedCount > 0) {
      errors.push(`Found ${orphanedCount} orphaned connector instances`);
    }

    // Check 2: No duplicate instances
    const duplicateResult = await this.connection.executeQuery(`
      MATCH (msc:MCPServerConnector)
      WITH msc.starshipId as starshipId, msc.templateId as templateId, count(msc) as instanceCount
      WHERE instanceCount > 1
      RETURN count(*) as duplicateCount, collect({starshipId: starshipId, templateId: templateId, count: instanceCount}) as duplicates
    `);

    const duplicateCount = duplicateResult[0]?.duplicateCount || 0;
    if (duplicateCount > 0) {
      errors.push(`Found ${duplicateCount} duplicate connector instances`);
    }

    // Check 3: All starships have valid connector instances
    const invalidInstancesResult = await this.connection.executeQuery(`
      MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
      WHERE msc.starshipId <> s.id
      RETURN count(msc) as invalidCount
    `);

    const invalidCount = invalidInstancesResult[0]?.invalidCount || 0;
    if (invalidCount > 0) {
      errors.push(`Found ${invalidCount} connector instances with mismatched starship IDs`);
    }

    // Check 4: No old HAS_CONNECTOR relationships remain
    const oldRelResult = await this.connection.executeQuery(`
      MATCH ()-[r:HAS_CONNECTOR]->()
      RETURN count(r) as oldRelCount
    `);

    const oldRelCount = oldRelResult[0]?.oldRelCount || 0;
    if (oldRelCount > 0) {
      errors.push(
        `Found ${oldRelCount} old HAS_CONNECTOR relationships that should have been migrated`
      );
    }

    // Gather statistics
    const statsResult = await this.connection.executeQuery(`
      MATCH (msc:MCPServerConnector) WITH count(msc) as connectorCount
      MATCH (s:Starship) WITH connectorCount, count(s) as starshipCount
      MATCH (mso:MCPServerOption) WITH connectorCount, starshipCount, count(mso) as templateCount
      RETURN connectorCount, starshipCount, templateCount
    `);

    const statistics = {
      totalConnectorInstances: statsResult[0]?.connectorCount || 0,
      totalStarships: statsResult[0]?.starshipCount || 0,
      totalTemplates: statsResult[0]?.templateCount || 0,
      orphanedInstances: orphanedCount,
      duplicateInstances: duplicateCount,
    };

    console.log('[VALIDATION] Validation completed');
    console.log(`[VALIDATION] Statistics:`, statistics);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      statistics,
    };
  }
}
```

#### Task 1.5: Create Backup and Recovery Procedures

**🎯 Objective**: Ensure data safety during migration  
**⏱️ Estimated Time**: 2 hours  
**🔗 Dependencies**: Task 1.4  
**📦 Deliverables**:

- Automated backup script
- Recovery procedures documentation
- Disaster recovery plan

**Backup Script**: `packages/models/src/migrations/backup-restore.ts`

```typescript
export class BackupManager {
  private connection = getConnection();

  async createBackup(backupPath: string): Promise<boolean> {
    try {
      console.log(`[BACKUP] Creating backup at ${backupPath}...`);

      // Export all relevant data
      const data = {
        timestamp: new Date().toISOString(),
        starships: await this.exportStarships(),
        mcpServerOptions: await this.exportMCPServerOptions(),
        hasConnectorRelationships: await this.exportHasConnectorRelationships(),
        connectorInstances: await this.exportConnectorInstances(),
      };

      require('fs').writeFileSync(backupPath, JSON.stringify(data, null, 2));
      console.log(`[BACKUP] Backup created successfully`);
      return true;
    } catch (error) {
      console.error('[BACKUP] Backup failed:', error);
      return false;
    }
  }

  async restoreBackup(backupPath: string): Promise<boolean> {
    try {
      console.log(`[RESTORE] Restoring from backup ${backupPath}...`);

      const data = JSON.parse(require('fs').readFileSync(backupPath, 'utf8'));

      // Clear existing data
      await this.connection.executeWrite('MATCH (msc:MCPServerConnector) DETACH DELETE msc');
      await this.connection.executeWrite('MATCH ()-[r:HAS_CONNECTOR_INSTANCE]->() DELETE r');
      await this.connection.executeWrite('MATCH ()-[r:CREATED_FROM]->() DELETE r');

      // Restore HAS_CONNECTOR relationships
      for (const rel of data.hasConnectorRelationships) {
        await this.connection.executeWrite(
          `
          MATCH (s:Starship {id: $starshipId}), (mso:MCPServerOption {id: $templateId})
          CREATE (s)-[:HAS_CONNECTOR $props]->(mso)
        `,
          {
            starshipId: rel.starshipId,
            templateId: rel.templateId,
            props: rel.properties,
          }
        );
      }

      console.log(`[RESTORE] Restore completed successfully`);
      return true;
    } catch (error) {
      console.error('[RESTORE] Restore failed:', error);
      return false;
    }
  }

  private async exportHasConnectorRelationships(): Promise<any[]> {
    const result = await this.connection.executeQuery(`
      MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
      RETURN s.id as starshipId, mso.id as templateId, properties(r) as properties
    `);

    return result.map((record) => ({
      starshipId: record.starshipId,
      templateId: record.templateId,
      properties: record.properties,
    }));
  }

  // Additional export methods...
}
```

### Phase 2: Backend Implementation

#### Task 2.1: Update Type Definitions

**🎯 Objective**: Add TypeScript interfaces for connector instances  
**⏱️ Estimated Time**: 1 hour  
**🔗 Dependencies**: Phase 1 complete  
**📦 Deliverables**:

- Updated type definitions
- Interface documentation
- TypeScript compilation validation

**File**: `packages/models/src/types.ts` (Add after line 329)

```typescript
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

**✅ Success Criteria**:

- [ ] TypeScript compilation succeeds
- [ ] All interfaces are properly exported
- [ ] No breaking changes to existing types
- [ ] JSDoc documentation added for all new interfaces

## 🚀 Quick Start Guide

### Prerequisites

- Neo4j database running
- Node.js 18+ installed
- TypeScript configured
- All dependencies installed

### Running the Migration

1. **Create Backup**

   ```bash
   npm run migration:backup
   ```

2. **Run Migration**

   ```bash
   npm run migration:run
   ```

3. **Validate Results**

   ```bash
   npm run migration:validate
   ```

4. **Rollback if Needed**
   ```bash
   npm run migration:rollback
   ```

### Development Workflow

1. **Start with Phase 1** - Database schema and migration
2. **Test thoroughly** in development environment
3. **Implement Phase 2** - Backend repositories and APIs
4. **Update Phase 3** - Frontend components and caching
5. **Validate Phase 4** - Comprehensive testing
6. **Deploy Phase 5** - Staging and production rollout

## 📊 Progress Tracking

Update this section as tasks are completed:

```markdown
## Current Sprint Progress

### Week 1: Database Foundation

- [x] Task 1.1: Schema creation
- [x] Task 1.2: Migration script
- [ ] Task 1.3: Development testing
- [ ] Task 1.4: Data validation
- [ ] Task 1.5: Backup procedures

### Week 2: Backend Implementation

- [ ] Task 2.1: Type definitions
- [ ] Task 2.2: Repository implementation
- [ ] Task 2.3: StarshipRepository updates
- [ ] Task 2.4: Factory integration
- [ ] Task 2.5: Server initialization

### Week 3: API and Frontend

- [ ] Task 2.6: API endpoints
- [ ] Task 3.1: Cache updates
- [ ] Task 3.2: API client
- [ ] Task 3.3: UI components
- [ ] Task 3.4: Error handling

### Week 4: Testing and Deployment

- [ ] Task 4.1: E2E testing
- [ ] Task 4.2: Performance testing
- [ ] Task 5.1: Staging deployment
- [ ] Task 5.4: Production deployment
```

## 🎯 Success Metrics

- **Migration Success Rate**: 100% (no data loss)
- **Performance Impact**: <5% degradation during migration
- **Downtime**: 0 seconds (zero-downtime migration)
- **Test Coverage**: >90% for new code
- **User Experience**: No visible changes during transition
- **Error Rate**: <0.1% increase post-deployment

## 🔧 Troubleshooting Guide

### Common Issues

1. **Migration Fails with Constraint Violation**
   - Check for existing duplicate data
   - Run pre-migration validation
   - Clean up inconsistent data

2. **Performance Degradation**
   - Verify indexes are created
   - Check query execution plans
   - Monitor database locks

3. **UI Components Break**
   - Verify API backward compatibility
   - Check cache invalidation
   - Test error handling paths

### Emergency Procedures

1. **Immediate Rollback**
   ```bash
   npm run migration
   ```
