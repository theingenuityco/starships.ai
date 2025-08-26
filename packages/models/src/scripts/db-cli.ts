#!/usr/bin/env node

import { migrationRunner } from './migration-runner';
import { schemaValidator } from './schema-validator';
import { performanceMonitor } from './performance-monitor';

/**
 * Database CLI Tool
 *
 * Command-line interface for managing database operations,
 * running migrations, validating schema, and monitoring performance.
 */

interface CliOptions {
  force?: boolean;
  report?: boolean;
  hours?: string;
  days?: string;
  duration?: string;
}

class DatabaseCLI {
  private args: string[];
  private options: CliOptions = {};

  constructor() {
    this.args = process.argv.slice(2);
    this.parseOptions();
  }

  private parseOptions(): void {
    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (value) {
          (this.options as any)[key] = value;
        } else if (i + 1 < this.args.length && !this.args[i + 1].startsWith('-')) {
          (this.options as any)[key] = this.args[i + 1];
          i++;
        } else {
          (this.options as any)[key] = true;
        }
      } else if (arg.startsWith('-')) {
        const flags = arg.substring(1);
        for (const flag of flags) {
          switch (flag) {
            case 'f': this.options.force = true; break;
            case 'r': this.options.report = true; break;
            case 'h': 
              if (i + 1 < this.args.length && !this.args[i + 1].startsWith('-')) {
                this.options.hours = this.args[i + 1];
                i++;
              }
              break;
            case 'd':
              if (i + 1 < this.args.length && !this.args[i + 1].startsWith('-')) {
                this.options.days = this.args[i + 1];
                i++;
              }
              break;
          }
        }
      }
    }
  }

  private log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      error: '\x1b[31m',   // Red
      warning: '\x1b[33m', // Yellow
      reset: '\x1b[0m'
    };

    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    };

    console.log(`${colors[type]}${icons[type]} ${message}${colors.reset}`);
  }

  private spinner(message: string): { succeed: (msg: string) => void; fail: (msg: string) => void; stop: () => void } {
    console.log(`🔄 ${message}...`);
    return {
      succeed: (msg: string) => this.log(msg, 'success'),
      fail: (msg: string) => this.log(msg, 'error'),
      stop: () => {}
    };
  }

  async run(): Promise<void> {
    const [command, subcommand, ...params] = this.args.filter(arg => !arg.startsWith('-'));

    try {
      switch (command) {
        case 'migration':
          await this.handleMigrationCommand(subcommand, params);
          break;
        case 'validate':
          await this.handleValidateCommand(subcommand);
          break;
        case 'performance':
        case 'perf':
          await this.handlePerformanceCommand(subcommand);
          break;
        case 'optimize':
          await this.handleOptimizeCommand(subcommand);
          break;
        case 'help':
        default:
          this.showHelp();
          break;
      }
    } catch (error) {
      this.log(`Command failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      process.exit(1);
    }
  }

  private async handleMigrationCommand(subcommand: string, params: string[]): Promise<void> {
    switch (subcommand) {
      case 'run':
        if (params.length === 0) {
          this.log('Migration ID required', 'error');
          process.exit(1);
        }
        await this.runMigration(params[0]);
        break;
      case 'run-all':
        await this.runAllMigrations();
        break;
      case 'rollback':
        if (params.length === 0) {
          this.log('Migration ID required', 'error');
          process.exit(1);
        }
        await this.rollbackMigration(params[0]);
        break;
      case 'status':
        await this.showMigrationStatus();
        break;
      default:
        this.log('Invalid migration command. Use: run, run-all, rollback, or status', 'error');
        break;
    }
  }

  private async runMigration(migrationId: string): Promise<void> {
    const spinner = this.spinner(`Running migration: ${migrationId}`);
    
    const result = await migrationRunner.runMigration(migrationId);
    
    if (result.success) {
      spinner.succeed(`Migration ${migrationId} completed successfully in ${result.executionTime}ms`);
      
      if (result.warnings && result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach(warning => this.log(`  ${warning}`, 'warning'));
      }
    } else {
      spinner.fail(`Migration ${migrationId} failed`);
      
      if (result.errors && result.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.errors.forEach(error => this.log(`  ${error}`, 'error'));
      }
      
      process.exit(1);
    }
  }

  private async runAllMigrations(): Promise<void> {
    const spinner = this.spinner('Running all pending migrations');
    
    const results = await migrationRunner.runAllPendingMigrations();
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    if (failed === 0) {
      spinner.succeed(`All migrations completed successfully (${successful} migrations)`);
    } else {
      spinner.fail(`${failed} migrations failed, ${successful} succeeded`);
      
      const failedMigrations = results.filter(r => !r.success);
      console.log('\n❌ Failed migrations:');
      failedMigrations.forEach(result => {
        this.log(`  ${result.migrationId}: ${result.errors?.join(', ')}`, 'error');
      });
      
      process.exit(1);
    }
  }

  private async rollbackMigration(migrationId: string): Promise<void> {
    const spinner = this.spinner(`Rolling back migration: ${migrationId}`);
    
    const result = await migrationRunner.rollbackMigration(migrationId);
    
    if (result.success) {
      spinner.succeed(`Migration ${migrationId} rolled back successfully in ${result.executionTime}ms`);
    } else {
      spinner.fail(`Rollback failed for ${migrationId}`);
      
      if (result.errors && result.errors.length > 0) {
        console.log('\n❌ Errors:');
        result.errors.forEach(error => this.log(`  ${error}`, 'error'));
      }
      
      process.exit(1);
    }
  }

  private async showMigrationStatus(): Promise<void> {
    const spinner = this.spinner('Checking migration status');
    
    const [applied, pending] = await Promise.all([
      migrationRunner.getAppliedMigrations(),
      migrationRunner.getPendingMigrations()
    ]);
    
    spinner.stop();
    
    console.log('\n📊 Migration Status\n');
    
    this.log(`Applied Migrations (${applied.length}):`, 'success');
    if (applied.length === 0) {
      console.log('  No migrations applied yet');
    } else {
      applied.forEach(migration => {
        console.log(`  ✓ ${migration.id} - ${migration.name} (${migration.appliedAt})`);
      });
    }
    
    this.log(`\nPending Migrations (${pending.length}):`, 'warning');
    if (pending.length === 0) {
      console.log('  No pending migrations');
    } else {
      pending.forEach(migrationId => {
        console.log(`  ⏳ ${migrationId}`);
      });
    }
  }

  private async handleValidateCommand(subcommand: string): Promise<void> {
    switch (subcommand) {
      case 'schema':
        await this.validateSchema();
        break;
      default:
        this.log('Invalid validate command. Use: schema', 'error');
        break;
    }
  }

  private async validateSchema(): Promise<void> {
    const spinner = this.spinner('Validating database schema');
    
    if (this.options.report) {
      const report = await schemaValidator.generateReport();
      spinner.stop();
      console.log(report);
    } else {
      const validation = await schemaValidator.validateSchema();
      
      if (validation.overallStatus === 'passed') {
        spinner.succeed(`Schema validation passed (${validation.passedTests}/${validation.totalTests} tests)`);
      } else if (validation.overallStatus === 'warnings') {
        this.log(`Schema validation completed with warnings (${validation.warningTests} warnings)`, 'warning');
      } else {
        spinner.fail(`Schema validation failed (${validation.failedTests} errors, ${validation.warningTests} warnings)`);
      }
      
      // Show summary
      console.log('\n📊 Validation Summary:');
      console.log(`  Total Tests: ${validation.totalTests}`);
      console.log(`  Passed: ${validation.passedTests}`);
      console.log(`  Failed: ${validation.failedTests}`);
      console.log(`  Warnings: ${validation.warningTests}`);
      
      // Show recommendations
      if (validation.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        validation.recommendations.forEach(rec => console.log(`  ${rec}`));
      }
      
      // Show critical errors
      const criticalErrors = validation.results.filter(r => !r.passed && r.severity === 'error');
      if (criticalErrors.length > 0) {
        console.log('\n🚨 Critical Issues:');
        criticalErrors.forEach(error => this.log(`  ${error.test}: ${error.message}`, 'error'));
        process.exit(1);
      }
    }
  }

  private async handlePerformanceCommand(subcommand: string): Promise<void> {
    switch (subcommand) {
      case 'monitor':
        await this.startPerformanceMonitoring();
        break;
      case 'report':
        await this.generatePerformanceReport();
        break;
      case 'trends':
        await this.showPerformanceTrends();
        break;
      default:
        this.log('Invalid performance command. Use: monitor, report, or trends', 'error');
        break;
    }
  }

  private async startPerformanceMonitoring(): Promise<void> {
    const duration = parseInt(this.options.duration || '60');
    this.log(`Starting performance monitoring for ${duration} minutes...`, 'info');
    
    performanceMonitor.startMonitoring();
    
    setTimeout(() => {
      this.log('Performance monitoring completed', 'success');
      process.exit(0);
    }, duration * 60 * 1000);
  }

  private async generatePerformanceReport(): Promise<void> {
    const spinner = this.spinner('Generating performance report');
    
    const hours = parseInt(this.options.hours || '1');
    const report = await performanceMonitor.generateReport(hours);
    
    spinner.stop();
    
    console.log(`\n📊 Performance Report (${report.period})\n`);
    
    // Summary
    this.log('Summary:', 'info');
    console.log(`  Total Queries: ${report.summary.totalQueries}`);
    console.log(`  Average Time: ${report.summary.averageExecutionTime}ms`);
    console.log(`  Slow Queries: ${report.summary.slowQueries}`);
    console.log(`  Fast Queries: ${report.summary.fastQueries}`);
    
    // Slowest queries
    if (report.slowestQueries.length > 0) {
      console.log('\n🐌 Slowest Queries:');
      report.slowestQueries.slice(0, 5).forEach((query, index) => {
        console.log(`  ${index + 1}. ${query.queryType}: ${query.executionTime}ms`);
      });
    }
    
    // Recommendations
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => console.log(`  ${rec}`));
    }
    
    // Alerts
    if (report.alerts.length > 0) {
      console.log('\n⚠️  Alerts:');
      report.alerts.forEach(alert => {
        const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`  ${icon} ${alert.message}`);
      });
    }
  }

  private async showPerformanceTrends(): Promise<void> {
    const spinner = this.spinner('Analyzing performance trends');
    
    const days = parseInt(this.options.days || '7');
    const trends = await performanceMonitor.getPerformanceTrends(days);
    
    spinner.stop();
    
    console.log(`\n📈 Performance Trends (${days} days)\n`);
    
    // Query volume trend
    if (trends.queryVolumeByDay.length > 0) {
      this.log('Query Volume by Day:', 'info');
      trends.queryVolumeByDay.forEach(day => {
        console.log(`  ${day.date}: ${day.count} queries`);
      });
    }
    
    // Response time trend
    if (trends.averageResponseTimeByDay.length > 0) {
      console.log('\n⏱️  Average Response Time by Day:');
      trends.averageResponseTimeByDay.forEach(day => {
        console.log(`  ${day.date}: ${day.avgTime}ms`);
      });
    }
    
    // Slow query trend
    if (trends.slowQueryTrend.length > 0) {
      console.log('\n🐌 Slow Query Trend by Day:');
      trends.slowQueryTrend.forEach(day => {
        console.log(`  ${day.date}: ${day.slowQueries} slow queries`);
      });
    }
  }

  private async handleOptimizeCommand(subcommand: string): Promise<void> {
    switch (subcommand) {
      case 'cache':
        await this.optimizeCache();
        break;
      case 'full':
        await this.runFullOptimization();
        break;
      default:
        this.log('Invalid optimize command. Use: cache or full', 'error');
        break;
    }
  }

  private async optimizeCache(): Promise<void> {
    const spinner = this.spinner('Optimizing query cache');
    
    await performanceMonitor.optimizeQueryCache();
    spinner.succeed('Query cache optimized successfully');
  }

  private async runFullOptimization(): Promise<void> {
    this.log('Starting complete database optimization...', 'info');
    
    try {
      // Step 1: Run pending migrations
      console.log('\n🔄 Step 1: Running pending migrations...');
      const migrationResults = await migrationRunner.runAllPendingMigrations();
      const failedMigrations = migrationResults.filter(r => !r.success);
      
      if (failedMigrations.length > 0) {
        this.log('Migration failures detected. Stopping optimization.', 'error');
        process.exit(1);
      }
      this.log('All migrations completed successfully', 'success');
      
      // Step 2: Validate schema
      console.log('\n🔍 Step 2: Validating database schema...');
      const validation = await schemaValidator.validateSchema();
      
      if (validation.overallStatus === 'failed') {
        this.log('Schema validation failed. Please fix critical issues.', 'error');
        process.exit(1);
      }
      this.log('Schema validation passed', 'success');
      
      // Step 3: Optimize cache
      console.log('\n⚡ Step 3: Optimizing query cache...');
      await performanceMonitor.optimizeQueryCache();
      this.log('Query cache optimized', 'success');
      
      // Step 4: Generate final report
      console.log('\n📊 Step 4: Generating optimization report...');
      const perfReport = await performanceMonitor.generateReport(1);
      
      this.log('Database optimization completed successfully!', 'success');
      
      // Show summary
      console.log('\n📊 Optimization Summary:');
      console.log(`  Migrations Applied: ${migrationResults.length}`);
      console.log(`  Schema Tests Passed: ${validation.passedTests}/${validation.totalTests}`);
      console.log(`  Performance Alerts: ${perfReport.alerts.length}`);
      
      if (validation.recommendations.length > 0) {
        console.log('\n💡 Additional Recommendations:');
        validation.recommendations.forEach(rec => console.log(`  ${rec}`));
      }
      
    } catch (error) {
      this.log(`Optimization failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      process.exit(1);
    }
  }

  private showHelp(): void {
    console.log(`
🚀 Database CLI - Starships.ai

USAGE:
  node db-cli.js <command> [subcommand] [options]

COMMANDS:
  migration <subcommand>    Database migration management
    run <id>                Run a specific migration
    run-all                 Run all pending migrations
    rollback <id>           Rollback a specific migration
    status                  Show migration status

  validate <subcommand>     Database schema validation
    schema [--report]       Validate schema (use --report for detailed output)

  performance <subcommand>  Performance monitoring
    monitor [--duration N]  Start monitoring (default: 60 minutes)
    report [--hours N]      Generate report (default: 1 hour)
    trends [--days N]       Show trends (default: 7 days)

  optimize <subcommand>     Database optimization
    cache                   Optimize query cache
    full                    Run complete optimization

  help                      Show this help message

OPTIONS:
  --force, -f              Force operation
  --report, -r             Generate detailed report
  --hours N, -h N          Number of hours
  --days N, -d N           Number of days
  --duration N             Duration in minutes

EXAMPLES:
  node db-cli.js migration run-all
  node db-cli.js validate schema --report
  node db-cli.js performance report --hours 24
  node db-cli.js optimize full
`);
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new DatabaseCLI();
  cli.run().catch(error => {
    console.error('CLI Error:', error);
    process.exit(1);
  });
}

export { DatabaseCLI };