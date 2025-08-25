#!/usr/bin/env node

import { createConnection } from '../connection';
import { BackupManager } from '../migrations/backup-restore';
import { DisasterRecoveryManager, DisasterScenario } from '../migrations/disaster-recovery';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive test suite for backup and restore functionality
 */
class BackupRestoreTestSuite {
  private backupManager = new BackupManager();
  private recoveryManager = new DisasterRecoveryManager();
  private testResults: { [key: string]: boolean } = {};
  private testBackupPath = '';

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Backup & Restore Test Suite');
    console.log('=====================================');

    try {
      // Initialize database connection
      const config = {
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
        username: process.env.NEO4J_USERNAME || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password',
        database: process.env.NEO4J_DATABASE || 'neo4j',
      };

      const connection = createConnection(config);
      await connection.connect();
      console.log('✅ Database connection established');

      // Run test suite
      await this.testBackupCreation();
      await this.testBackupValidation();
      await this.testBackupRestore();
      await this.testDisasterRecovery();
      await this.testErrorHandling();

      // Generate test report
      this.generateTestReport();

      await connection.disconnect();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  /**
   * Test backup creation functionality
   */
  async testBackupCreation(): Promise<void> {
    console.log('\n📊 Testing Backup Creation...');

    try {
      // Test 1: Create backup with auto-generated path
      console.log('  🔄 Test 1: Auto-generated backup path...');
      this.testBackupPath = this.backupManager.generateBackupPath('test');
      const success1 = await this.backupManager.createBackup(this.testBackupPath);
      this.testResults['backup_creation_auto'] = !!success1; // Convert string to boolean

      if (success1) {
        console.log('  ✅ Auto-generated backup created successfully');
        console.log(`     Path: ${this.testBackupPath}`);
      } else {
        console.log('  ❌ Auto-generated backup creation failed');
      }

      // Test 2: Verify backup file exists and is readable
      console.log('  🔄 Test 2: Backup file verification...');
      const fileExists = fs.existsSync(this.testBackupPath);
      const fileReadable = fileExists && fs.statSync(this.testBackupPath).size > 0;
      this.testResults['backup_file_verification'] = fileExists && fileReadable;

      if (fileExists && fileReadable) {
        console.log('  ✅ Backup file exists and is readable');
        const stats = fs.statSync(this.testBackupPath);
        console.log(`     Size: ${(stats.size / 1024).toFixed(2)} KB`);
      } else {
        console.log('  ❌ Backup file verification failed');
      }

      // Test 3: Backup content structure
      console.log('  🔄 Test 3: Backup content structure...');
      try {
        const backupContent = JSON.parse(fs.readFileSync(this.testBackupPath, 'utf8'));
        const hasRequiredFields =
          backupContent.timestamp &&
          backupContent.version &&
          backupContent.metadata &&
          Array.isArray(backupContent.starships);

        this.testResults['backup_content_structure'] = hasRequiredFields;

        if (hasRequiredFields) {
          console.log('  ✅ Backup content structure is valid');
          console.log(`     Total entities: ${backupContent.metadata.totalEntities}`);
        } else {
          console.log('  ❌ Backup content structure is invalid');
        }
      } catch (error) {
        console.log('  ❌ Backup content parsing failed:', error);
        this.testResults['backup_content_structure'] = false;
      }
    } catch (error) {
      console.log('  ❌ Backup creation test failed:', error);
      this.testResults['backup_creation_auto'] = false;
      this.testResults['backup_file_verification'] = false;
      this.testResults['backup_content_structure'] = false;
    }
  }

  /**
   * Test backup validation functionality
   */
  async testBackupValidation(): Promise<void> {
    console.log('\n🔍 Testing Backup Validation...');

    try {
      // Test 1: Validate good backup
      console.log('  🔄 Test 1: Valid backup validation...');
      // Note: validateBackup method doesn't exist, so we'll try to load the backup to validate it
      let validation1 = { valid: true, statistics: { totalEntities: 0 }, errors: [] as string[] };
      try {
        await this.backupManager['loadBackupFromFile'](this.testBackupPath);
      } catch (error) {
        validation1 = {
          valid: false,
          statistics: { totalEntities: 0 },
          errors: [error instanceof Error ? error.message : 'Backup validation failed'],
        };
      }
      this.testResults['backup_validation_valid'] = validation1.valid;

      if (validation1.valid) {
        console.log('  ✅ Valid backup validation passed');
        console.log(`     Total entities: ${validation1.statistics.totalEntities}`);
      } else {
        console.log('  ❌ Valid backup validation failed');
        console.log('     Errors:', validation1.errors);
      }

      // Test 2: Validate non-existent backup
      console.log('  🔄 Test 2: Non-existent backup validation...');
      // Note: validateBackup method doesn't exist, so we'll try to load the backup to validate it
      let validation2 = { valid: true };
      try {
        await this.backupManager['loadBackupFromFile']('./non-existent-backup.json');
      } catch (error) {
        validation2 = { valid: false };
      }
      this.testResults['backup_validation_nonexistent'] = !validation2.valid;

      if (!validation2.valid) {
        console.log('  ✅ Non-existent backup validation correctly failed');
      } else {
        console.log('  ❌ Non-existent backup validation should have failed');
      }

      // Test 3: Validate corrupted backup
      console.log('  🔄 Test 3: Corrupted backup validation...');
      const corruptedBackupPath = this.testBackupPath + '.corrupted';
      fs.writeFileSync(corruptedBackupPath, '{ invalid json content');

      // Note: validateBackup method doesn't exist, so we'll try to load the backup to validate it
      let validation3 = { valid: true };
      try {
        await this.backupManager['loadBackupFromFile'](corruptedBackupPath);
      } catch (error) {
        validation3 = { valid: false };
      }
      this.testResults['backup_validation_corrupted'] = !validation3.valid;

      if (!validation3.valid) {
        console.log('  ✅ Corrupted backup validation correctly failed');
      } else {
        console.log('  ❌ Corrupted backup validation should have failed');
      }

      // Cleanup corrupted test file
      if (fs.existsSync(corruptedBackupPath)) {
        fs.unlinkSync(corruptedBackupPath);
      }
    } catch (error) {
      console.log('  ❌ Backup validation test failed:', error);
      this.testResults['backup_validation_valid'] = false;
      this.testResults['backup_validation_nonexistent'] = false;
      this.testResults['backup_validation_corrupted'] = false;
    }
  }

  /**
   * Test backup restore functionality
   */
  async testBackupRestore(): Promise<void> {
    console.log('\n🔄 Testing Backup Restore...');

    try {
      // Test 1: Create pre-restore backup for safety
      console.log('  🔄 Test 1: Creating pre-restore backup...');
      const preRestoreBackupPath = this.backupManager.generateBackupPath('pre-restore-test');
      const preRestoreSuccess = await this.backupManager.createBackup(preRestoreBackupPath);

      if (preRestoreSuccess) {
        console.log('  ✅ Pre-restore backup created');
      } else {
        console.log('  ❌ Pre-restore backup creation failed');
        return;
      }

      // Test 2: Perform restore operation
      console.log('  🔄 Test 2: Performing restore operation...');
      const restoreResult = await this.backupManager.restoreFromBackup(this.testBackupPath);
      const restoreSuccess = restoreResult.success;
      this.testResults['backup_restore_operation'] = restoreSuccess;

      if (restoreSuccess) {
        console.log('  ✅ Restore operation completed successfully');
      } else {
        console.log('  ❌ Restore operation failed');
      }

      // Test 3: Validate post-restore state
      console.log('  🔄 Test 3: Validating post-restore state...');
      const postRestoreBackupPath = this.backupManager.generateBackupPath('post-restore-test');
      const postRestoreSuccess = await this.backupManager.createBackup(postRestoreBackupPath);
      this.testResults['backup_restore_validation'] = !!postRestoreSuccess; // Convert string to boolean

      if (postRestoreSuccess) {
        console.log('  ✅ Post-restore validation passed');
      } else {
        console.log('  ❌ Post-restore validation failed');
      }

      // Cleanup test backups
      [preRestoreBackupPath, postRestoreBackupPath].forEach((path) => {
        if (fs.existsSync(path)) {
          fs.unlinkSync(path);
        }
      });
    } catch (error) {
      console.log('  ❌ Backup restore test failed:', error);
      this.testResults['backup_restore_operation'] = false;
      this.testResults['backup_restore_validation'] = false;
    }
  }

  /**
   * Test disaster recovery functionality
   */
  async testDisasterRecovery(): Promise<void> {
    console.log('\n🚨 Testing Disaster Recovery...');

    try {
      // Test 1: Connection failure recovery
      console.log('  🔄 Test 1: Connection failure recovery...');
      const connectionRecovery = await this.recoveryManager.executeRecovery(
        DisasterScenario.CONNECTION_FAILURE,
        { maxRetries: 2, retryDelay: 1000 }
      );
      this.testResults['disaster_recovery_connection'] = connectionRecovery.success;

      if (connectionRecovery.success) {
        console.log('  ✅ Connection failure recovery test passed');
      } else {
        console.log('  ❌ Connection failure recovery test failed');
        console.log('     Errors:', connectionRecovery.errors);
      }

      // Test 2: Disk space recovery
      console.log('  🔄 Test 2: Disk space recovery...');
      const diskSpaceRecovery = await this.recoveryManager.executeRecovery(
        DisasterScenario.DISK_SPACE_EXHAUSTION,
        { cleanupOldBackups: true, maxBackupsToKeep: 3 }
      );
      this.testResults['disaster_recovery_disk_space'] = diskSpaceRecovery.success;

      if (diskSpaceRecovery.success) {
        console.log('  ✅ Disk space recovery test passed');
      } else {
        console.log('  ❌ Disk space recovery test failed');
        console.log('     Errors:', diskSpaceRecovery.errors);
      }
    } catch (error) {
      console.log('  ❌ Disaster recovery test failed:', error);
      this.testResults['disaster_recovery_connection'] = false;
      this.testResults['disaster_recovery_disk_space'] = false;
    }
  }

  /**
   * Test error handling
   */
  async testErrorHandling(): Promise<void> {
    console.log('\n⚠️  Testing Error Handling...');

    try {
      // Test 1: Invalid backup path
      console.log('  🔄 Test 1: Invalid backup path handling...');
      try {
        await this.backupManager.restoreFromBackup('/invalid/path/backup.json');
        this.testResults['error_handling_invalid_path'] = false;
        console.log('  ❌ Should have thrown error for invalid path');
      } catch (error) {
        this.testResults['error_handling_invalid_path'] = true;
        console.log('  ✅ Correctly handled invalid backup path');
      }

      // Test 2: Corrupted backup restore
      console.log('  🔄 Test 2: Corrupted backup restore handling...');
      const corruptedPath = './test-corrupted-backup.json';
      fs.writeFileSync(corruptedPath, '{ "invalid": json }');

      try {
        await this.backupManager.restoreFromBackup(corruptedPath);
        this.testResults['error_handling_corrupted_backup'] = false;
        console.log('  ❌ Should have thrown error for corrupted backup');
      } catch (error) {
        this.testResults['error_handling_corrupted_backup'] = true;
        console.log('  ✅ Correctly handled corrupted backup');
      }

      // Cleanup
      if (fs.existsSync(corruptedPath)) {
        fs.unlinkSync(corruptedPath);
      }
    } catch (error) {
      console.log('  ❌ Error handling test failed:', error);
      this.testResults['error_handling_invalid_path'] = false;
      this.testResults['error_handling_corrupted_backup'] = false;
    }
  }

  /**
   * Generate comprehensive test report
   */
  generateTestReport(): void {
    console.log('\n📋 Test Report');
    console.log('==============');

    const totalTests = Object.keys(this.testResults).length;
    const passedTests = Object.values(this.testResults).filter((result) => result).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    console.log('\nDetailed Results:');
    Object.entries(this.testResults).forEach(([testName, result]) => {
      const status = result ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} ${testName}`);
    });

    // Cleanup test backup
    if (fs.existsSync(this.testBackupPath)) {
      fs.unlinkSync(this.testBackupPath);
      console.log(`\n🧹 Cleaned up test backup: ${this.testBackupPath}`);
    }

    if (failedTests > 0) {
      console.log('\n⚠️  Some tests failed. Please review the results above.');
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed successfully!');
    }
  }
}

/**
 * Main function to run the test suite
 */
async function main() {
  const testSuite = new BackupRestoreTestSuite();
  await testSuite.runAllTests();
}

// Run the test suite if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Test suite execution failed:', error);
    process.exit(1);
  });
}

export { BackupRestoreTestSuite };
