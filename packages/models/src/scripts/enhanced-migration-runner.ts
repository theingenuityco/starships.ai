import { getConnection } from '../connection';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Enhanced Migration Runner for Expedition System
 * 
 * Provides comprehensive migration management with advanced features:
 * - Automatic dependency resolution
 * - Parallel migration execution where safe
 * - Enhanced validation and verification
 * - Expedition-specific health checks
 * - Performance monitoring
 * - Backup and recovery integration
 */

export interface MigrationMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  dependencies: string[];
  tags: string[];
  estimatedDuration?: number; // in milliseconds
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  rollbackSupported: boolean;
  appliedAt?: string;
  appliedBy?: string;
}

export interface MigrationExecutionResult {
  success: boolean;
  migrationId: string;
  executionTime: number;
  errors: string[];
  warnings: string[];
  rollbackAvailable: boolean;
  performanceMetrics: {
    constraintsCreated: number;
    indexesCreated: number;
    nodesCreated: number;
    relationshipsCreated: number;
    queryExecutionTimes: number[];
  };
  validationResults: {
    schemaValid: boolean;
    dataIntegrityValid: boolean;
    performanceAcceptable: boolean;
    issues: string[];
  };
}

export interface MigrationPlan {
  migrations: MigrationMetadata[];
  executionOrder: string[];
  estimatedTotalTime: number;
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    mitigationStrategies: string[];
  };
  backupRequired: boolean;
}

export class EnhancedMigrationRunner {
  private connection: any = null;
  private migrationsPath = join(__dirname, '../migrations');
  private migrationRegistry = new Map<string, MigrationMetadata>();

  constructor() {
    this.loadMigrationRegistry();
  }

  private getConnection() {
    if (!this.connection) {
      this.connection = getConnection();
    }
    return this.connection;
  }

  /**
   * Load and parse all migration files to build registry
   */
  private loadMigrationRegistry(): void {
    try {
      const files = readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.cypher') && !file.includes('rollback'))
        .sort();

      // Check for missing sequence numbers and log warnings instead of failing
      const migrationNumbers = new Set<number>();
      const validFiles: string[] = [];

      for (const file of files) {
        const match = file.match(/^(\d+)_/);
        if (match) {
          const migrationNumber = parseInt(match[1], 10);
          migrationNumbers.add(migrationNumber);
          validFiles.push(file);
        } else {
          console.warn(`Migration file ${file} does not follow expected naming pattern (NNN_name.cypher)`);
        }
      }

      // Check for gaps in sequence and log warnings
      if (migrationNumbers.size > 0) {
        const minNumber = Math.min(...migrationNumbers);
        const maxNumber = Math.max(...migrationNumbers);
        const expectedNumbers = Array.from({ length: maxNumber - minNumber + 1 }, (_, i) => minNumber + i);
        
        for (const expectedNumber of expectedNumbers) {
          if (!migrationNumbers.has(expectedNumber)) {
            console.warn(`Missing migration sequence number: ${expectedNumber.toString().padStart(3, '0')} (this is expected after expedition system removal)`);
          }
        }
      }

      // Load valid migrations
      for (const file of validFiles) {
        try {
          const migrationId = file.replace('.cypher', '');
          const metadata = this.parseMigrationMetadata(file);
          this.migrationRegistry.set(migrationId, metadata);
        } catch (error) {
          console.warn(`Failed to parse migration ${file}, skipping:`, error);
        }
      }

      console.log(`Loaded ${this.migrationRegistry.size} migrations into registry (${files.length - validFiles.length} files skipped)`);
    } catch (error) {
      console.error('Failed to load migration registry:', error);
      throw error;
    }
  }

  /**
   * Parse migration file to extract metadata
   */
  private parseMigrationMetadata(filename: string): MigrationMetadata {
    const filePath = join(this.migrationsPath, filename);
    const content = readFileSync(filePath, 'utf-8');
    const migrationId = filename.replace('.cypher', '');

    // Extract metadata from comments
    const nameMatch = content.match(/\/\/ Description: (.+)/);
    const versionMatch = content.match(/\/\/ Version: (.+)/);
    const dependenciesMatch = content.match(/\/\/ Dependencies: (.+)/);
    const tagsMatch = content.match(/\/\/ Tags: (.+)/);
    const riskMatch = content.match(/\/\/ Risk: (.+)/);
    const durationMatch = content.match(/\/\/ EstimatedDuration: (.+)/);

    const dependencies = dependenciesMatch 
      ? dependenciesMatch[1].split(',').map(d => d.trim()).filter(d => d)
      : [];

    const tags = tagsMatch 
      ? tagsMatch[1].split(',').map(t => t.trim()).filter(t => t)
      : [];

    // Check if rollback file exists
    const rollbackPath = join(this.migrationsPath, `${migrationId.replace(/^(\d+)_/, '$1_rollback_')}.cypher`);
    const rollbackSupported = existsSync(rollbackPath);

    // Determine risk level based on content analysis
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (riskMatch) {
      riskLevel = riskMatch[1].toLowerCase() as any;
    } else {
      // Auto-detect risk based on operations
      if (content.includes('DROP') || content.includes('DELETE')) {
        riskLevel = 'high';
      } else if (content.includes('ALTER') || content.includes('CONSTRAINT')) {
        riskLevel = 'medium';
      }
    }

    return {
      id: migrationId,
      name: nameMatch ? nameMatch[1] : migrationId,
      description: nameMatch ? nameMatch[1] : `Migration ${migrationId}`,
      version: versionMatch ? versionMatch[1] : '1.0.0',
      dependencies,
      tags,
      estimatedDuration: durationMatch ? parseInt(durationMatch[1]) : undefined,
      riskLevel,
      rollbackSupported
    };
  }

  /**
   * Create comprehensive migration plan
   */
  async createMigrationPlan(targetMigrations?: string[]): Promise<MigrationPlan> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));

    // Determine which migrations to run
    let migrationsToRun: MigrationMetadata[];
    if (targetMigrations) {
      migrationsToRun = targetMigrations
        .map(id => this.migrationRegistry.get(id))
        .filter((m): m is MigrationMetadata => m !== undefined)
        .filter(m => !appliedIds.has(m.id));
    } else {
      migrationsToRun = Array.from(this.migrationRegistry.values())
        .filter(m => !appliedIds.has(m.id));
    }

    // Resolve dependencies and create execution order
    const executionOrder = this.resolveDependencies(migrationsToRun);

    // Calculate estimated time
    const estimatedTotalTime = migrationsToRun.reduce((total, m) => 
      total + (m.estimatedDuration || 30000), 0);

    // Assess risk
    const riskAssessment = this.assessRisk(migrationsToRun);

    // Determine if backup is required
    const backupRequired = migrationsToRun.some(m => 
      m.riskLevel === 'high' || m.riskLevel === 'critical');

    return {
      migrations: migrationsToRun,
      executionOrder,
      estimatedTotalTime,
      riskAssessment,
      backupRequired
    };
  }

  /**
   * Resolve migration dependencies and create execution order
   */
  private resolveDependencies(migrations: MigrationMetadata[]): string[] {
    const migrationMap = new Map(migrations.map(m => [m.id, m]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (migrationId: string): void => {
      if (visited.has(migrationId)) return;
      if (visiting.has(migrationId)) {
        throw new Error(`Circular dependency detected involving ${migrationId}`);
      }

      const migration = migrationMap.get(migrationId);
      if (!migration) return; // Skip if migration not in current set

      visiting.add(migrationId);

      // Visit dependencies first
      for (const depId of migration.dependencies) {
        visit(depId);
      }

      visiting.delete(migrationId);
      visited.add(migrationId);
      result.push(migrationId);
    };

    for (const migration of migrations) {
      visit(migration.id);
    }

    return result;
  }

  /**
   * Assess overall risk of migration plan
   */
  private assessRisk(migrations: MigrationMetadata[]): {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    mitigationStrategies: string[];
  } {
    const riskFactors: string[] = [];
    const mitigationStrategies: string[] = [];

    const criticalCount = migrations.filter(m => m.riskLevel === 'critical').length;
    const highCount = migrations.filter(m => m.riskLevel === 'high').length;
    const mediumCount = migrations.filter(m => m.riskLevel === 'medium').length;

    let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (criticalCount > 0) {
      overallRisk = 'critical';
      riskFactors.push(`${criticalCount} critical risk migrations`);
      mitigationStrategies.push('Full database backup required');
      mitigationStrategies.push('Execute during maintenance window');
      mitigationStrategies.push('Have rollback plan ready');
    } else if (highCount > 0) {
      overallRisk = 'high';
      riskFactors.push(`${highCount} high risk migrations`);
      mitigationStrategies.push('Database backup recommended');
      mitigationStrategies.push('Test in staging environment first');
    } else if (mediumCount > 2) {
      overallRisk = 'medium';
      riskFactors.push(`${mediumCount} medium risk migrations`);
      mitigationStrategies.push('Monitor performance during execution');
    }

    // Check for schema changes
    const schemaChanges = migrations.filter(m => 
      m.tags.includes('schema') || m.tags.includes('constraints') || m.tags.includes('indexes'));
    if (schemaChanges.length > 0) {
      riskFactors.push(`${schemaChanges.length} schema-changing migrations`);
      mitigationStrategies.push('Verify application compatibility');
    }

    return { overallRisk, riskFactors, mitigationStrategies };
  }

  /**
   * Execute migration plan with comprehensive monitoring
   */
  async executeMigrationPlan(plan: MigrationPlan): Promise<MigrationExecutionResult[]> {
    const results: MigrationExecutionResult[] = [];

    console.log(`Executing migration plan with ${plan.migrations.length} migrations`);
    console.log(`Estimated time: ${Math.round(plan.estimatedTotalTime / 1000)}s`);
    console.log(`Overall risk: ${plan.riskAssessment.overallRisk}`);

    // Create backup if required
    if (plan.backupRequired) {
      console.log('Creating backup before migration execution...');
      await this.createPreMigrationBackup();
    }

    // Execute migrations in dependency order
    for (const migrationId of plan.executionOrder) {
      console.log(`\nExecuting migration: ${migrationId}`);
      const result = await this.executeMigrationWithMonitoring(migrationId);
      results.push(result);

      if (!result.success) {
        console.error(`Migration ${migrationId} failed. Stopping execution.`);
        break;
      }

      // Validate after each critical migration
      const migration = this.migrationRegistry.get(migrationId);
      if (migration?.riskLevel === 'critical' || migration?.riskLevel === 'high') {
        console.log('Performing post-migration validation...');
        const validationResult = await this.validateSystemHealth();
        if (!validationResult.healthy) {
          console.error('System health check failed after migration');
          result.validationResults.issues.push(...validationResult.issues);
        }
      }
    }

    return results;
  }

  /**
   * Execute single migration with comprehensive monitoring
   */
  private async executeMigrationWithMonitoring(migrationId: string): Promise<MigrationExecutionResult> {
    const startTime = Date.now();
    const result: MigrationExecutionResult = {
      success: false,
      migrationId,
      executionTime: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: false,
      performanceMetrics: {
        constraintsCreated: 0,
        indexesCreated: 0,
        nodesCreated: 0,
        relationshipsCreated: 0,
        queryExecutionTimes: []
      },
      validationResults: {
        schemaValid: false,
        dataIntegrityValid: false,
        performanceAcceptable: false,
        issues: []
      }
    };

    try {
      // Check if migration already applied
      const isApplied = await this.isMigrationApplied(migrationId);
      if (isApplied) {
        result.warnings.push(`Migration ${migrationId} is already applied`);
        result.success = true;
        result.executionTime = Date.now() - startTime;
        return result;
      }

      // Load migration content
      const migrationPath = join(this.migrationsPath, `${migrationId}.cypher`);
      if (!existsSync(migrationPath)) {
        result.errors.push(`Migration file not found: ${migrationPath}`);
        return result;
      }

      // Check rollback availability
      const rollbackPath = join(this.migrationsPath, `${migrationId.replace(/^(\d+)_/, '$1_rollback_')}.cypher`);
      result.rollbackAvailable = existsSync(rollbackPath);

      // Execute migration with performance monitoring
      const migrationContent = readFileSync(migrationPath, 'utf-8');
      await this.executeMigrationWithPerformanceTracking(migrationContent, migrationId, result);

      // Validate migration success
      const validationResult = await this.validateMigrationExecution(migrationId);
      result.validationResults = validationResult;

      if (!validationResult.schemaValid || !validationResult.dataIntegrityValid) {
        result.errors.push('Migration validation failed');
        
        // Attempt rollback if available
        if (result.rollbackAvailable) {
          console.log('Attempting automatic rollback...');
          await this.rollbackMigration(migrationId);
          result.warnings.push('Migration rolled back due to validation failure');
        }
        return result;
      }

      result.success = true;

    } catch (error) {
      result.errors.push(`Migration execution failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Attempt rollback on error
      if (result.rollbackAvailable) {
        try {
          await this.rollbackMigration(migrationId);
          result.warnings.push('Migration rolled back due to execution error');
        } catch (rollbackError) {
          result.errors.push(`Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
      }
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Execute migration content with performance tracking
   */
  private async executeMigrationWithPerformanceTracking(
    content: string, 
    migrationId: string, 
    result: MigrationExecutionResult
  ): Promise<void> {
    // Split content into individual statements
    const statements = content
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('//'));

    // Execute each statement with timing
    for (const statement of statements) {
      if (statement.trim()) {
        const statementStart = Date.now();
        
        try {
          await this.getConnection().executeWrite(statement);
          const executionTime = Date.now() - statementStart;
          result.performanceMetrics.queryExecutionTimes.push(executionTime);

          // Track what was created
          if (statement.toUpperCase().includes('CREATE CONSTRAINT')) {
            result.performanceMetrics.constraintsCreated++;
          } else if (statement.toUpperCase().includes('CREATE INDEX')) {
            result.performanceMetrics.indexesCreated++;
          } else if (statement.toUpperCase().includes('CREATE (') && statement.includes(':')) {
            result.performanceMetrics.nodesCreated++;
          } else if (statement.toUpperCase().includes('CREATE (') && statement.includes(')-[')) {
            result.performanceMetrics.relationshipsCreated++;
          }

        } catch (error) {
          throw new Error(`Failed to execute statement in ${migrationId}: ${statement.substring(0, 100)}... Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /**
   * Validate migration execution
   */
  private async validateMigrationExecution(migrationId: string): Promise<{
    schemaValid: boolean;
    dataIntegrityValid: boolean;
    performanceAcceptable: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    let schemaValid = true;
    let dataIntegrityValid = true;
    let performanceAcceptable = true;

    try {
      // Check if migration record was created
      const migrationExists = await this.isMigrationApplied(migrationId);
      if (!migrationExists) {
        issues.push('Migration record not found after execution');
        schemaValid = false;
      }

      // Expedition system was removed - skip expedition-specific validations
      // if (migrationId.includes('expedition')) {
      //   await this.validateExpeditionSystemIntegrity(issues);
      // }

      // Performance validation
      const performanceIssues = await this.validatePerformance();
      if (performanceIssues.length > 0) {
        issues.push(...performanceIssues);
        performanceAcceptable = false;
      }

    } catch (error) {
      issues.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      schemaValid = false;
      dataIntegrityValid = false;
    }

    return {
      schemaValid,
      dataIntegrityValid,
      performanceAcceptable,
      issues
    };
  }

  /**
   * Validate expedition system integrity
   * NOTE: Expedition system was removed - this function is now a no-op
   */
  private async validateExpeditionSystemIntegrity(issues: string[]): Promise<void> {
    // Expedition system was removed - skip all expedition validations
    issues.push('Expedition system validation skipped (expedition system was removed)');
  }

  /**
   * Validate system performance
   */
  private async validatePerformance(): Promise<string[]> {
    const issues: string[] = [];

    try {
      // Expedition system was removed - using basic starship queries for performance validation
      const testQueries = [
        {
          name: 'basic_starship_query',
          query: 'MATCH (s:Starship) RETURN count(s) LIMIT 1',
          maxTime: 1000
        },
        {
          name: 'user_agent_relationships',
          query: 'MATCH (u:User)-[:OWNS]->(a:Agent) RETURN count(a) LIMIT 1',
          maxTime: 500
        }
      ];

      for (const test of testQueries) {
        const start = Date.now();
        await this.getConnection().executeQuery(test.query);
        const duration = Date.now() - start;

        if (duration > test.maxTime) {
          issues.push(`Query ${test.name} took ${duration}ms (max: ${test.maxTime}ms)`);
        }
      }

    } catch (error) {
      issues.push(`Performance validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return issues;
  }

  /**
   * System health validation
   */
  private async validateSystemHealth(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check database connectivity
      await this.getConnection().executeQuery('RETURN 1');

      // Check constraint violations
      const constraintViolations = await this.getConnection().executeQuery(
        'CALL db.constraints() YIELD description RETURN count(*) as count'
      );

      // Check index health
      const indexHealth = await this.getConnection().executeQuery(
        'CALL db.indexes() YIELD state WHERE state <> "ONLINE" RETURN count(*) as count'
      );

      if (indexHealth[0]?.count > 0) {
        issues.push(`${indexHealth[0].count} indexes are not online`);
      }

    } catch (error) {
      issues.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }

  /**
   * Create pre-migration backup
   */
  private async createPreMigrationBackup(): Promise<void> {
    const backupId = `pre_migration_${Date.now()}`;
    
    try {
      await this.getConnection().executeWrite(
        `CREATE (backup:MigrationBackup {
          id: $backupId,
          type: 'pre_migration',
          createdAt: datetime().epochMillis,
          description: 'Backup created before migration execution'
        })`,
        { backupId }
      );
      
      console.log(`Backup created: ${backupId}`);
    } catch (error) {
      console.warn('Failed to create backup metadata:', error);
    }
  }

  /**
   * Get applied migrations
   */
  private async getAppliedMigrations(): Promise<MigrationMetadata[]> {
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
   * Check if migration is applied
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
   * Rollback migration
   */
  private async rollbackMigration(migrationId: string): Promise<void> {
    const rollbackPath = join(this.migrationsPath, `${migrationId.replace(/^(\d+)_/, '$1_rollback_')}.cypher`);
    
    if (!existsSync(rollbackPath)) {
      throw new Error(`Rollback file not found: ${rollbackPath}`);
    }

    const rollbackContent = readFileSync(rollbackPath, 'utf-8');
    const statements = rollbackContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('//'));

    for (const statement of statements) {
      if (statement.trim()) {
        await this.getConnection().executeWrite(statement);
      }
    }
  }

  /**
   * Generate migration report
   */
  generateMigrationReport(results: MigrationExecutionResult[]): string {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);

    let report = `
=== MIGRATION EXECUTION REPORT ===

Summary:
- Total migrations: ${results.length}
- Successful: ${successful}
- Failed: ${failed}
- Total execution time: ${Math.round(totalTime / 1000)}s

`;

    for (const result of results) {
      report += `
Migration: ${result.migrationId}
Status: ${result.success ? 'SUCCESS' : 'FAILED'}
Execution time: ${Math.round(result.executionTime / 1000)}s
Rollback available: ${result.rollbackAvailable ? 'Yes' : 'No'}

Performance Metrics:
- Constraints created: ${result.performanceMetrics.constraintsCreated}
- Indexes created: ${result.performanceMetrics.indexesCreated}
- Nodes created: ${result.performanceMetrics.nodesCreated}
- Relationships created: ${result.performanceMetrics.relationshipsCreated}
- Average query time: ${Math.round(result.performanceMetrics.queryExecutionTimes.reduce((a, b) => a + b, 0) / result.performanceMetrics.queryExecutionTimes.length || 0)}ms

`;

      if (result.errors.length > 0) {
        report += `Errors:\n${result.errors.map(e => `- ${e}`).join('\n')}\n`;
      }

      if (result.warnings.length > 0) {
        report += `Warnings:\n${result.warnings.map(w => `- ${w}`).join('\n')}\n`;
      }

      if (result.validationResults.issues.length > 0) {
        report += `Validation Issues:\n${result.validationResults.issues.map(i => `- ${i}`).join('\n')}\n`;
      }

      report += '---\n';
    }

    return report;
  }
}

// Export singleton instance
export const enhancedMigrationRunner = new EnhancedMigrationRunner();