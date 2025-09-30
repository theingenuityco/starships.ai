import { getConnection } from '@/helpers/database';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

/** Migration runner with error handling and rollback capabilities for PostgreSQL */

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
  private connection: ReturnType<typeof getConnection> | null = null;
  private migrationsPath = join(__dirname, '../../migrations');

  private getConnection() {
    if (!this.connection) {
      this.connection = getConnection();
    }
    return this.connection;
  }

  /** Initialize schema if not already done */
  async initializeSchema(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationId: '000_postgresql_schema',
      executionTime: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: false,
    };

    try {
      // Check if schema is already initialized
      console.log('🔍 Checking for existing migration records...');
      const isApplied = await this.isMigrationApplied('000_postgresql_schema');
      console.log(`   └─ Schema initialization status: ${isApplied ? 'exists' : 'needed'}`);

      if (isApplied) {
        // Force re-verification even if migration exists
        console.log('🔍 Migration exists but forcing verification check...');
        const verificationResult = await this.verifySchemaInitialization();
        if (verificationResult.success) {
          result.warnings?.push('Schema already initialized and verified');
          result.success = true;
          result.executionTime = Date.now() - startTime;
          return result;
        } else {
          console.log('⚠️ Migration exists but verification failed, clearing incomplete migration and re-running...');
          // Clear the incomplete migration record and re-run
          await this.getConnection().query('DELETE FROM migration_history WHERE migration_id = $1', ['000_postgresql_schema']);
          console.log('   └─ Cleared incomplete migration record');
        }
      }

      // Validate migration file exists
      const migrationPath = join(this.migrationsPath, '000_postgresql_schema.sql');
      if (!existsSync(migrationPath)) {
        result.errors?.push(`Schema file not found: ${migrationPath}`);
        return result;
      }

      // Execute schema initialization
      const schemaContent = readFileSync(migrationPath, 'utf-8');
      console.log('🚀 Initializing database schema...');

      try {
        await this.executeMigrationContent(schemaContent);
        console.log('✅ Migration content executed successfully, now verifying...');
      } catch (executionError) {
        console.error('❌ Migration content execution failed:', executionError);
        throw executionError;
      }

      // Record migration as applied
      await this.recordMigration('000_postgresql_schema', 'PostgreSQL Schema', 'Complete PostgreSQL database schema', '1.0.0');

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

  /** Execute a migration with full error handling (deprecated - use initializeSchema) */
  async runMigration(migrationId: string): Promise<MigrationResult> {
    console.warn('⚠️  runMigration is deprecated. Use initializeSchema() instead.');

    if (migrationId === '001_initialize_schema' || migrationId === '000_postgresql_schema') {
      return this.initializeSchema();
    }

    // Return error for other migration IDs since they no longer exist
    return {
      success: false,
      migrationId,
      executionTime: 0,
      errors: [`Migration ${migrationId} no longer exists. Use initializeSchema() instead.`],
      warnings: [],
      rollbackAvailable: false,
    };
  }

  /** Rollback a migration */
  async rollbackMigration(migrationId: string): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationId,
      executionTime: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: true,
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
      const rollbackPath = join(this.migrationsPath, `${migrationId.replace(/^(\d+)_/, '$1_rollback_')}.sql`);
      if (!existsSync(rollbackPath)) {
        result.errors?.push(`Rollback file not found: ${rollbackPath}`);
        return result;
      }

      // Execute rollback
      const rollbackContent = readFileSync(rollbackPath, 'utf-8');
      await this.executeMigrationContent(rollbackContent);

      result.success = true;
      result.executionTime = Date.now() - startTime;
    } catch (error) {
      result.errors?.push(`Rollback execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /** Get list of applied migrations */
  async getAppliedMigrations(): Promise<MigrationInfo[]> {
    try {
      // First ensure migration_history table exists
      await this.ensureMigrationTable();

      const result = await this.getConnection().query<{
        id: string;
        name: string;
        description: string;
        version: string;
        appliedAt: string;
        appliedBy: string;
      }>(`
        SELECT migration_id as id, name, description, version, applied_at as "appliedAt", applied_by as "appliedBy"
        FROM migration_history
        ORDER BY applied_at ASC
      `);
      return result.map((record) => ({
        id: record.id,
        name: record.name,
        description: record.description,
        version: record.version,
        appliedAt: record.appliedAt,
        appliedBy: record.appliedBy,
      }));
    } catch (error) {
      console.error('Failed to get applied migrations:', error);
      return [];
    }
  }

  /** Get list of pending migrations */
  async getPendingMigrations(): Promise<string[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map((m) => m.id));

    // Scan the migrations directory for .sql files (not rollback files)
    const migrationFiles = readdirSync(this.migrationsPath)
      .filter((file) => file.endsWith('.sql') && !file.includes('rollback'))
      .map((file) => file.replace('.sql', ''))
      .sort();

    return migrationFiles.filter((id) => !appliedIds.has(id));
  }

  /** Check if migration is already applied */
  private async isMigrationApplied(migrationId: string): Promise<boolean> {
    try {
      // First ensure migration_history table exists
      await this.ensureMigrationTable();

      const result = await this.getConnection().query<{ count: string }>(
        'SELECT COUNT(*) as count FROM migration_history WHERE migration_id = $1',
        [migrationId]
      );
      return parseInt(result[0]?.count || '0') > 0;
    } catch (error) {
      console.error('Failed to check migration status:', error);
      return false;
    }
  }

  /** Ensure migration_history table exists */
  private async ensureMigrationTable(): Promise<void> {
    try {
      await this.getConnection().query(`
        CREATE TABLE IF NOT EXISTS migration_history (
          migration_id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
          applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          applied_by VARCHAR(100) NOT NULL DEFAULT 'system'
        )
      `);
    } catch (error) {
      console.warn('Failed to ensure migration_history table:', error);
    }
  }

  /** Record migration as applied */
  private async recordMigration(migrationId: string, name: string, description: string, version: string): Promise<void> {
    await this.ensureMigrationTable();
    await this.getConnection().query(
      `
      INSERT INTO migration_history (migration_id, name, description, version, applied_at, applied_by)
      VALUES ($1, $2, $3, $4, NOW(), 'system')
      ON CONFLICT (migration_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        version = EXCLUDED.version,
        applied_at = EXCLUDED.applied_at,
        applied_by = EXCLUDED.applied_by
    `,
      [migrationId, name, description, version]
    );
  }

  /** Execute migration content with transaction handling */
  private async executeMigrationContent(content: string): Promise<void> {
    // Clean content: remove comment lines and empty lines, but preserve multi-line statements
    const lines = content.split('\n');
    const cleanedLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      // Skip empty lines and comment-only lines
      if (trimmedLine.length === 0 || trimmedLine.startsWith('--')) {
        continue;
      }
      cleanedLines.push(line);
    }

    const cleanContent = cleanedLines.join('\n');

    // Split content into individual statements by semicolons
    const statements = cleanContent
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    console.log(`📝 Executing ${statements.length} statements for schema initialization`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        try {
          // Show friendly progress without revealing statement content
          const statementType = this.getStatementType(statement);
          console.log(`  └─ Executing statement ${i + 1}/${statements.length}: ${statementType}...`);
          await this.getConnection().query(statement);
        } catch (error) {
          console.error(`❌ Failed to execute statement ${i + 1}: ${this.getStatementType(statement)}`);
          throw new Error(`Failed to execute statement ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    console.log(`✅ Successfully executed all ${statements.length} statements`);
  }

  /** Get a friendly description of statement type without revealing content */
  private getStatementType(statement: string): string {
    const upperStatement = statement.toUpperCase().trim();

    if (upperStatement.startsWith('CREATE TABLE')) {
      return 'Creating table';
    } else if (upperStatement.startsWith('CREATE UNIQUE INDEX') || upperStatement.startsWith('CREATE INDEX')) {
      return 'Creating database index';
    } else if (upperStatement.startsWith('CREATE EXTENSION')) {
      return 'Creating database extension';
    } else if (upperStatement.startsWith('CREATE OR REPLACE FUNCTION')) {
      return 'Creating database function';
    } else if (upperStatement.startsWith('CREATE TRIGGER')) {
      return 'Creating database trigger';
    } else if (upperStatement.startsWith('ALTER TABLE')) {
      return 'Modifying table structure';
    } else if (upperStatement.startsWith('COMMENT ON')) {
      return 'Adding table comment';
    } else if (upperStatement.startsWith('INSERT INTO')) {
      return 'Inserting initial data';
    } else {
      return 'Executing database operation';
    }
  }

  /** Verify schema initialization was successful */
  private async verifySchemaInitialization(): Promise<{
    success: boolean;
    errors?: string[];
  }> {
    const errors: string[] = [];

    try {
      // Check if migration record was created
      const migrationExists = await this.isMigrationApplied('000_postgresql_schema');
      if (!migrationExists) {
        errors.push('Schema initialization record not found');
      }

      // Check key tables were created
      const tableResult = await this.getConnection().query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('users', 'starships', 'agents', 'conversations', 'messages')
      `);
      const tableCount = parseInt(tableResult[0]?.count || '0');
      if (tableCount < 5) {
        errors.push(`Expected at least 5 core tables, found ${tableCount}`);
      }

      // Check indexes were created
      const indexResult = await this.getConnection().query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM pg_indexes
        WHERE schemaname = 'public'
      `);
      const indexCount = parseInt(indexResult[0]?.count || '0');
      if (indexCount < 15) {
        errors.push(`Expected at least 15 indexes, found ${indexCount}`);
      }
    } catch (error) {
      errors.push(`Schema verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /** Initialize database schema (replaces runAllPendingMigrations) */
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
