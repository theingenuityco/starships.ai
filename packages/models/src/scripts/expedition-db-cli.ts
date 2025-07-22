#!/usr/bin/env node

import { enhancedMigrationRunner } from './enhanced-migration-runner';
import { databaseHealthChecker } from './database-health-checker';
import { migrationRunner } from './migration-runner';
import { createConnection } from '../connection';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Expedition Database CLI
 * 
 * Comprehensive command-line interface for managing the expedition database:
 * - Run migrations with dependency resolution
 * - Perform health checks and validation
 * - Generate reports and documentation
 * - Manage seed data and backups
 * - Monitor performance and system health
 */

interface CliOptions {
  target?: string[];
  plan?: boolean;
  force?: boolean;
  dryRun?: boolean;
  quick?: boolean;
  report?: boolean;
  output?: string;
  load?: boolean;
  clear?: boolean;
  schema?: boolean;
  data?: boolean;
  performance?: boolean;
}

class ExpeditionDatabaseCLI {
  private connection: any;

  async initialize(): Promise<void> {
    try {
      const config = {
        uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
        username: process.env.NEO4J_USERNAME || 'neo4j',
        [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
        database: process.env.NEO4J_DATABASE || 'neo4j'
      };

      this.connection = createConnection(config);
      await this.connection.connect();
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      process.exit(1);
    }
  }

  async runMigrations(options: CliOptions): Promise<void> {
    console.log('🚀 Starting migration process...\n');
    
    await this.initialize();

    try {
      // Create migration plan
      const plan = await enhancedMigrationRunner.createMigrationPlan(options.target);
      
      console.log('📋 Migration Plan:');
      console.log(`- Migrations to run: ${plan.migrations.length}`);
      console.log(`- Execution order: ${plan.executionOrder.join(' → ')}`);
      console.log(`- Estimated time: ${Math.round(plan.estimatedTotalTime / 1000)}s`);
      console.log(`- Overall risk: ${plan.riskAssessment.overallRisk}`);
      console.log(`- Backup required: ${plan.backupRequired ? 'Yes' : 'No'}\n`);

      if (plan.riskAssessment.riskFactors.length > 0) {
        console.log('⚠️  Risk Factors:');
        plan.riskAssessment.riskFactors.forEach(factor => console.log(`  - ${factor}`));
        console.log();
      }

      if (plan.riskAssessment.mitigationStrategies.length > 0) {
        console.log('🛡️  Mitigation Strategies:');
        plan.riskAssessment.mitigationStrategies.forEach(strategy => console.log(`  - ${strategy}`));
        console.log();
      }

      if (options.plan || options.dryRun) {
        console.log('📄 Plan generated successfully (no execution)');
        return;
      }

      // Confirm execution for high-risk migrations
      if (!options.force && (plan.riskAssessment.overallRisk === 'high' || plan.riskAssessment.overallRisk === 'critical')) {
        const answer = await this.promptUser('⚠️  High-risk migration detected. Continue? (y/N): ');

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log('❌ Migration cancelled by user');
          return;
        }
      }

      // Execute migration plan
      console.log('🔄 Executing migrations...\n');
      const results = await enhancedMigrationRunner.executeMigrationPlan(plan);

      // Generate and display report
      const report = enhancedMigrationRunner.generateMigrationReport(results);
      console.log(report);

      // Save report to file
      const reportPath = join(process.cwd(), `migration-report-${Date.now()}.txt`);
      writeFileSync(reportPath, report);
      console.log(`📄 Report saved to: ${reportPath}`);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      if (failed === 0) {
        console.log('✅ All migrations completed successfully!');
      } else {
        console.log(`❌ ${failed} migrations failed, ${successful} succeeded`);
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }

  async rollbackMigration(migration: string, options: CliOptions): Promise<void> {
    console.log(`🔄 Rolling back migration: ${migration}\n`);
    
    await this.initialize();

    try {
      if (!options.force) {
        const answer = await this.promptUser('⚠️  Are you sure you want to rollback this migration? (y/N): ');

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log('❌ Rollback cancelled by user');
          return;
        }
      }

      const result = await migrationRunner.rollbackMigration(migration);
      
      if (result.success) {
        console.log(`✅ Migration ${migration} rolled back successfully`);
        console.log(`⏱️  Execution time: ${result.executionTime}ms`);
      } else {
        console.log(`❌ Rollback failed: ${result.errors?.join(', ')}`);
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Rollback failed:', error);
      process.exit(1);
    }
  }

  async runHealthCheck(options: CliOptions): Promise<void> {
    console.log('🏥 Running database health check...\n');
    
    await this.initialize();

    try {
      if (options.quick) {
        const result = await databaseHealthChecker.runQuickHealthCheck();
        
        console.log(`Status: ${result.status.toUpperCase()}`);
        
        if (result.issues.length > 0) {
          console.log('\nIssues:');
          result.issues.forEach(issue => console.log(`  - ${issue}`));
        } else {
          console.log('✅ No issues detected');
        }
        
        return;
      }

      // Run comprehensive health check
      const result = await databaseHealthChecker.runHealthCheck();
      
      console.log(`Overall Status: ${result.overall.toUpperCase()}`);
      console.log(`Overall Score: ${result.score}/100\n`);

      // Display summary
      console.log('📊 Check Summary:');
      Object.entries(result.checks).forEach(([name, check]) => {
        const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`  ${icon} ${name}: ${check.status} (${check.score}/100)`);
      });

      if (result.criticalIssues.length > 0) {
        console.log('\n🚨 Critical Issues:');
        result.criticalIssues.forEach(issue => console.log(`  - ${issue}`));
      }

      if (result.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        result.recommendations.forEach(rec => console.log(`  - ${rec}`));
      }

      // Generate detailed report if requested
      if (options.report || options.output) {
        const report = databaseHealthChecker.generateHealthReport(result);
        
        const reportPath = options.output || join(process.cwd(), `health-report-${Date.now()}.txt`);
        writeFileSync(reportPath, report);
        console.log(`\n📄 Detailed report saved to: ${reportPath}`);
      }

      if (result.overall === 'critical') {
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Health check failed:', error);
      process.exit(1);
    }
  }

  async showStatus(): Promise<void> {
    console.log('📊 Database Status\n');
    
    await this.initialize();

    try {
      // Get applied migrations
      const appliedMigrations = await migrationRunner.getAppliedMigrations();
      const pendingMigrations = await migrationRunner.getPendingMigrations();

      console.log(`Applied Migrations: ${appliedMigrations.length}`);
      if (appliedMigrations.length > 0) {
        console.log('Recent migrations:');
        appliedMigrations.slice(-5).forEach(migration => {
          console.log(`  - ${migration.id} (${migration.appliedAt})`);
        });
      }

      console.log(`\nPending Migrations: ${pendingMigrations.length}`);
      if (pendingMigrations.length > 0) {
        console.log('Next migrations:');
        pendingMigrations.slice(0, 5).forEach(migration => {
          console.log(`  - ${migration}`);
        });
      }

      // Quick health status
      const healthResult = await databaseHealthChecker.runQuickHealthCheck();
      console.log(`\nHealth Status: ${healthResult.status.toUpperCase()}`);
      
      if (healthResult.issues.length > 0) {
        console.log('Issues:');
        healthResult.issues.forEach(issue => console.log(`  - ${issue}`));
      }

    } catch (error) {
      console.error('❌ Failed to get status:', error);
      process.exit(1);
    }
  }

  async manageSeedData(options: CliOptions): Promise<void> {
    await this.initialize();

    try {
      if (options.load) {
        console.log('🌱 Loading seed data...');
        
        // Run seed data migrations
        const seedMigrations = ['006_expedition_seed_data', '007_expedition_messages_results_seed'];
        
        for (const migration of seedMigrations) {
          console.log(`Loading ${migration}...`);
          const result = await migrationRunner.runMigration(migration);
          
          if (result.success) {
            console.log(`✅ ${migration} loaded successfully`);
          } else {
            console.log(`❌ Failed to load ${migration}: ${result.errors?.join(', ')}`);
            process.exit(1);
          }
        }
        
        console.log('✅ Seed data loaded successfully!');
        
      } else if (options.clear) {
        if (!options.force) {
          const answer = await this.promptUser('⚠️  This will remove all seed data. Continue? (y/N): ');

          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            console.log('❌ Operation cancelled by user');
            return;
          }
        }

        console.log('🧹 Clearing seed data...');
        
        // Rollback seed data migrations in reverse order
        const seedMigrations = ['007_expedition_messages_results_seed', '006_expedition_seed_data'];
        
        for (const migration of seedMigrations) {
          console.log(`Clearing ${migration}...`);
          const result = await migrationRunner.rollbackMigration(migration);
          
          if (result.success) {
            console.log(`✅ ${migration} cleared successfully`);
          } else {
            console.log(`❌ Failed to clear ${migration}: ${result.errors?.join(', ')}`);
          }
        }
        
        console.log('✅ Seed data cleared successfully!');
        
      } else {
        console.log('Please specify --load or --clear option');
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Seed operation failed:', error);
      process.exit(1);
    }
  }

  async validateDatabase(options: CliOptions): Promise<void> {
    console.log('🔍 Running database validation...\n');
    
    await this.initialize();

    try {
      const result = await databaseHealthChecker.runHealthCheck();
      
      const checks = [];
      if (options.schema || (!options.data && !options.performance)) {
        checks.push('schema', 'constraints', 'indexes');
      }
      if (options.data || (!options.schema && !options.performance)) {
        checks.push('dataIntegrity', 'expeditionSystem');
      }
      if (options.performance || (!options.schema && !options.data)) {
        checks.push('performance');
      }

      let allPassed = true;
      
      for (const checkName of checks) {
        const check = result.checks[checkName as keyof typeof result.checks];
        const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        console.log(`${icon} ${checkName}: ${check.message}`);
        
        if (check.status === 'fail') {
          allPassed = false;
        }
      }

      console.log(`\nValidation ${allPassed ? 'PASSED' : 'FAILED'}`);
      
      if (!allPassed) {
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    }
  }

  private async promptUser(question: string): Promise<string> {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise<string>((resolve) => {
      readline.question(question, (answer: string) => {
        readline.close();
        resolve(answer);
      });
    });
  }

  showHelp(): void {
    console.log(`
Expedition Database CLI v1.0.0

Usage: node expedition-db-cli.js <command> [options]

Commands:
  migrate [options]           Run database migrations
  rollback <migration>        Rollback a specific migration
  health [options]            Run database health check
  status                      Show migration and database status
  seed [options]              Manage seed data
  validate [options]          Validate database schema and data integrity
  help                        Show this help message

Migration Options:
  --target <migrations...>    Target specific migrations
  --plan                      Show migration plan without executing
  --force                     Force execution without confirmation
  --dry-run                   Show what would be executed without running

Health Check Options:
  --quick                     Run quick health check
  --report                    Generate detailed health report
  --output <file>             Save report to file

Seed Data Options:
  --load                      Load seed data
  --clear                     Clear seed data
  --force                     Force operation without confirmation

Validation Options:
  --schema                    Validate schema only
  --data                      Validate data integrity only
  --performance               Validate performance only

Examples:
  node expedition-db-cli.js migrate --plan
  node expedition-db-cli.js migrate --target 005_comprehensive_expedition_schema
  node expedition-db-cli.js health --quick
  node expedition-db-cli.js seed --load
  node expedition-db-cli.js validate --schema
`);
  }
}

// Main execution
async function main(): Promise<void> {
  const cli = new ExpeditionDatabaseCLI();
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    cli.showHelp();
    return;
  }

  const command = args[0];
  const options: CliOptions = {};
  
  // Parse options
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--plan') options.plan = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--quick') options.quick = true;
    else if (arg === '--report') options.report = true;
    else if (arg === '--load') options.load = true;
    else if (arg === '--clear') options.clear = true;
    else if (arg === '--schema') options.schema = true;
    else if (arg === '--data') options.data = true;
    else if (arg === '--performance') options.performance = true;
    else if (arg === '--target') {
      options.target = [];
      i++;
      while (i < args.length && !args[i].startsWith('--')) {
        options.target.push(args[i]);
        i++;
      }
      i--; // Adjust for the outer loop increment
    }
    else if (arg === '--output') {
      i++;
      if (i < args.length) options.output = args[i];
    }
  }

  try {
    switch (command) {
      case 'migrate':
        await cli.runMigrations(options);
        break;
      case 'rollback':
        if (args.length < 2) {
          console.error('❌ Migration name required for rollback');
          process.exit(1);
        }
        await cli.rollbackMigration(args[1], options);
        break;
      case 'health':
        await cli.runHealthCheck(options);
        break;
      case 'status':
        await cli.showStatus();
        break;
      case 'seed':
        await cli.manageSeedData(options);
        break;
      case 'validate':
        await cli.validateDatabase(options);
        break;
      case 'help':
        cli.showHelp();
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        cli.showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ CLI failed:', error);
    process.exit(1);
  });
}

export { ExpeditionDatabaseCLI };