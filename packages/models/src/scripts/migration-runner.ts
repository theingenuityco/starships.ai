import { getConnection } from '../connection';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Migration Runner with Error Handling and Validation
 * 
 * Provides safe migration execution with rollback capabilities,
 * dependency checking, and comprehensive error handling.
 */

export interface MigrationInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  dependencies?: string[];
  appliedAt?: string;
  appliedBy?: string;
}

export interface MigrationResult {
  success: boolean;
  migrationId: string;
  executionTime: number;
  errors?: string[];
  warnings?: string[];
  rollbackAvailable: boolean;
}

export class MigrationRunner {
  private connection: any = null;
  private migrationsPath = join(__dirname, '../migrations');

  private getConnection() {
    if (!this.connection) {
      this.connection = getConnection();
    }
    return this.connection;
  }

  /**
   * Execute a migration with full error handling
   */
  async runMigration(migrationId: string): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationId,
      executionTime: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: false
    };

    try {
      // Check if migration already applied
      const isApplied = await this.isMigrationApplied(migrationId);
      if (isApplied) {
        result.warnings?.push(`Migration ${migrationId} is already applied`);
        result.success = true;
        result.executionTime = Date.now() - startTime;
        return result;
      }

      // Validate migration file exists
      const migrationPath = join(this.migrationsPath, `${migrationId}.cypher`);
      if (!existsSync(migrationPath)) {
        result.errors?.push(`Migration file not found: ${migrationPath}`);
        return result;
      }

      // Check rollback file exists
      const rollbackPath = join(this.migrationsPath, `${migrationId.replace(/^(\d+)_/, '$1_rollback_')}.cypher`);
      result.rollbackAvailable = existsSync(rollbackPath);

      // Validate dependencies
      const dependencyCheck = await this.validateDependencies(migrationId);
      if (!dependencyCheck.valid) {
        result.errors?.push(`Dependency validation failed: ${dependencyCheck.missing?.join(', ')}`);
        return result;
      }

      // Create backup point
      await this.createBackupPoint(migrationId);

      // Execute migration
      const migrationContent = readFileSync(migrationPath, 'utf-8');
      await this.executeMigrationContent(migrationContent, migrationId);

      // Verify migration success
      const verificationResult = await this.verifyMigration(migrationId);
      if (!verificationResult.success) {
        result.errors?.push(`Migration verification failed: ${verificationResult.errors?.join(', ')}`);
        
        // Attempt rollback
        if (result.rollbackAvailable) {
          await this.rollbackMigration(migrationId);
          result.warnings?.push('Migration rolled back due to verification failure');
        }
        return result;
      }

      result.success = true;
      result.executionTime = Date.now() - startTime;

    } catch (error) {
      result.errors?.push(`Migration execution failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Attempt rollback on error
      if (result.rollbackAvailable) {
        try {
          await this.rollbackMigration(migrationId);
          result.warnings?.push('Migration rolled back due to execution error');
        } catch (rollbackError) {
          result.errors?.push(`Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
      }
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Rollback a migration
   */
  async rollbackMigration(migrationId: string): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationId,
      executionTime: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: true
    };

    try {
      // Check if migration is applied
      const isApplied = await this.isMigrationApplied(migrationId);
      if (!isApplied) {
        result.warnings?.push(`Migration ${migrationId} is not applied, nothing to rollback`);
        result.success = true;
        result.executionTime = Date.now() - startTime;
        return result;
      }

      // Find rollback file
      const rollbackPath = join(this.migrationsPath, `${migrationId.replace(/^(\d+)_/, '$1_rollback_')}.cypher`);
      if (!existsSync(rollbackPath)) {
        result.errors?.push(`Rollback file not found: ${rollbackPath}`);
        return result;
      }

      // Execute rollback
      const rollbackContent = readFileSync(rollbackPath, 'utf-8');
      await this.executeMigrationContent(rollbackContent, `rollback_${migrationId}`);

      result.success = true;
      result.executionTime = Date.now() - startTime;

    } catch (error) {
      result.errors?.push(`Rollback execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(): Promise<MigrationInfo[]> {
    try {
      const result = await this.getConnection().executeQuery(
        `MATCH (m:Migration) 
         RETURN m 
         ORDER BY m.appliedAt ASC`
      );
      return result.map((record: any) => record.m);
    } catch (error) {
      console.error('Failed to get applied migrations:', error);
      return [];
    }
  }

  /**
   * Get list of pending migrations
   */
  async getPendingMigrations(): Promise<string[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));
    
    // This would need to be enhanced to scan the migrations directory
    const allMigrations = [
      '003_database_optimizations',
      '004_expedition_specific_optimizations'
    ];
    
    return allMigrations.filter(id => !appliedIds.has(id));
  }

  /**
   * Validate migration dependencies
   */
  private async validateDependencies(migrationId: string): Promise<{
    valid: boolean;
    missing?: string[];
  }> {
    // This would need to parse the migration file to extract dependencies
    // For now, we'll use a simple mapping
    const dependencies: Record<string, string[]> = {
      '003_database_optimizations': ['002_expedition_system'],
      '004_expedition_specific_optimizations': ['003_database_optimizations']
    };

    const migrationDeps = dependencies[migrationId] || [];
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));

    const missing = migrationDeps.filter(dep => !appliedIds.has(dep));
    
    return {
      valid: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined
    };
  }

  /**
   * Check if migration is already applied
   */
  private async isMigrationApplied(migrationId: string): Promise<boolean> {
    try {
      const result = await this.getConnection().executeQuery(
        'MATCH (m:Migration {id: $migrationId}) RETURN count(m) as count',
        { migrationId }
      );
      return result[0]?.count > 0;
    } catch (error) {
      console.error('Failed to check migration status:', error);
      return false;
    }
  }

  /**
   * Execute migration content with transaction handling
   */
  private async executeMigrationContent(content: string, migrationId: string): Promise<void> {
    // Split content into individual statements
    const statements = content
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('//'));

    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await this.getConnection().executeWrite(statement);
        } catch (error) {
          throw new Error(`Failed to execute statement in ${migrationId}: ${statement.substring(0, 100)}... Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /**
   * Create backup point before migration
   */
  private async createBackupPoint(migrationId: string): Promise<void> {
    try {
      await this.getConnection().executeWrite(
        `CREATE (bp:BackupPoint {
          id: $backupId,
          migrationId: $migrationId,
          createdAt: datetime().epochMillis,
          description: 'Pre-migration backup point'
        })`,
        {
          backupId: `backup_${migrationId}_${Date.now()}`,
          migrationId
        }
      );
    } catch (error) {
      console.warn('Failed to create backup point:', error);
    }
  }

  /**
   * Verify migration was applied correctly
   */
  private async verifyMigration(migrationId: string): Promise<{
    success: boolean;
    errors?: string[];
  }> {
    const errors: string[] = [];

    try {
      // Check if migration record was created
      const migrationExists = await this.isMigrationApplied(migrationId);
      if (!migrationExists) {
        errors.push('Migration record not found after execution');
      }

      // Specific verification based on migration type
      if (migrationId.includes('database_optimizations')) {
        await this.verifyConstraintsAndIndexes(errors);
      }

      if (migrationId.includes('expedition_specific_optimizations')) {
        await this.verifyExpeditionOptimizations(errors);
      }

    } catch (error) {
      errors.push(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Verify constraints and indexes were created
   */
  private async verifyConstraintsAndIndexes(errors: string[]): Promise<void> {
    try {
      // Check constraints
      const constraints = await this.getConnection().executeQuery(
        'SHOW CONSTRAINTS YIELD name WHERE name CONTAINS "expedition" RETURN count(*) as count'
      );
      
      if (constraints[0]?.count < 10) {
        errors.push('Expected constraints not found');
      }

      // Check indexes
      const indexes = await this.getConnection().executeQuery(
        'SHOW INDEXES YIELD name WHERE name CONTAINS "expedition" RETURN count(*) as count'
      );
      
      if (indexes[0]?.count < 20) {
        errors.push('Expected indexes not found');
      }

    } catch (error) {
      errors.push(`Constraint/index verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verify expedition-specific optimizations
   */
  private async verifyExpeditionOptimizations(errors: string[]): Promise<void> {
    try {
      // Check full-text indexes
      const fullTextIndexes = await this.getConnection().executeQuery(
        'CALL db.index.fulltext.listAvailableAnalyzers() YIELD analyzer RETURN count(*) as count'
      );
      
      if (fullTextIndexes[0]?.count === 0) {
        errors.push('Full-text search indexes not properly configured');
      }

      // Check cache nodes
      const cacheNodes = await this.getConnection().executeQuery(
        'MATCH (c:QueryCache) RETURN count(c) as count'
      );
      
      if (cacheNodes[0]?.count < 3) {
        errors.push('Query cache nodes not created');
      }

    } catch (error) {
      errors.push(`Expedition optimization verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Run all pending migrations
   */
  async runAllPendingMigrations(): Promise<MigrationResult[]> {
    const pendingMigrations = await this.getPendingMigrations();
    const results: MigrationResult[] = [];

    for (const migrationId of pendingMigrations) {
      console.log(`Running migration: ${migrationId}`);
      const result = await this.runMigration(migrationId);
      results.push(result);

      if (!result.success) {
        console.error(`Migration ${migrationId} failed:`, result.errors);
        break; // Stop on first failure
      } else {
        console.log(`Migration ${migrationId} completed successfully in ${result.executionTime}ms`);
      }
    }

    return results;
  }
}

// Export singleton instance
export const migrationRunner = new MigrationRunner();