#!/usr/bin/env tsx

import { ConnectorInstanceMigration } from '../packages/models/src/migrations/001-connector-instances';
import { MCPServerConnectorSchemaCreator } from '../packages/models/src/scripts/create-connector-schema';
import { MigrationTestScenarios } from '../packages/models/src/migrations/test-migration-scenarios';
import { DeploymentValidator } from './scripts/deployment-validator';
import { ProductionHealthChecker } from './scripts/production-health-checker';
import { DeploymentReporter } from './scripts/deployment-reporter';
import { BackupManager } from '../packages/models/src/migrations/backup-restore';
import * as fs from 'fs';
import * as path from 'path';

export interface DeploymentConfig {
  environment: 'staging' | 'production';
  skipTests?: boolean;
  skipBackup?: boolean;
  dryRun?: boolean;
  rollbackOnFailure?: boolean;
  healthCheckTimeout?: number;
  validationTimeout?: number;
}

export interface DeploymentResult {
  success: boolean;
  phase: string;
  duration: number;
  errors: string[];
  warnings: string[];
  backupPaths: string[];
  migrationResult?: any;
  validationResult?: any;
  healthCheckResult?: any;
}

/**
 * Comprehensive Connector Instance Deployment Manager
 *
 * Orchestrates the complete deployment process including:
 * - Pre-deployment validation
 * - Schema creation
 * - Data migration
 * - Post-deployment validation
 * - Health checks
 * - Rollback capabilities
 */
export class ConnectorInstanceDeployment {
  private config: DeploymentConfig;
  private reporter: DeploymentReporter;
  private backupManager: BackupManager;
  private startTime: number = 0;

  constructor(config: DeploymentConfig) {
    this.config = {
      rollbackOnFailure: true,
      healthCheckTimeout: 30000,
      validationTimeout: 60000,
      ...config,
    };
    this.reporter = new DeploymentReporter();
    this.backupManager = new BackupManager();
  }

  /**
   * Execute the complete deployment process
   */
  async deploy(): Promise<DeploymentResult> {
    this.startTime = Date.now();

    console.log('🚀 CONNECTOR INSTANCE DEPLOYMENT STARTED');
    console.log('========================================');
    console.log(`📍 Environment: ${this.config.environment.toUpperCase()}`);
    console.log(`🔧 Configuration:`, this.config);
    console.log('');

    const result: DeploymentResult = {
      success: false,
      phase: 'initialization',
      duration: 0,
      errors: [],
      warnings: [],
      backupPaths: [],
    };

    try {
      // Phase 1: Pre-deployment validation and preparation
      await this.executePhase(result, 'pre-deployment', async () => {
        await this.preDeploymentValidation();
        await this.createPreDeploymentBackup(result);
      });

      // Phase 2: Schema creation and validation
      await this.executePhase(result, 'schema-creation', async () => {
        await this.createDatabaseSchema();
      });

      // Phase 3: Run migration tests (unless skipped)
      if (!this.config.skipTests) {
        await this.executePhase(result, 'migration-testing', async () => {
          await this.runMigrationTests();
        });
      }

      // Phase 4: Execute migration (or dry run)
      await this.executePhase(result, 'migration-execution', async () => {
        result.migrationResult = await this.executeMigration();
      });

      // Phase 5: Post-migration validation
      await this.executePhase(result, 'post-migration-validation', async () => {
        result.validationResult = await this.postMigrationValidation();
      });

      // Phase 6: Health checks
      await this.executePhase(result, 'health-checks', async () => {
        result.healthCheckResult = await this.runHealthChecks();
      });

      // Phase 7: Final backup and cleanup
      await this.executePhase(result, 'finalization', async () => {
        await this.createPostDeploymentBackup(result);
        await this.generateDeploymentReport(result);
      });

      result.success = true;
      result.duration = Date.now() - this.startTime;

      console.log('\n🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!');
      console.log(`⏱️  Total Duration: ${result.duration}ms`);
      console.log(`💾 Backups Created: ${result.backupPaths.length}`);

      return result;
    } catch (error) {
      result.success = false;
      result.duration = Date.now() - this.startTime;
      result.errors.push(error instanceof Error ? error.message : String(error));

      console.error('\n❌ DEPLOYMENT FAILED!');
      console.error(`💥 Failed in phase: ${result.phase}`);
      console.error(`⏱️  Duration: ${result.duration}ms`);
      console.error('🔍 Error:', error);

      // Attempt rollback if configured
      if (this.config.rollbackOnFailure && result.migrationResult) {
        console.log('\n🔄 Attempting automatic rollback...');
        try {
          await this.performRollback(result.migrationResult);
          result.warnings.push('Automatic rollback completed successfully');
        } catch (rollbackError) {
          result.errors.push(
            `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
          );
        }
      }

      return result;
    }
  }

  /**
   * Execute a deployment phase with error handling and reporting
   */
  private async executePhase(
    result: DeploymentResult,
    phaseName: string,
    phaseFunction: () => Promise<void>
  ): Promise<void> {
    result.phase = phaseName;
    const phaseStart = Date.now();

    console.log(`\n📋 PHASE: ${phaseName.toUpperCase().replace('-', ' ')}`);
    console.log('='.repeat(50));

    try {
      await phaseFunction();
      const phaseDuration = Date.now() - phaseStart;
      console.log(`✅ Phase completed in ${phaseDuration}ms`);
    } catch (error) {
      const phaseDuration = Date.now() - phaseStart;
      console.error(`❌ Phase failed after ${phaseDuration}ms:`, error);
      throw error;
    }
  }

  /**
   * Pre-deployment validation and checks
   */
  private async preDeploymentValidation(): Promise<void> {
    console.log('🔍 Running pre-deployment validation...');

    const validator = new DeploymentValidator();
    const validationResult = await validator.validatePreDeployment();

    if (!validationResult.valid) {
      throw new Error(`Pre-deployment validation failed: ${validationResult.errors.join(', ')}`);
    }

    if (validationResult.warnings.length > 0) {
      console.warn('⚠️  Pre-deployment warnings:');
      validationResult.warnings.forEach((warning) => console.warn(`   - ${warning}`));
    }

    console.log('✅ Pre-deployment validation passed');
  }

  /**
   * Create comprehensive pre-deployment backup
   */
  private async createPreDeploymentBackup(result: DeploymentResult): Promise<void> {
    if (this.config.skipBackup) {
      console.log('⏭️  Skipping backup (skipBackup = true)');
      return;
    }

    console.log('💾 Creating pre-deployment backup...');

    const backupPath = this.backupManager.generateBackupPath(
      `pre-deployment-${this.config.environment}`
    );
    await this.backupManager.createBackup(backupPath);
    result.backupPaths.push(backupPath);

    console.log(`✅ Pre-deployment backup created: ${backupPath}`);
  }

  /**
   * Create database schema and constraints
   */
  private async createDatabaseSchema(): Promise<void> {
    console.log('🏗️  Creating database schema...');

    const schemaCreator = new MCPServerConnectorSchemaCreator();
    const schemaResult = await schemaCreator.createSchema();

    if (schemaResult.validationsFailed > 0 || schemaResult.errors.length > 0) {
      throw new Error(`Schema creation failed: ${schemaResult.errors.join(', ')}`);
    }

    console.log(`✅ Schema created successfully:`);
    console.log(`   - Constraints: ${schemaResult.constraintsCreated}`);
    console.log(`   - Indexes: ${schemaResult.indexesCreated}`);
    console.log(`   - Validations: ${schemaResult.validationsPassed}`);
  }

  /**
   * Run comprehensive migration tests
   */
  private async runMigrationTests(): Promise<void> {
    console.log('🧪 Running migration tests...');

    const testScenarios = new MigrationTestScenarios();
    const testResults = await testScenarios.runAllScenarios();

    const failedTests = testResults.filter((test) => !test.success);
    if (failedTests.length > 0) {
      console.error('❌ Migration tests failed:');
      failedTests.forEach((test) => {
        console.error(`   - ${test.scenarioName}: ${test.errors.join(', ')}`);
      });
      throw new Error(`${failedTests.length} migration tests failed`);
    }

    console.log(`✅ All ${testResults.length} migration tests passed`);
  }

  /**
   * Execute the migration (or dry run)
   */
  private async executeMigration(): Promise<any> {
    if (this.config.dryRun) {
      console.log('🔍 DRY RUN: Simulating migration...');
      // In dry run mode, we would simulate the migration without making changes
      return {
        success: true,
        migratedCount: 0,
        errors: [],
        dryRun: true,
        duration: 0,
        statistics: {
          totalStarships: 0,
          totalTemplates: 0,
          totalRelationships: 0,
          createdConnectorInstances: 0,
        },
      };
    }

    console.log('🔄 Executing migration...');

    const migration = new ConnectorInstanceMigration();
    const migrationResult = await migration.migrate();

    if (!migrationResult.success) {
      throw new Error(`Migration failed: ${migrationResult.errors.join(', ')}`);
    }

    console.log(`✅ Migration completed successfully:`);
    console.log(`   - Migrated: ${migrationResult.migratedCount} relationships`);
    console.log(`   - Duration: ${migrationResult.duration}ms`);
    console.log(`   - Statistics:`, migrationResult.statistics);

    return migrationResult;
  }

  /**
   * Post-migration validation
   */
  private async postMigrationValidation(): Promise<any> {
    console.log('🔍 Running post-migration validation...');

    const validator = new DeploymentValidator();
    const validationResult = await validator.validatePostDeployment();

    if (!validationResult.valid) {
      throw new Error(`Post-migration validation failed: ${validationResult.errors.join(', ')}`);
    }

    if (validationResult.warnings.length > 0) {
      console.warn('⚠️  Post-migration warnings:');
      validationResult.warnings.forEach((warning) => console.warn(`   - ${warning}`));
    }

    console.log('✅ Post-migration validation passed');
    console.log('📊 Validation statistics:', validationResult.statistics);

    return validationResult;
  }

  /**
   * Run production health checks
   */
  private async runHealthChecks(): Promise<any> {
    console.log('🏥 Running health checks...');

    const healthChecker = new ProductionHealthChecker({
      timeout: this.config.healthCheckTimeout!,
    });

    const healthResult = await healthChecker.runAllChecks();

    if (!healthResult.healthy) {
      throw new Error(`Health checks failed: ${healthResult.errors.join(', ')}`);
    }

    if (healthResult.warnings.length > 0) {
      console.warn('⚠️  Health check warnings:');
      healthResult.warnings.forEach((warning) => console.warn(`   - ${warning}`));
    }

    console.log('✅ All health checks passed');
    console.log('📊 Health metrics:', healthResult.metrics);

    return healthResult;
  }

  /**
   * Create post-deployment backup
   */
  private async createPostDeploymentBackup(result: DeploymentResult): Promise<void> {
    if (this.config.skipBackup) {
      console.log('⏭️  Skipping post-deployment backup (skipBackup = true)');
      return;
    }

    console.log('💾 Creating post-deployment backup...');

    const backupPath = this.backupManager.generateBackupPath(
      `post-deployment-${this.config.environment}`
    );
    await this.backupManager.createBackup(backupPath);
    result.backupPaths.push(backupPath);

    console.log(`✅ Post-deployment backup created: ${backupPath}`);
  }

  /**
   * Generate comprehensive deployment report
   */
  private async generateDeploymentReport(result: DeploymentResult): Promise<void> {
    console.log('📊 Generating deployment report...');

    const reportPath = await this.reporter.generateReport({
      environment: this.config.environment,
      deploymentResult: result,
      timestamp: new Date().toISOString(),
    });

    console.log(`✅ Deployment report generated: ${reportPath}`);
  }

  /**
   * Perform rollback in case of failure
   */
  private async performRollback(migrationResult: any): Promise<void> {
    if (!migrationResult.rollbackData || migrationResult.rollbackData.length === 0) {
      console.warn('⚠️  No rollback data available');
      return;
    }

    const migration = new ConnectorInstanceMigration();
    const rollbackSuccess = await migration.rollback(migrationResult.rollbackData);

    if (!rollbackSuccess) {
      throw new Error('Rollback operation failed');
    }

    console.log('✅ Rollback completed successfully');
  }
}

/**
 * CLI interface for deployment
 */
export async function runDeployment(): Promise<void> {
  const args = process.argv.slice(2);
  const environment = (args[0] as 'staging' | 'production') || 'staging';

  const config: DeploymentConfig = {
    environment,
    skipTests: args.includes('--skip-tests'),
    skipBackup: args.includes('--skip-backup'),
    dryRun: args.includes('--dry-run'),
    rollbackOnFailure: !args.includes('--no-rollback'),
  };

  console.log('🚀 Connector Instance Deployment CLI');
  console.log('===================================');
  console.log(`Environment: ${environment}`);
  console.log(`Configuration:`, config);
  console.log('');

  try {
    const deployment = new ConnectorInstanceDeployment(config);
    const result = await deployment.deploy();

    if (result.success) {
      console.log('\n🎉 Deployment completed successfully!');
      process.exit(0);
    } else {
      console.error('\n❌ Deployment failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Deployment failed with error:', error);
    process.exit(1);
  }
}

// Run deployment if this script is executed directly
if (require.main === module) {
  runDeployment().catch(console.error);
}
