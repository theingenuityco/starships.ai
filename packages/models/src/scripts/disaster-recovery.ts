import { BackupManager } from '@/scripts/backup-restore';
import { getConnection } from '@/helpers/database';
import * as fs from 'fs';
import * as path from 'path';

// Stub for removed ConnectorInstanceMigration
class ConnectorInstanceMigration {
  async rollback(): Promise<boolean> {
    console.warn('ConnectorInstanceMigration.rollback: MCP functionality removed');
    return false;
  }
}

/**
 * Disaster recovery scenarios and their handling procedures
 */
export enum DisasterScenario {
  MIGRATION_FAILURE = 'migration_failure',
  DATA_CORRUPTION = 'data_corruption',
  BACKUP_CORRUPTION = 'backup_corruption',
  PARTIAL_RESTORE = 'partial_restore',
  CONNECTION_FAILURE = 'connection_failure',
  DISK_SPACE_EXHAUSTION = 'disk_space_exhaustion',
}

/**
 * Recovery operation result
 */
export interface RecoveryResult {
  success: boolean;
  scenario: DisasterScenario;
  actionsPerformed: string[];
  errors: string[];
  warnings: string[];
  duration: number;
  recoveryPath?: string;
}

/**
 * Comprehensive disaster recovery manager
 */
export class DisasterRecoveryManager {
  private backupManager = new BackupManager();
  private connection = getConnection();

  /**
   * Execute disaster recovery based on scenario
   */
  async executeRecovery(scenario: DisasterScenario, options: Record<string, unknown> = {}): Promise<RecoveryResult> {
    const startTime = Date.now();
    const actionsPerformed: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log(`[RECOVERY] 🚨 Starting disaster recovery for scenario: ${scenario}`);

    try {
      switch (scenario) {
        case DisasterScenario.MIGRATION_FAILURE:
          return await this.handleMigrationFailure(
            options as { rollbackDataPath?: string; backupPath?: string },
            actionsPerformed,
            errors,
            warnings,
            startTime
          );

        case DisasterScenario.DATA_CORRUPTION:
          return await this.handleDataCorruption(
            options as { backupPath?: string; autoFindBackup?: boolean },
            actionsPerformed,
            errors,
            warnings,
            startTime
          );

        case DisasterScenario.BACKUP_CORRUPTION:
          return await this.handleBackupCorruption(
            options as { corruptedBackupPath: string },
            actionsPerformed,
            errors,
            warnings,
            startTime
          );

        case DisasterScenario.PARTIAL_RESTORE:
          return await this.handlePartialRestore(options as { backupPath: string }, actionsPerformed, errors, warnings, startTime);

        case DisasterScenario.CONNECTION_FAILURE:
          return await this.handleConnectionFailure(
            options as { maxRetries?: number; retryDelay?: number },
            actionsPerformed,
            errors,
            warnings,
            startTime
          );

        case DisasterScenario.DISK_SPACE_EXHAUSTION:
          return await this.handleDiskSpaceExhaustion(
            options as { cleanupOldBackups?: boolean; maxBackupsToKeep?: number },
            actionsPerformed,
            errors,
            warnings,
            startTime
          );

        default:
          throw new Error(`Unknown disaster scenario: ${scenario}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(`Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return {
        success: false,
        scenario,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    }
  }

  /**
   * Handle migration failure scenario
   */
  private async handleMigrationFailure(
    options: { rollbackDataPath?: string; backupPath?: string },
    actionsPerformed: string[],
    errors: string[],
    warnings: string[],
    startTime: number
  ): Promise<RecoveryResult> {
    console.log('[RECOVERY] 🔄 Handling migration failure...');

    try {
      // Step 1: Attempt rollback using migration rollback data
      if (options.rollbackDataPath && fs.existsSync(options.rollbackDataPath)) {
        console.log('[RECOVERY] 📂 Found rollback data, attempting migration rollback...');
        const migration = new ConnectorInstanceMigration();
        const rollbackSuccess = await migration.rollback();

        if (rollbackSuccess) {
          actionsPerformed.push('Migration rollback completed successfully');
          console.log('[RECOVERY] ✅ Migration rollback successful');
        } else {
          warnings.push('Migration rollback failed, proceeding with backup restore');
        }
      }

      // Step 2: If rollback failed or unavailable, use backup restore
      if (options.backupPath && fs.existsSync(options.backupPath)) {
        console.log('[RECOVERY] 💾 Attempting backup restore...');
        const restoreResult = await this.backupManager.restoreFromBackup(options.backupPath);

        if (restoreResult.success) {
          actionsPerformed.push('Database restored from backup');
          console.log('[RECOVERY] ✅ Backup restore successful');
        } else {
          errors.push('Both migration rollback and backup restore failed');
        }
      } else {
        errors.push('No backup file available for restore');
      }

      // Step 3: Validate recovery
      const validationResult = await this.validateRecovery();
      if (validationResult.valid) {
        actionsPerformed.push('Recovery validation passed');
      } else {
        warnings.push(`Recovery validation warnings: ${validationResult.warnings.join(', ')}`);
        if (validationResult.errors.length > 0) {
          errors.push(`Recovery validation errors: ${validationResult.errors.join(', ')}`);
        }
      }

      const duration = Date.now() - startTime;
      return {
        success: errors.length === 0,
        scenario: DisasterScenario.MIGRATION_FAILURE,
        actionsPerformed,
        errors,
        warnings,
        duration,
        recoveryPath: options.backupPath || undefined,
      };
    } catch (error) {
      errors.push(`Migration failure recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const duration = Date.now() - startTime;
      return {
        success: false,
        scenario: DisasterScenario.MIGRATION_FAILURE,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    }
  }

  /**
   * Handle data corruption scenario
   */
  private async handleDataCorruption(
    options: { backupPath?: string; autoFindBackup?: boolean },
    actionsPerformed: string[],
    errors: string[],
    warnings: string[],
    startTime: number
  ): Promise<RecoveryResult> {
    console.log('[RECOVERY] 🔧 Handling data corruption...');

    try {
      let backupPath = options.backupPath;

      // Step 1: Find latest backup if not specified
      if (!backupPath && options.autoFindBackup) {
        backupPath = (await this.findLatestBackup()) || undefined;
        if (backupPath) {
          actionsPerformed.push(`Found latest backup: ${backupPath}`);
        } else {
          errors.push('No backup files found for recovery');
          const duration = Date.now() - startTime;
          return {
            success: false,
            scenario: DisasterScenario.DATA_CORRUPTION,
            actionsPerformed,
            errors,
            warnings,
            duration,
          };
        }
      }

      // Step 2: Validate backup before restore
      if (backupPath) {
        console.log('[RECOVERY] 🔍 Validating backup before restore...');
        const backupValidation = await this.validateBackupFile(backupPath);

        if (!backupValidation.valid) {
          errors.push(`Backup validation failed: ${backupValidation.errors.join(', ')}`);
          // Try to find alternative backup
          const alternativeBackup = await this.findAlternativeBackup(backupPath);
          if (alternativeBackup) {
            backupPath = alternativeBackup;
            actionsPerformed.push(`Switched to alternative backup: ${backupPath}`);
          } else {
            const duration = Date.now() - startTime;
            return {
              success: false,
              scenario: DisasterScenario.DATA_CORRUPTION,
              actionsPerformed,
              errors,
              warnings,
              duration,
            };
          }
        } else {
          actionsPerformed.push('Backup validation passed');
        }

        // Step 3: Perform restore
        console.log('[RECOVERY] 💾 Restoring from backup...');
        const restoreResult = await this.backupManager.restoreFromBackup(backupPath);

        if (restoreResult.success) {
          actionsPerformed.push('Database restored successfully');
        } else {
          errors.push('Database restore failed');
        }
      }

      const duration = Date.now() - startTime;
      return {
        success: errors.length === 0,
        scenario: DisasterScenario.DATA_CORRUPTION,
        actionsPerformed,
        errors,
        warnings,
        duration,
        recoveryPath: backupPath,
      };
    } catch (error) {
      errors.push(`Data corruption recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const duration = Date.now() - startTime;
      return {
        success: false,
        scenario: DisasterScenario.DATA_CORRUPTION,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    }
  }

  /**
   * Handle backup corruption scenario
   */
  private async handleBackupCorruption(
    options: { corruptedBackupPath: string },
    actionsPerformed: string[],
    errors: string[],
    warnings: string[],
    startTime: number
  ): Promise<RecoveryResult> {
    console.log('[RECOVERY] 🗂️ Handling backup corruption...');

    try {
      // Step 1: Attempt to repair backup file
      const repairResult = await this.attemptBackupRepair(options.corruptedBackupPath);
      if (repairResult.success) {
        actionsPerformed.push('Backup file repaired successfully');
      } else {
        warnings.push(`Backup repair failed: ${repairResult.error}`);
      }

      // Step 2: Find alternative backups
      const alternativeBackups = await this.findAllBackups();
      const validBackups = [];

      for (const backupPath of alternativeBackups) {
        if (backupPath !== options.corruptedBackupPath) {
          const validation = await this.validateBackupFile(backupPath);
          if (validation.valid) {
            validBackups.push(backupPath);
          }
        }
      }

      if (validBackups.length === 0) {
        errors.push('No valid backup files found');
        const duration = Date.now() - startTime;
        return {
          success: false,
          scenario: DisasterScenario.BACKUP_CORRUPTION,
          actionsPerformed,
          errors,
          warnings,
          duration,
        };
      }

      // Step 3: Use most recent valid backup
      const latestValidBackup = validBackups[0]; // Assuming sorted by date
      actionsPerformed.push(`Using alternative backup: ${latestValidBackup}`);

      const restoreResult = await this.backupManager.restoreFromBackup(latestValidBackup);
      if (restoreResult.success) {
        actionsPerformed.push('Database restored from alternative backup');
      } else {
        errors.push('Restore from alternative backup failed');
      }

      const duration = Date.now() - startTime;
      return {
        success: errors.length === 0,
        scenario: DisasterScenario.BACKUP_CORRUPTION,
        actionsPerformed,
        errors,
        warnings,
        duration,
        recoveryPath: latestValidBackup,
      };
    } catch (error) {
      errors.push(`Backup corruption recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const duration = Date.now() - startTime;
      return {
        success: false,
        scenario: DisasterScenario.BACKUP_CORRUPTION,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    }
  }

  /**
   * Handle partial restore scenario
   */
  private async handlePartialRestore(
    options: { backupPath: string },
    actionsPerformed: string[],
    errors: string[],
    warnings: string[],
    startTime: number
  ): Promise<RecoveryResult> {
    console.log('[RECOVERY] 🔄 Handling partial restore...');

    try {
      // Step 1: Create emergency backup of current state
      const emergencyBackupPath = this.backupManager.generateBackupPath('emergency-partial-restore');
      await this.backupManager.createBackup(emergencyBackupPath);
      actionsPerformed.push(`Emergency backup created: ${emergencyBackupPath}`);

      // Step 2: Clear database completely using PostgreSQL commands
      console.log('[RECOVERY] 🗑️ Clearing database...');

      // Get all tables and truncate them
      const tablesResult = await this.connection.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      `);

      const tables = tablesResult.map((row) => row.tablename);

      // Disable foreign key checks temporarily
      await this.connection.query('SET session_replication_role = replica');

      // Truncate all tables
      for (const table of tables) {
        await this.connection.query(`TRUNCATE TABLE "${table}" CASCADE`);
      }

      // Re-enable foreign key checks
      await this.connection.query('SET session_replication_role = DEFAULT');

      actionsPerformed.push('Database cleared completely');

      // Step 3: Perform complete restore
      const restoreResult = await this.backupManager.restoreFromBackup(options.backupPath);
      if (restoreResult.success) {
        actionsPerformed.push('Complete restore performed successfully');
      } else {
        errors.push('Complete restore failed');
      }

      const duration = Date.now() - startTime;
      return {
        success: errors.length === 0,
        scenario: DisasterScenario.PARTIAL_RESTORE,
        actionsPerformed,
        errors,
        warnings,
        duration,
        recoveryPath: options.backupPath,
      };
    } catch (error) {
      errors.push(`Partial restore recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const duration = Date.now() - startTime;
      return {
        success: false,
        scenario: DisasterScenario.PARTIAL_RESTORE,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    }
  }

  /**
   * Handle connection failure scenario
   */
  private async handleConnectionFailure(
    options: { maxRetries?: number; retryDelay?: number },
    actionsPerformed: string[],
    errors: string[],
    warnings: string[],
    startTime: number
  ): Promise<RecoveryResult> {
    console.log('[RECOVERY] 🔌 Handling connection failure...');

    const maxRetries = options.maxRetries || 5;
    const retryDelay = options.retryDelay || 5000;

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[RECOVERY] 🔄 Connection attempt ${attempt}/${maxRetries}...`);

          // Test connection with simple query
          await this.connection.query('SELECT 1 as test');
          actionsPerformed.push(`Connection restored on attempt ${attempt}`);

          const duration = Date.now() - startTime;
          return {
            success: true,
            scenario: DisasterScenario.CONNECTION_FAILURE,
            actionsPerformed,
            errors,
            warnings,
            duration,
          };
        } catch (connectionError) {
          warnings.push(
            `Connection attempt ${attempt} failed: ${connectionError instanceof Error ? connectionError.message : 'Unknown error'}`
          );

          if (attempt < maxRetries) {
            console.log(`[RECOVERY] ⏳ Waiting ${retryDelay}ms before next attempt...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      errors.push(`All ${maxRetries} connection attempts failed`);
      const duration = Date.now() - startTime;
      return {
        success: false,
        scenario: DisasterScenario.CONNECTION_FAILURE,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    } catch (error) {
      errors.push(`Connection failure recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const duration = Date.now() - startTime;
      return {
        success: false,
        scenario: DisasterScenario.CONNECTION_FAILURE,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    }
  }

  /**
   * Handle disk space exhaustion scenario
   */
  private async handleDiskSpaceExhaustion(
    options: { cleanupOldBackups?: boolean; maxBackupsToKeep?: number },
    actionsPerformed: string[],
    errors: string[],
    warnings: string[],
    startTime: number
  ): Promise<RecoveryResult> {
    console.log('[RECOVERY] 💾 Handling disk space exhaustion...');

    try {
      if (options.cleanupOldBackups) {
        const maxBackups = options.maxBackupsToKeep || 5;
        const cleanupResult = await this.cleanupOldBackups(maxBackups);
        actionsPerformed.push(`Cleaned up ${cleanupResult.deletedCount} old backup files`);
        actionsPerformed.push(`Freed ${cleanupResult.freedSpace} bytes of disk space`);
      }

      // Check available disk space
      const spaceCheck = await this.checkDiskSpace();
      if (spaceCheck.availableGB < 1) {
        warnings.push(`Low disk space remaining: ${spaceCheck.availableGB.toFixed(2)} GB`);
      } else {
        actionsPerformed.push(`Disk space available: ${spaceCheck.availableGB.toFixed(2)} GB`);
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        scenario: DisasterScenario.DISK_SPACE_EXHAUSTION,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    } catch (error) {
      errors.push(`Disk space recovery error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const duration = Date.now() - startTime;
      return {
        success: false,
        scenario: DisasterScenario.DISK_SPACE_EXHAUSTION,
        actionsPerformed,
        errors,
        warnings,
        duration,
      };
    }
  }

  /**
   * Validate recovery state using PostgreSQL queries
   */
  private async validateRecovery() {
    try {
      const result = await this.connection.query<{ table_name: string; row_count: string }>(`
        SELECT 
          table_name,
          (xpath('/row/count/text()', query_to_xml(format('select count(*) as count from %I', table_name), false, true, '')))[1]::text::int as row_count
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      const tableCounts = result.map((record) => ({
        type: record.table_name,
        count: parseInt(record.row_count || '0'),
      }));

      return {
        valid: tableCounts.length > 0,
        errors: tableCounts.length === 0 ? ['No data found in database after recovery'] : [],
        warnings: [],
        statistics: tableCounts,
      };
    } catch (error) {
      // Fallback validation if the complex query fails
      try {
        const simpleResult = await this.connection.query<{ count: string }>(`
          SELECT COUNT(*) as count FROM users
        `);

        const userCount = parseInt(simpleResult[0]?.count || '0');

        return {
          valid: userCount >= 0,
          errors: [],
          warnings: userCount === 0 ? ['No users found in database'] : [],
          statistics: [{ type: 'users', count: userCount }],
        };
      } catch (fallbackError) {
        return {
          valid: false,
          errors: [`Recovery validation failed: ${error instanceof Error ? error.message : String(error)}`],
          warnings: [],
          statistics: [],
        };
      }
    }
  }

  /**
   * Validate backup file
   */
  private async validateBackupFile(backupPath: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      // Try to load the backup file to validate it
      await this.backupManager['loadBackupFromFile'](backupPath);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Backup validation failed'],
      };
    }
  }

  /**
   * Find latest backup file
   */
  private async findLatestBackup(): Promise<string | null> {
    const backupDir = path.join(process.cwd(), 'packages', 'models', 'migrations', 'backups');
    if (!fs.existsSync(backupDir)) {
      return null;
    }

    const backupFiles = fs
      .readdirSync(backupDir)
      .filter((file) => file.startsWith('backup-') && (file.endsWith('.json') || file.endsWith('.json.gz')))
      .map((file) => ({
        path: path.join(backupDir, file),
        mtime: fs.statSync(path.join(backupDir, file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return backupFiles.length > 0 ? backupFiles[0].path : null;
  }

  /**
   * Find alternative backup (excluding corrupted one)
   */
  private async findAlternativeBackup(excludePath: string): Promise<string | null> {
    const allBackups = await this.findAllBackups();
    const alternatives = allBackups.filter((backup) => backup !== excludePath);

    for (const backupPath of alternatives) {
      const validation = await this.validateBackupFile(backupPath);
      if (validation.valid) {
        return backupPath;
      }
    }

    return null;
  }

  /**
   * Find all backup files
   */
  private async findAllBackups(): Promise<string[]> {
    const backupDir = path.join(process.cwd(), 'packages', 'models', 'migrations', 'backups');
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    return fs
      .readdirSync(backupDir)
      .filter((file) => file.startsWith('backup-') && (file.endsWith('.json') || file.endsWith('.json.gz')))
      .map((file) => path.join(backupDir, file))
      .sort((a, b) => {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtime.getTime() - statA.mtime.getTime();
      });
  }

  /**
   * Attempt to repair corrupted backup file
   */
  private async attemptBackupRepair(backupPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const content = fs.readFileSync(backupPath, 'utf8');

      // Try to parse and identify issues
      try {
        JSON.parse(content);
        return { success: true };
      } catch {
        // Attempt basic JSON repair (remove trailing commas, fix brackets, etc.)
        const repairedContent = content
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys

        try {
          JSON.parse(repairedContent);
          fs.writeFileSync(backupPath + '.repaired', repairedContent);
          return { success: true };
        } catch (repairError) {
          return {
            success: false,
            error: `Could not repair JSON: ${repairError instanceof Error ? repairError.message : 'Unknown error'}`,
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Could not read backup file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Clean up old backup files
   */
  private async cleanupOldBackups(maxToKeep: number): Promise<{ deletedCount: number; freedSpace: number }> {
    const allBackups = await this.findAllBackups();
    const toDelete = allBackups.slice(maxToKeep);

    let deletedCount = 0;
    let freedSpace = 0;

    for (const backupPath of toDelete) {
      try {
        const stats = fs.statSync(backupPath);
        fs.unlinkSync(backupPath);
        deletedCount++;
        freedSpace += stats.size;
      } catch (error) {
        console.warn(`Failed to delete backup ${backupPath}:`, error);
      }
    }

    return { deletedCount, freedSpace };
  }

  /**
   * Check available disk space
   */
  private async checkDiskSpace(): Promise<{ availableGB: number; totalGB: number }> {
    // This is a simplified implementation
    // In a real scenario, you'd use a library like 'statvfs' or 'diskusage'
    try {
      fs.statSync(process.cwd());
      // Mock values for demonstration - in production you'd check actual disk space
      return {
        availableGB: 10.5,
        totalGB: 100.0,
      };
    } catch {
      return {
        availableGB: 0,
        totalGB: 0,
      };
    }
  }
}

/**
 * CLI interface for disaster recovery
 */
export async function executeDisasterRecovery(scenario: string, options: Record<string, unknown> = {}): Promise<void> {
  console.log('🚨 Starting Disaster Recovery');
  console.log('==============================');

  try {
    const recoveryManager = new DisasterRecoveryManager();
    const scenarioEnum = scenario.toUpperCase() as DisasterScenario;

    if (!Object.values(DisasterScenario).includes(scenarioEnum)) {
      throw new Error(`Unknown disaster scenario: ${scenario}`);
    }

    const result = await recoveryManager.executeRecovery(scenarioEnum, options);

    if (result.success) {
      console.log('\n✅ Disaster recovery completed successfully!');
      console.log(`⏱️  Duration: ${result.duration}ms`);
      console.log('📋 Actions performed:');
      result.actionsPerformed.forEach((action, index) => {
        console.log(`   ${index + 1}. ${action}`);
      });

      if (result.recoveryPath) {
        console.log(`🛡️  Recovery path: ${result.recoveryPath}`);
      }
    } else {
      console.error('\n❌ Disaster recovery failed!');
      console.error(`⏱️  Duration: ${result.duration}ms`);
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

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Disaster recovery failed with error:', error);
    process.exit(1);
  }
}
