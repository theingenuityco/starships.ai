import { getConnection } from '@/helpers/database';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BackupMetadata {
  timestamp: string;
  version: string;
  environment: string;
  tableCount: number;
  recordCount: number;
  backupType: 'full' | 'incremental';
  compressionUsed: boolean;
  databaseSize: string;
}

export interface BackupData {
  metadata: BackupMetadata;
  sqlDump: string;
}

export interface RestoreResult {
  success: boolean;
  restoredTables: number;
  restoredRecords: number;
  errors: string[];
  duration: number;
}

/**
 * Comprehensive backup and restore manager for PostgreSQL database
 */
export class BackupManager {
  private connection = getConnection();
  private backupDir: string;

  constructor() {
    this.backupDir = path.join(process.cwd(), 'packages', 'models', 'migrations', 'backups');
    this.ensureBackupDirectory();
  }

  /**
   * Create a comprehensive backup of the database using pg_dump
   */
  async createBackup(backupPath?: string): Promise<string> {
    const startTime = Date.now();
    console.log('[BACKUP] 💾 Creating database backup...');

    const finalBackupPath = backupPath || this.generateBackupPath('manual');

    try {
      // Gather metadata
      const metadata = await this.gatherBackupMetadata();
      console.log(`[BACKUP] 📊 Backup metadata: ${metadata.tableCount} tables, ${metadata.recordCount} records`);

      // Get PostgreSQL connection parameters from environment
      const host = process.env.POSTGRES_HOST || 'localhost';
      const port = process.env.POSTGRES_PORT || '5432';
      const user = process.env.POSTGRES_USER || 'postgres';
      const database = process.env.POSTGRES_DATABASE || 'starships';

      // Use pg_dump to create backup
      console.log('[BACKUP] 📦 Creating database dump...');
      const dumpCommand = `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} --no-password --clean --if-exists --create`;

      // Set PGPASSWORD environment variable for authentication
      const env = { ...process.env };
      if (process.env.POSTGRES_PASSWORD) {
        env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
      }

      const { stdout, stderr } = await execAsync(dumpCommand, { env, maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer

      if (stderr && !stderr.includes('NOTICE:')) {
        console.warn('[BACKUP] ⚠️ pg_dump warnings:', stderr);
      }

      // Create backup data structure
      const backupData: BackupData = {
        metadata,
        sqlDump: stdout,
      };

      // Write backup to file
      await this.writeBackupToFile(backupData, finalBackupPath);

      const duration = Date.now() - startTime;
      console.log(`[BACKUP] ✅ Backup completed in ${duration}ms: ${finalBackupPath}`);

      return finalBackupPath;
    } catch (error) {
      console.error('[BACKUP] ❌ Backup failed:', error);
      throw new Error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Restore database from backup using psql
   */
  async restoreFromBackup(backupPath: string): Promise<RestoreResult> {
    const startTime = Date.now();
    console.log(`[RESTORE] 🔄 Restoring database from backup: ${backupPath}`);

    const result: RestoreResult = {
      success: false,
      restoredTables: 0,
      restoredRecords: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Load backup data
      const backupData = await this.loadBackupFromFile(backupPath);
      console.log(`[RESTORE] 📊 Backup from: ${backupData.metadata.timestamp}`);

      // Get PostgreSQL connection parameters
      const host = process.env.POSTGRES_HOST || 'localhost';
      const port = process.env.POSTGRES_PORT || '5432';
      const user = process.env.POSTGRES_USER || 'postgres';
      const database = process.env.POSTGRES_DATABASE || 'starships';

      // Write SQL dump to temporary file
      const tempSqlFile = path.join(this.backupDir, `temp_restore_${Date.now()}.sql`);
      fs.writeFileSync(tempSqlFile, backupData.sqlDump, 'utf8');

      try {
        // Use psql to restore database
        console.log('[RESTORE] 🔄 Executing database restore...');
        const restoreCommand = `psql -h ${host} -p ${port} -U ${user} -d ${database} --no-password -f ${tempSqlFile}`;

        const env = { ...process.env };
        if (process.env.POSTGRES_PASSWORD) {
          env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
        }

        const { stderr } = await execAsync(restoreCommand, { env, maxBuffer: 50 * 1024 * 1024 });

        if (stderr && !stderr.includes('NOTICE:') && !stderr.includes('already exists')) {
          console.warn('[RESTORE] ⚠️ psql warnings:', stderr);
        }

        // Count restored data
        const postRestoreMetadata = await this.gatherBackupMetadata();
        result.restoredTables = postRestoreMetadata.tableCount;
        result.restoredRecords = postRestoreMetadata.recordCount;

        result.success = true;
        result.duration = Date.now() - startTime;

        console.log(`[RESTORE] ✅ Restore completed in ${result.duration}ms`);
        console.log(`[RESTORE] 📊 Restored: ${result.restoredTables} tables, ${result.restoredRecords} records`);
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tempSqlFile)) {
          fs.unlinkSync(tempSqlFile);
        }
      }

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.duration = Date.now() - startTime;
      console.error('[RESTORE] ❌ Restore failed:', error);
      return result;
    }
  }

  /**
   * Generate backup path with timestamp
   */
  generateBackupPath(type: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${type}-${timestamp}.json.gz`;
    return path.join(this.backupDir, filename);
  }

  /**
   * List available backups
   */
  listBackups(): string[] {
    if (!fs.existsSync(this.backupDir)) {
      return [];
    }

    return fs
      .readdirSync(this.backupDir)
      .filter((file) => file.startsWith('backup-') && (file.endsWith('.json') || file.endsWith('.json.gz')))
      .sort()
      .reverse(); // Most recent first
  }

  /**
   * Delete old backups based on retention policy
   */
  cleanupOldBackups(retentionDays: number = 30): number {
    console.log(`[BACKUP] 🧹 Cleaning up backups older than ${retentionDays} days...`);

    const backups = this.listBackups();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;

    for (const backup of backups) {
      const backupPath = path.join(this.backupDir, backup);
      const stats = fs.statSync(backupPath);

      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(backupPath);
        deletedCount++;
        console.log(`[BACKUP] 🗑️ Deleted old backup: ${backup}`);
      }
    }

    console.log(`[BACKUP] ✅ Cleanup completed: ${deletedCount} backups deleted`);
    return deletedCount;
  }

  /**
   * Gather backup metadata
   */
  private async gatherBackupMetadata(): Promise<BackupMetadata> {
    const tableCountResult = await this.connection.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const recordCountResult = await this.connection.query<{ total: string }>(`
      SELECT 
        (SELECT COUNT(*) FROM users) +
        (SELECT COUNT(*) FROM starships) +
        (SELECT COUNT(*) FROM agents) +
        (SELECT COUNT(*) FROM conversations) +
        (SELECT COUNT(*) FROM messages) +
        (SELECT COUNT(*) FROM workflows) as total
    `);

    const sizeResult = await this.connection.query<{ size: string }>(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);

    return {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      tableCount: parseInt(tableCountResult[0]?.count || '0'),
      recordCount: parseInt(recordCountResult[0]?.total || '0'),
      backupType: 'full',
      compressionUsed: true,
      databaseSize: sizeResult[0]?.size || 'unknown',
    };
  }

  /**
   * Write backup data to file with compression
   */
  private async writeBackupToFile(backupData: BackupData, backupPath: string): Promise<void> {
    const jsonData = JSON.stringify(backupData, null, 2);

    if (backupPath.endsWith('.gz')) {
      // Use gzip compression
      const { gzip } = await import('zlib');
      const { promisify } = await import('util');
      const gzipAsync = promisify(gzip);

      const compressed = await gzipAsync(jsonData);
      fs.writeFileSync(backupPath, compressed);
    } else {
      // Write uncompressed
      fs.writeFileSync(backupPath, jsonData, 'utf8');
    }
  }

  /**
   * Load backup data from file
   */
  private async loadBackupFromFile(backupPath: string): Promise<BackupData> {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    let jsonData: string;

    if (backupPath.endsWith('.gz')) {
      // Decompress the data
      const { gunzip } = await import('zlib');
      const { promisify } = await import('util');
      const gunzipAsync = promisify(gunzip);

      const compressed = fs.readFileSync(backupPath);
      const decompressed = await gunzipAsync(compressed);
      jsonData = decompressed.toString('utf8');
    } else {
      // Read uncompressed
      jsonData = fs.readFileSync(backupPath, 'utf8');
    }

    return JSON.parse(jsonData);
  }

  /**
   * Ensure backup directory exists
   */
  private ensureBackupDirectory(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }
}

/**
 * CLI interface for backup operations
 */
export async function runBackup(): Promise<void> {
  console.log('💾 Database Backup Utility');
  console.log('==========================');

  try {
    const backupManager = new BackupManager();
    const backupPath = await backupManager.createBackup();

    console.log('\n✅ Backup completed successfully!');
    console.log(`📁 Backup saved to: ${backupPath}`);
  } catch (error) {
    console.error('\n❌ Backup failed:', error);
    process.exit(1);
  }
}

/**
 * CLI interface for restore operations
 */
export async function runRestore(): Promise<void> {
  const backupPath = process.argv[3];

  if (!backupPath) {
    console.error('❌ Please provide backup file path');
    console.log('Usage: npm run backup:restore <backup-file-path>');
    process.exit(1);
  }

  console.log('🔄 Database Restore Utility');
  console.log('===========================');
  console.log(`📁 Restoring from: ${backupPath}`);

  try {
    const backupManager = new BackupManager();
    const result = await backupManager.restoreFromBackup(backupPath);

    if (result.success) {
      console.log('\n✅ Restore completed successfully!');
      console.log(`📊 Restored: ${result.restoredTables} tables, ${result.restoredRecords} records`);
    } else {
      console.error('\n❌ Restore failed!');
      result.errors.forEach((error) => console.error(`   - ${error}`));
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Restore failed:', error);
    process.exit(1);
  }
}

// Run backup/restore if this script is executed directly
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'backup') {
    runBackup().catch(console.error);
  } else if (command === 'restore') {
    runRestore().catch(console.error);
  } else {
    console.log('Usage:');
    console.log('  npm run backup:create');
    console.log('  npm run backup:restore <backup-file-path>');
  }
}
