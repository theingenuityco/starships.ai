import { getConnection } from '../helpers/database';
import { readFileSync, existsSync, readdirSync } from 'fs';
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
   * Initialize schema if not already done
   */
  async initializeSchema(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationId: '000_complete_schema',
      executionTime: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: false
    };

    try {
      // Check if schema is already initialized
      const isApplied = await this.isMigrationApplied('000_complete_schema');
      if (isApplied) {
        result.warnings?.push('Schema already initialized');
        result.success = true;
        result.executionTime = Date.now() - startTime;
        return result;
      }

      // Validate migration file exists
      const migrationPath = join(this.migrationsPath, '000_complete_schema.cypher');
      if (!existsSync(migrationPath)) {
        result.errors?.push(`Schema file not found: ${migrationPath}`);
        return result;
      }

      console.log('🚀 Initializing database schema...');

      // Execute schema initialization
      const schemaContent = readFileSync(migrationPath, 'utf-8');
      await this.executeMigrationContent(schemaContent, '000_complete_schema');

      // Verify schema initialization
      const verificationResult = await this.verifySchemaInitialization();
      if (!verificationResult.success) {
        result.errors?.push(`Schema verification failed: ${verificationResult.errors?.join(', ')}`);
        return result;
      }

      result.success = true;
      result.executionTime = Date.now() - startTime;
      console.log(`✅ Schema initialized successfully in ${result.executionTime}ms`);

    } catch (error) {
      result.errors?.push(`Schema initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error('❌ Schema initialization failed:', error);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Execute a migration with full error handling (deprecated - use initializeSchema)
   */
  async runMigration(migrationId: string): Promise<MigrationResult> {
    console.warn('⚠️  runMigration is deprecated. Use initializeSchema() instead.');
    
    if (migrationId === '001_initialize_schema') {
      return this.initializeSchema();
    }

    // Return error for other migration IDs since they no longer exist
    return {
      success: false,
      migrationId,
      executionTime: 0,
      errors: [`Migration ${migrationId} no longer exists. Use initializeSchema() instead.`],
      warnings: [],
      rollbackAvailable: false
    };
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
    
    // Scan the migrations directory for .cypher files (not rollback files)
    const migrationFiles = readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.cypher') && !file.includes('rollback'))
      .map(file => file.replace('.cypher', ''))
      .sort();
    
    return migrationFiles.filter(id => !appliedIds.has(id));
  }

  /**
   * Validate migration dependencies
   * Updated to handle gaps in migration numbering gracefully
   */
  private async validateDependencies(migrationId: string): Promise<{
    valid: boolean;
    missing?: string[];
  }> {
    // Extract the migration number from the ID (e.g., "003" from "003_database_optimizations")
    const migrationNumber = parseInt(migrationId.split('_')[0]);
    
    if (isNaN(migrationNumber)) {
      // No dependency validation for non-numbered migrations
      return { valid: true };
    }

    const appliedMigrations = await this.getAppliedMigrations();
    const appliedNumbers = appliedMigrations
      .map(m => parseInt(m.id.split('_')[0]))
      .filter(num => !isNaN(num));

    // Get all available migration files to understand which ones actually exist
    const availableMigrationFiles = readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.cypher') && !file.includes('rollback'))
      .map(file => file.replace('.cypher', ''));
    
    const availableNumbers = availableMigrationFiles
      .map(id => parseInt(id.split('_')[0]))
      .filter(num => !isNaN(num) && num < migrationNumber)
      .sort((a, b) => a - b);

    // Check if all available previous numbered migrations are applied
    // This handles gaps in numbering by only checking for migrations that actually exist
    const missing: string[] = [];
    for (const availableNumber of availableNumbers) {
      if (!appliedNumbers.includes(availableNumber)) {
        missing.push(`${availableNumber.toString().padStart(3, '0')}_*`);
      }
    }
    
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
   * Verify schema initialization was successful
   */
  private async verifySchemaInitialization(): Promise<{
    success: boolean;
    errors?: string[];
  }> {
    const errors: string[] = [];

    try {
      // Check if migration record was created
      const migrationExists = await this.isMigrationApplied('001_initialize_schema');
      if (!migrationExists) {
        errors.push('Schema initialization record not found');
      }

      // Check constraints were created
      const constraints = await this.getConnection().executeQuery('SHOW CONSTRAINTS');
      if (constraints.length < 10) {
        errors.push(`Expected at least 10 constraints, found ${constraints.length}`);
      }

      // Check indexes were created
      const indexes = await this.getConnection().executeQuery('SHOW INDEXES');
      if (indexes.length < 15) {
        errors.push(`Expected at least 15 indexes, found ${indexes.length}`);
      }

      // Check seed data was created
      const mcpCount = await this.getConnection().executeQuery('MATCH (m:MCPServerOption) RETURN count(m) as count');
      if (mcpCount[0]?.count < 8) {
        errors.push(`Expected at least 8 MCP server options, found ${mcpCount[0]?.count || 0}`);
      }

    } catch (error) {
      errors.push(`Schema verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Verify migration was applied correctly (deprecated)
   */
  private async verifyMigration(migrationId: string): Promise<{
    success: boolean;
    errors?: string[];
  }> {
    if (migrationId === '001_initialize_schema') {
      return this.verifySchemaInitialization();
    }

    // For other migrations, just check if they exist (shouldn't happen)
    const errors: string[] = [];
    try {
      const migrationExists = await this.isMigrationApplied(migrationId);
      if (!migrationExists) {
        errors.push('Migration record not found after execution');
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
      // Check basic constraints exist
      const constraints = await this.getConnection().executeQuery(
        'SHOW CONSTRAINTS YIELD name RETURN count(*) as count'
      );
      
      if (constraints[0]?.count < 5) {
        errors.push('Expected constraints not found');
      }

      // Check basic indexes exist
      const indexes = await this.getConnection().executeQuery(
        'SHOW INDEXES YIELD name RETURN count(*) as count'
      );
      
      if (indexes[0]?.count < 5) {
        errors.push('Expected indexes not found');
      }

    } catch (error) {
      errors.push(`Constraint/index verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  /**
   * Initialize database schema (replaces runAllPendingMigrations)
   */
  async runAllPendingMigrations(): Promise<MigrationResult[]> {
    console.log('🚀 Checking database schema...');
    
    const result = await this.initializeSchema();
    
    if (result.success) {
      console.log('✅ Database schema is ready');
    } else {
      console.error('❌ Database schema initialization failed:', result.errors);
    }
    
    return [result];
  }
}

// Export singleton instance
export const migrationRunner = new MigrationRunner();