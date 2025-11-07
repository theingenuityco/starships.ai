import { getConnection } from '@/helpers/database';
import { existsSync, readdirSync } from 'fs';
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

  private isDistBuild(): boolean {
    return __dirname.includes('/dist/') || __dirname.includes('\\dist\\');
  }

  private getMigrationsPath(): string {
    return this.isDistBuild() ? join(__dirname, '../migrations') : this.migrationsPath;
  }

  private getConnection() {
    if (!this.connection) {
      this.connection = getConnection();
    }
    return this.connection;
  }

  private resolveMigrationModulePath(id: string): string | null {
    const base = this.getMigrationsPath();
    const ext = this.isDistBuild() ? '.js' : '.ts';
    const p = join(base, id + ext);
    if (existsSync(p)) return p;
    return null;
  }

  /** Initialize schema if not already done (JS-first migrations) */
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
      const isApplied = await this.isMigrationApplied('000_postgresql_schema');

      if (isApplied) {
        // Force re-verification even if migration exists
        const verificationResult = await this.verifySchemaInitialization();
        if (verificationResult.success) {
          result.warnings?.push('Schema already initialized and verified');
          result.success = true;
          result.executionTime = Date.now() - startTime;
          return result;
        } else {
          // Clear the incomplete migration record and re-run
          await this.getConnection().query('DELETE FROM migration_history WHERE migration_id = $1', ['000_postgresql_schema']);
        }
      }

      // Execute schema initialization via JS migration
      const schemaModulePath = this.resolveMigrationModulePath('000_postgresql_schema');
      if (!schemaModulePath) {
        result.errors?.push(`Schema module not found: ${join(this.getMigrationsPath(), '000_postgresql_schema')}.(js|ts)`);
        return result;
      }
      console.log('🚀 Initializing database schema...');
      try {
        const mod = await import(schemaModulePath);
        if (!mod || typeof mod.up !== 'function') {
          throw new Error('Migration module must export an async function up(client)');
        }
        await mod.up(this.getConnection());
      } catch (executionError) {
        console.error('❌ Schema JS migration execution failed:', executionError);
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

  /** Execute a specific migration (JS-first, resolves module by id in /migrations) */
  async runMigration(migrationId: string): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationId,
      executionTime: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: false,
    };

    try {
      await this.ensureMigrationTable();

      // Skip if already applied
      if (await this.isMigrationApplied(migrationId)) {
        result.warnings?.push(`Migration ${migrationId} already applied`);
        result.success = true;
        result.executionTime = Date.now() - startTime;
        return result;
      }

      // Resolve JS/TS module
      const modulePath = this.resolveMigrationModulePath(migrationId);
      if (!modulePath) {
        result.errors?.push(`Migration module not found: ${join(this.getMigrationsPath(), migrationId)}.(js|ts)`);
        return result;
      }
      const mod = await import(modulePath);
      if (!mod || typeof mod.up !== 'function') {
        result.errors?.push(`Migration ${migrationId} does not export up(client)`);
        return result;
      }
      await mod.up(this.getConnection());

      // Record as applied
      await this.recordMigration(migrationId, migrationId, `Applied migration ${migrationId}`, '1.0.0');

      result.success = true;
      result.executionTime = Date.now() - startTime;
      return result;
    } catch (error) {
      result.errors?.push(`Migration ${migrationId} failed: ${error instanceof Error ? error.message : String(error)}`);
      result.executionTime = Date.now() - startTime;
      console.error(`❌ Migration ${migrationId} failed:`, error);
      return result;
    }
  }

  /** Rollback a migration (not implemented for JS migrations) */
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

      result.errors?.push('Rollback not implemented for JS migrations');
      return result;
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

  /** Get list of pending migrations (reads JS modules from dist/migrations; dev fallback if needed) */
  async getPendingMigrations(): Promise<string[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map((m) => m.id));

    const base = this.getMigrationsPath();
    if (!existsSync(base)) return [];
    const ext = this.isDistBuild() ? '.js' : '.ts';
    const files = readdirSync(base).filter((file) => file.endsWith(ext) && !file.endsWith('.d.ts'));
    const ids = files.map((f) => f.slice(0, -ext.length));

    // Sort by numeric prefix, then lexicographically
    const sortedIds = ids.sort((a, b) => {
      const na = parseInt(a.match(/^(\d+)/)?.[1] ?? '999999', 10);
      const nb = parseInt(b.match(/^(\d+)/)?.[1] ?? '999999', 10);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });

    return sortedIds.filter((id) => !appliedIds.has(id));
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

  // executeMigrationContent removed for JS-first migrations

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

  /** Initialize database schema and then run any remaining pending migrations */
  async runAllPendingMigrations(): Promise<MigrationResult[]> {
    console.log('🔍 Scanning for pending migrations...');
    const results: MigrationResult[] = [];

    // Ensure history table exists before we check applied/pending
    await this.ensureMigrationTable();

    const toRun = await this.getPendingMigrations();

    if (toRun.length === 0) {
      console.log('✅ No pending migrations to apply');
      return results;
    }

    console.log(`🧩 Applying ${toRun.length} pending migration(s):`);
    const applied: string[] = [];
    const failed: { id: string; errors?: string[] }[] = [];
    for (const id of toRun) {
      const started = Date.now();
      const res = await this.runMigration(id);
      results.push(res);
      const took = Date.now() - started;
      if (!res.success) {
        console.error(`❌ [${id}] failed in ${took}ms:`, res.errors);
        failed.push({ id, errors: res.errors });
      } else {
        console.log(`✅ [${id}] applied in ${took}ms`);
        applied.push(id);
      }
    }

    console.log('📦 Migration summary:');
    console.log(`   Applied: ${applied.length} ${applied.length ? `(${applied.join(', ')})` : ''}`);
    console.log(`   Failed: ${failed.length} ${failed.length ? `(${failed.map((f) => f.id).join(', ')})` : ''}`);

    return results;
  }
}

// Export singleton instance
export const migrationRunner = new MigrationRunner();
