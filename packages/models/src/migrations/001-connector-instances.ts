import { getConnection } from '../connection';
import { Session, ManagedTransaction } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { MigrationValidator, ValidationResult as NewValidationResult } from './validate-migration';
import { BackupManager } from './backup-restore';

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errors: string[];
  rollbackData?: RollbackData[];
  duration: number;
  statistics: {
    totalStarships: number;
    totalTemplates: number;
    totalRelationships: number;
    createdConnectorInstances: number;
  };
}

export interface RollbackData {
  starshipId: string;
  templateId: string;
  originalRelationship: {
    connectedAt?: string;
    isActive?: boolean;
    [key: string]: any;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  statistics?: {
    totalConnectorInstances: number;
    totalStarships: number;
    totalTemplates: number;
    orphanedInstances: number;
    duplicateInstances: number;
    oldRelationships: number;
  };
}

/**
 * Migration class for transforming MCP connector architecture from template-sharing to instance-based
 *
 * Transforms:
 * Starship ──HAS_CONNECTOR──> MCPServerOption (Shared Template)
 *
 * To:
 * Starship ──HAS_CONNECTOR_INSTANCE──> MCPServerConnector ──CREATED_FROM──> MCPServerOption
 */
export class ConnectorInstanceMigration {
  private connection = getConnection();

  /**
   * Execute the complete migration with transaction safety and rollback capability
   */
  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now();
    let session: Session | null = null;

    try {
      console.log('[MIGRATION] 🚀 Starting connector instance migration...');
      console.log('[MIGRATION] 📊 Initializing database connection...');

      session = this.connection.getSession();

      // Step 1: Create comprehensive pre-migration backup
      console.log('[MIGRATION] 💾 Creating comprehensive pre-migration backup...');
      const backupManager = new BackupManager();
      const preBackupPath = backupManager.generateBackupPath('pre-migration');
      await backupManager.createBackup(preBackupPath);
      console.log(`[MIGRATION] ✅ Pre-migration backup saved to: ${preBackupPath}`);

      // Step 2: Capture rollback data before any changes (legacy format for compatibility)
      console.log('[MIGRATION] 💾 Capturing rollback data...');
      const rollbackData = await this.captureRollbackData(session);
      console.log(`[MIGRATION] ✅ Captured ${rollbackData.length} relationships for rollback`);

      // Step 3: Validate pre-migration state
      console.log('[MIGRATION] 🔍 Validating pre-migration state...');
      const preValidation = await this.validatePreMigrationState(session);
      if (!preValidation.valid) {
        throw new Error(`Pre-migration validation failed: ${preValidation.errors.join(', ')}`);
      }
      console.log('[MIGRATION] ✅ Pre-migration validation passed');

      // Step 4: Perform migration in transaction
      console.log('[MIGRATION] 🔄 Performing migration in transaction...');
      const migrationResult = await this.performMigrationTransaction(session);

      // Step 5: Validate post-migration state using comprehensive validator
      console.log('[MIGRATION] 🔍 Running comprehensive post-migration validation...');
      const validator = new MigrationValidator();
      const postValidation = await validator.validateMigration();

      if (!postValidation.valid) {
        console.error('[MIGRATION] ❌ Comprehensive validation failed:');
        postValidation.errors.forEach((error, index) => {
          console.error(`   ${index + 1}. ${error}`);
        });
        throw new Error(`Post-migration validation failed: ${postValidation.errors.join(', ')}`);
      }

      if (postValidation.warnings.length > 0) {
        console.warn('[MIGRATION] ⚠️  Validation warnings:');
        postValidation.warnings.forEach((warning, index) => {
          console.warn(`   ${index + 1}. ${warning}`);
        });
      }

      console.log('[MIGRATION] ✅ Comprehensive post-migration validation passed');
      console.log('[MIGRATION] 📊 Validation statistics:', postValidation.statistics);

      // Step 6: Create post-migration backup for verification
      console.log('[MIGRATION] 💾 Creating post-migration backup...');
      const postBackupPath = backupManager.generateBackupPath('post-migration');
      await backupManager.createBackup(postBackupPath);
      console.log(`[MIGRATION] ✅ Post-migration backup saved to: ${postBackupPath}`);

      // Step 7: Save rollback data to file (legacy format for compatibility)
      const rollbackPath = await this.saveRollbackData(rollbackData);
      console.log(`[MIGRATION] 💾 Rollback data saved to: ${rollbackPath}`);

      const duration = Date.now() - startTime;
      console.log(`[MIGRATION] 🎉 Migration completed successfully in ${duration}ms`);
      console.log(`[MIGRATION] 📊 Statistics:`, migrationResult.statistics);
      console.log(`[MIGRATION] 💾 Backups created:`);
      console.log(`   Pre-migration: ${preBackupPath}`);
      console.log(`   Post-migration: ${postBackupPath}`);
      console.log(`   Rollback data: ${rollbackPath}`);

      return {
        success: true,
        migratedCount: migrationResult.migratedCount,
        errors: [],
        rollbackData,
        duration,
        statistics: migrationResult.statistics,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[MIGRATION] ❌ Migration failed:', error);

      return {
        success: false,
        migratedCount: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        duration,
        statistics: {
          totalStarships: 0,
          totalTemplates: 0,
          totalRelationships: 0,
          createdConnectorInstances: 0,
        },
      };
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  /**
   * Perform the actual migration within a transaction
   */
  private async performMigrationTransaction(session: Session): Promise<{
    migratedCount: number;
    statistics: MigrationResult['statistics'];
  }> {
    const tx = session.beginTransaction();

    try {
      // First, gather statistics before migration
      const preStats = await tx.run(`
        MATCH (s:Starship) WITH count(s) as starshipCount
        MATCH (mso:MCPServerOption) WITH starshipCount, count(mso) as templateCount
        MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption) WITH starshipCount, templateCount, count(r) as relationshipCount
        RETURN starshipCount, templateCount, relationshipCount
      `);

      const stats = preStats.records[0];
      const totalStarships = stats ? stats.get('starshipCount').toNumber() : 0;
      const totalTemplates = stats ? stats.get('templateCount').toNumber() : 0;
      const totalRelationships = stats ? stats.get('relationshipCount').toNumber() : 0;

      console.log(
        `[MIGRATION] 📊 Pre-migration stats: ${totalStarships} starships, ${totalTemplates} templates, ${totalRelationships} relationships`
      );

      // Perform the migration transformation
      const migrationQuery = `
        MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
        WITH s, r, mso, randomUUID() as connectorId
        CREATE (msc:MCPServerConnector {
          id: connectorId,
          starshipId: s.id,
          templateId: mso.id,
          status: 'active',
          isActive: coalesce(r.isActive, true),
          connectedAt: coalesce(r.connectedAt, datetime().epochSeconds),
          createdAt: datetime().epochSeconds,
          updatedAt: datetime().epochSeconds
        })
        CREATE (s)-[:HAS_CONNECTOR_INSTANCE {
          createdAt: datetime().epochSeconds
        }]->(msc)
        CREATE (msc)-[:CREATED_FROM {
          createdAt: datetime().epochSeconds
        }]->(mso)
        DELETE r
        RETURN count(msc) as migratedCount
      `;

      const result = await tx.run(migrationQuery);
      const migratedCount = result.records[0]
        ? result.records[0].get('migratedCount').toNumber()
        : 0;

      console.log(`[MIGRATION] ✅ Successfully migrated ${migratedCount} connector relationships`);

      // Verify the migration was successful
      if (migratedCount !== totalRelationships) {
        throw new Error(
          `Migration count mismatch: expected ${totalRelationships}, got ${migratedCount}`
        );
      }

      await tx.commit();
      console.log('[MIGRATION] ✅ Transaction committed successfully');

      return {
        migratedCount,
        statistics: {
          totalStarships,
          totalTemplates,
          totalRelationships,
          createdConnectorInstances: migratedCount,
        },
      };
    } catch (error) {
      console.error('[MIGRATION] ❌ Transaction failed, rolling back...', error);
      await tx.rollback();
      throw error;
    }
  }

  /**
   * Rollback the migration using captured rollback data
   */
  async rollback(rollbackData: RollbackData[]): Promise<boolean> {
    console.log(`[ROLLBACK] 🔄 Starting rollback of ${rollbackData.length} relationships...`);

    let session: Session | null = null;

    try {
      session = this.connection.getSession();
      const tx = session.beginTransaction();

      try {
        // Step 1: Remove all connector instances and their relationships
        console.log('[ROLLBACK] 🗑️ Removing connector instances...');
        await tx.run(`
          MATCH (msc:MCPServerConnector)
          DETACH DELETE msc
        `);

        // Step 2: Restore original HAS_CONNECTOR relationships
        console.log('[ROLLBACK] 🔄 Restoring original relationships...');
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
        console.log('[ROLLBACK] ✅ Rollback completed successfully');
        return true;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } catch (error) {
      console.error('[ROLLBACK] ❌ Rollback failed:', error);
      return false;
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  /**
   * Capture rollback data before migration starts
   */
  private async captureRollbackData(session: Session): Promise<RollbackData[]> {
    const result = await session.run(`
      MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
      RETURN s.id as starshipId, mso.id as templateId, properties(r) as relationshipProps
    `);

    return result.records.map((record) => ({
      starshipId: record.get('starshipId'),
      templateId: record.get('templateId'),
      originalRelationship: record.get('relationshipProps') || {},
    }));
  }

  /**
   * Validate the database state before migration
   */
  private async validatePreMigrationState(session: Session): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('[VALIDATION] 🔍 Checking for orphaned relationships...');

    // Check for orphaned HAS_CONNECTOR relationships
    const orphanedResult = await session.run(`
      MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
      WHERE s IS NULL OR mso IS NULL
      RETURN count(r) as orphanedCount
    `);

    const orphanedCount = orphanedResult.records[0]
      ? orphanedResult.records[0].get('orphanedCount').toNumber()
      : 0;
    if (orphanedCount > 0) {
      errors.push(`Found ${orphanedCount} orphaned HAS_CONNECTOR relationships`);
    }

    // Check for existing connector instances (should not exist before migration)
    const existingInstancesResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      RETURN count(msc) as existingCount
    `);

    const existingCount = existingInstancesResult.records[0]
      ? existingInstancesResult.records[0].get('existingCount').toNumber()
      : 0;
    if (existingCount > 0) {
      warnings.push(
        `Found ${existingCount} existing MCPServerConnector instances - migration may have been run before`
      );
    }

    // Check for data consistency
    const consistencyResult = await session.run(`
      MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
      WHERE s.id IS NULL OR mso.id IS NULL
      RETURN count(r) as inconsistentCount
    `);

    const inconsistentCount = consistencyResult.records[0]
      ? consistencyResult.records[0].get('inconsistentCount').toNumber()
      : 0;
    if (inconsistentCount > 0) {
      errors.push(`Found ${inconsistentCount} relationships with null IDs`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate the database state after migration
   */
  private async validatePostMigrationState(session: Session): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('[VALIDATION] 🔍 Validating post-migration state...');

    // Check 1: No old HAS_CONNECTOR relationships should remain
    const oldRelResult = await session.run(`
      MATCH ()-[r:HAS_CONNECTOR]->()
      RETURN count(r) as oldRelCount
    `);
    const oldRelCount = oldRelResult.records[0]
      ? oldRelResult.records[0].get('oldRelCount').toNumber()
      : 0;
    if (oldRelCount > 0) {
      errors.push(`${oldRelCount} old HAS_CONNECTOR relationships still exist`);
    }

    // Check 2: All connector instances should have proper relationships
    const orphanedConnectorResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
         OR NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
      RETURN count(msc) as orphanedConnectors
    `);

    const orphanedConnectors = orphanedConnectorResult.records[0]
      ? orphanedConnectorResult.records[0].get('orphanedConnectors').toNumber()
      : 0;
    if (orphanedConnectors > 0) {
      errors.push(`${orphanedConnectors} connector instances are orphaned`);
    }

    // Check 3: No duplicate connector instances
    const duplicateResult = await session.run(`
      MATCH (msc:MCPServerConnector)
      WITH msc.starshipId as starshipId, msc.templateId as templateId, count(msc) as instanceCount
      WHERE instanceCount > 1
      RETURN count(*) as duplicateCount
    `);

    const duplicateCount = duplicateResult.records[0]
      ? duplicateResult.records[0].get('duplicateCount').toNumber()
      : 0;
    if (duplicateCount > 0) {
      errors.push(`Found ${duplicateCount} duplicate connector instances`);
    }

    // Check 4: All connector instances have valid starship IDs
    const invalidInstancesResult = await session.run(`
      MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
      WHERE msc.starshipId <> s.id
      RETURN count(msc) as invalidCount
    `);

    const invalidCount = invalidInstancesResult.records[0]
      ? invalidInstancesResult.records[0].get('invalidCount').toNumber()
      : 0;
    if (invalidCount > 0) {
      errors.push(`Found ${invalidCount} connector instances with mismatched starship IDs`);
    }

    // Gather statistics
    const statsResult = await session.run(`
      MATCH (msc:MCPServerConnector) WITH count(msc) as connectorCount
      MATCH (s:Starship) WITH connectorCount, count(s) as starshipCount
      MATCH (mso:MCPServerOption) WITH connectorCount, starshipCount, count(mso) as templateCount
      RETURN connectorCount, starshipCount, templateCount
    `);

    const statistics = {
      totalConnectorInstances: statsResult.records[0]
        ? statsResult.records[0].get('connectorCount').toNumber()
        : 0,
      totalStarships: statsResult.records[0]
        ? statsResult.records[0].get('starshipCount').toNumber()
        : 0,
      totalTemplates: statsResult.records[0]
        ? statsResult.records[0].get('templateCount').toNumber()
        : 0,
      orphanedInstances: orphanedConnectors,
      duplicateInstances: duplicateCount,
      oldRelationships: oldRelCount,
    };

    console.log('[VALIDATION] 📊 Post-migration statistics:', statistics);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      statistics,
    };
  }

  /**
   * Save rollback data to a file for emergency recovery
   */
  private async saveRollbackData(rollbackData: RollbackData[]): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rollbackPath = path.join(
      process.cwd(),
      'packages',
      'models',
      'src',
      'migrations',
      `rollback-data-${timestamp}.json`
    );

    const rollbackFile = {
      timestamp: new Date().toISOString(),
      migrationVersion: '001-connector-instances',
      rollbackData,
      metadata: {
        totalRelationships: rollbackData.length,
        createdBy: 'ConnectorInstanceMigration',
      },
    };

    fs.writeFileSync(rollbackPath, JSON.stringify(rollbackFile, null, 2));
    return rollbackPath;
  }
}

/**
 * CLI interface for running the migration
 */
export async function runMigration(): Promise<void> {
  console.log('🚀 Starting MCP Connector Instance Migration');
  console.log('==========================================');

  const migration = new ConnectorInstanceMigration();
  const result = await migration.migrate();

  if (result.success) {
    console.log('\n✅ Migration completed successfully!');
    console.log(`⏱️  Duration: ${result.duration}ms`);
    console.log(`📊 Migrated: ${result.migratedCount} connector relationships`);
    console.log(`📈 Statistics:`, result.statistics);

    if (result.rollbackData && result.rollbackData.length > 0) {
      console.log(`💾 Rollback data saved for ${result.rollbackData.length} relationships`);
    }
  } else {
    console.error('\n❌ Migration failed!');
    console.error(`⏱️  Duration: ${result.duration}ms`);
    console.error('🔍 Errors:');
    result.errors.forEach((error, index) => {
      console.error(`   ${index + 1}. ${error}`);
    });
    process.exit(1);
  }
}

/**
 * CLI interface for rollback
 */
export async function runRollback(rollbackDataPath?: string): Promise<void> {
  console.log('🔄 Starting MCP Connector Instance Rollback');
  console.log('==========================================');

  try {
    let rollbackData: RollbackData[];

    if (rollbackDataPath) {
      // Load rollback data from specified file
      console.log(`📂 Loading rollback data from: ${rollbackDataPath}`);
      const rollbackFile = JSON.parse(fs.readFileSync(rollbackDataPath, 'utf8'));
      rollbackData = rollbackFile.rollbackData || rollbackFile; // Support both formats
    } else {
      // Find the most recent rollback file
      const migrationsDir = path.join(process.cwd(), 'packages', 'models', 'src', 'migrations');
      const rollbackFiles = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.startsWith('rollback-data-') && file.endsWith('.json'))
        .sort()
        .reverse();

      if (rollbackFiles.length === 0) {
        throw new Error('No rollback data files found. Please specify a rollback file path.');
      }

      const latestRollbackFile = path.join(migrationsDir, rollbackFiles[0]);
      console.log(`📂 Using latest rollback file: ${latestRollbackFile}`);
      const rollbackFile = JSON.parse(fs.readFileSync(latestRollbackFile, 'utf8'));
      rollbackData = rollbackFile.rollbackData || rollbackFile;
    }

    const migration = new ConnectorInstanceMigration();
    const success = await migration.rollback(rollbackData);

    if (success) {
      console.log('\n✅ Rollback completed successfully!');
      console.log(`📊 Restored: ${rollbackData.length} connector relationships`);
    } else {
      console.error('\n❌ Rollback failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Rollback failed with error:', error);
    process.exit(1);
  }
}

/**
 * CLI interface for validation - now uses comprehensive validator
 */
export async function runValidation(): Promise<void> {
  console.log('🔍 Running Comprehensive Post-Migration Validation');
  console.log('==================================================');

  try {
    const validator = new MigrationValidator();
    const result = await validator.validateMigration();

    if (result.valid) {
      console.log('\n✅ Comprehensive validation passed!');
      console.log('📊 Statistics:', result.statistics);
    } else {
      console.error('\n❌ Comprehensive validation failed!');
      console.error('🔍 Errors:');
      result.errors.forEach((error, index) => {
        console.error(`   ${index + 1}. ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      console.warn('\n⚠️  Warnings:');
      result.warnings.forEach((warning, index) => {
        console.warn(`   ${index + 1}. ${warning}`);
      });
    }

    if (!result.valid) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Validation failed with error:', error);
    process.exit(1);
  }
}
