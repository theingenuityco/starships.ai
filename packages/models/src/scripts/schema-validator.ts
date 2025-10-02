import { getConnection } from '@/helpers/database';

/**
 * Schema Validation and Data Integrity Checker for PostgreSQL
 *
 * Provides comprehensive validation of database schema,
 * data integrity checks, and performance monitoring.
 */

export interface ValidationResult {
  category: string;
  test: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
  details?: Record<string, unknown>;
}

export interface SchemaValidationReport {
  timestamp: string;
  overallStatus: 'passed' | 'failed' | 'warnings';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  warningTests: number;
  results: ValidationResult[];
  recommendations: string[];
}

export class SchemaValidator {
  private connection = getConnection();

  /**
   * Run complete schema validation
   */
  async validateSchema(): Promise<SchemaValidationReport> {
    const results: ValidationResult[] = [];
    const recommendations: string[] = [];

    // Run all validation categories
    await this.validateConstraints(results);
    await this.validateIndexes(results);
    await this.validateRelationships(results);
    await this.validateDataIntegrity(results);
    await this.validatePerformance(results);
    await this.validateFullTextSearch(results);

    // Generate recommendations
    this.generateRecommendations(results, recommendations);

    // Calculate summary
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.filter((r) => !r.passed && r.severity === 'error').length;
    const warningTests = results.filter((r) => !r.passed && r.severity === 'warning').length;

    const overallStatus = failedTests > 0 ? 'failed' : warningTests > 0 ? 'warnings' : 'passed';

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      totalTests: results.length,
      passedTests,
      failedTests,
      warningTests,
      results,
      recommendations,
    };
  }

  /**
   * Validate database constraints
   */
  private async validateConstraints(results: ValidationResult[]): Promise<void> {
    try {
      // Check primary key constraints
      const primaryKeys = await this.connection.query<{
        table_name: string;
        constraint_name: string;
      }>(`
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
      `);

      const expectedTables = ['users', 'starships', 'agents', 'conversations', 'messages', 'workflows'];
      const missingPks = expectedTables.filter((table) => !primaryKeys.some((pk) => pk.table_name === table));

      results.push({
        category: 'Constraints',
        test: 'Primary key constraints',
        passed: missingPks.length === 0,
        message:
          missingPks.length === 0
            ? `All ${expectedTables.length} core tables have primary keys`
            : `Missing primary keys: ${missingPks.join(', ')}`,
        severity: missingPks.length === 0 ? 'info' : 'error',
        details: { found: primaryKeys.length, expected: expectedTables.length, missing: missingPks },
      });

      // Check foreign key constraints
      const foreignKeys = await this.connection.query<{
        table_name: string;
        constraint_name: string;
      }>(`
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      `);

      results.push({
        category: 'Constraints',
        test: 'Foreign key constraints',
        passed: foreignKeys.length >= 10,
        message: `Found ${foreignKeys.length} foreign key constraints`,
        severity: foreignKeys.length >= 10 ? 'info' : 'warning',
        details: { count: foreignKeys.length, expected: 10 },
      });

      // Check unique constraints
      const uniqueConstraints = await this.connection.query<{
        table_name: string;
        constraint_name: string;
      }>(`
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
      `);

      results.push({
        category: 'Constraints',
        test: 'Unique constraints',
        passed: uniqueConstraints.length >= 5,
        message: `Found ${uniqueConstraints.length} unique constraints`,
        severity: uniqueConstraints.length >= 5 ? 'info' : 'warning',
        details: { count: uniqueConstraints.length, expected: 5 },
      });

      // Check check constraints
      const checkConstraints = await this.connection.query<{
        table_name: string;
        constraint_name: string;
      }>(`
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'CHECK'
        AND tc.table_schema = 'public'
      `);

      results.push({
        category: 'Constraints',
        test: 'Check constraints',
        passed: checkConstraints.length >= 3,
        message: `Found ${checkConstraints.length} check constraints`,
        severity: checkConstraints.length >= 3 ? 'info' : 'warning',
        details: { count: checkConstraints.length, expected: 3 },
      });
    } catch (error) {
      results.push({
        category: 'Constraints',
        test: 'Constraint validation',
        passed: false,
        message: `Failed to validate constraints: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      });
    }
  }

  /**
   * Validate database indexes
   */
  private async validateIndexes(results: ValidationResult[]): Promise<void> {
    try {
      // Check basic indexes
      const indexes = await this.connection.query<{
        tablename: string;
        indexname: string;
        indexdef: string;
      }>(`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes 
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `);

      results.push({
        category: 'Indexes',
        test: 'Total indexes',
        passed: indexes.length >= 15,
        message: `Found ${indexes.length} indexes`,
        severity: indexes.length >= 15 ? 'info' : 'warning',
        details: { count: indexes.length, expected: 15 },
      });

      // Check GIN indexes (for JSONB and full-text search)
      const ginIndexes = indexes.filter((i) => i.indexdef.includes('USING gin'));
      results.push({
        category: 'Indexes',
        test: 'GIN indexes for JSONB/full-text',
        passed: ginIndexes.length >= 5,
        message: `Found ${ginIndexes.length} GIN indexes`,
        severity: ginIndexes.length >= 5 ? 'info' : 'warning',
        details: { count: ginIndexes.length, expected: 5 },
      });

      // Check unique indexes
      const uniqueIndexes = indexes.filter((i) => i.indexdef.includes('UNIQUE'));
      results.push({
        category: 'Indexes',
        test: 'Unique indexes',
        passed: uniqueIndexes.length >= 8,
        message: `Found ${uniqueIndexes.length} unique indexes`,
        severity: uniqueIndexes.length >= 8 ? 'info' : 'warning',
        details: { count: uniqueIndexes.length, expected: 8 },
      });
    } catch (error) {
      results.push({
        category: 'Indexes',
        test: 'Index validation',
        passed: false,
        message: `Failed to validate indexes: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      });
    }
  }

  /**
   * Validate relationships and referential integrity
   */
  private async validateRelationships(results: ValidationResult[]): Promise<void> {
    try {
      // Check for orphaned records (records that should have foreign key relationships but don't)

      // Check for agents without starships (if starship_id is required)
      const orphanedAgents = await this.connection.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM agents a
        LEFT JOIN starships s ON a.starship_id = s.id
        WHERE a.starship_id IS NOT NULL AND s.id IS NULL
      `);

      results.push({
        category: 'Relationships',
        test: 'Orphaned agents',
        passed: parseInt(orphanedAgents[0]?.count || '0') === 0,
        message: `Found ${orphanedAgents[0]?.count || 0} orphaned agents`,
        severity: parseInt(orphanedAgents[0]?.count || '0') === 0 ? 'info' : 'warning',
        details: { count: parseInt(orphanedAgents[0]?.count || '0') },
      });

      // Check for conversations without starships
      const orphanedConversations = await this.connection.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM conversations c
        LEFT JOIN starships s ON c.starship_id = s.id
        WHERE c.starship_id IS NOT NULL AND s.id IS NULL
      `);

      results.push({
        category: 'Relationships',
        test: 'Orphaned conversations',
        passed: parseInt(orphanedConversations[0]?.count || '0') === 0,
        message: `Found ${orphanedConversations[0]?.count || 0} orphaned conversations`,
        severity: parseInt(orphanedConversations[0]?.count || '0') === 0 ? 'info' : 'warning',
        details: { count: parseInt(orphanedConversations[0]?.count || '0') },
      });

      // Check for messages without conversations
      const orphanedMessages = await this.connection.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM messages m
        LEFT JOIN conversations c ON m.conversation_id = c.id
        WHERE m.conversation_id IS NOT NULL AND c.id IS NULL
      `);

      results.push({
        category: 'Relationships',
        test: 'Orphaned messages',
        passed: parseInt(orphanedMessages[0]?.count || '0') === 0,
        message: `Found ${orphanedMessages[0]?.count || 0} orphaned messages`,
        severity: parseInt(orphanedMessages[0]?.count || '0') === 0 ? 'info' : 'error',
        details: { count: parseInt(orphanedMessages[0]?.count || '0') },
      });
    } catch (error) {
      results.push({
        category: 'Relationships',
        test: 'Relationship validation',
        passed: false,
        message: `Failed to validate relationships: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      });
    }
  }

  /**
   * Validate data integrity
   */
  private async validateDataIntegrity(results: ValidationResult[]): Promise<void> {
    try {
      // Check for valid starship statuses
      const invalidStarshipStatuses = await this.connection.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM starships
        WHERE status NOT IN ('active', 'inactive', 'restricted', 'disabled', 'pending_payment')
      `);

      results.push({
        category: 'Data Integrity',
        test: 'Valid starship statuses',
        passed: parseInt(invalidStarshipStatuses[0]?.count || '0') === 0,
        message: `Found ${invalidStarshipStatuses[0]?.count || 0} starships with invalid status`,
        severity: parseInt(invalidStarshipStatuses[0]?.count || '0') === 0 ? 'info' : 'error',
        details: { count: parseInt(invalidStarshipStatuses[0]?.count || '0') },
      });

      // Check for starships without names
      const starshipsWithoutNames = await this.connection.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM starships
        WHERE name IS NULL OR name = ''
      `);

      results.push({
        category: 'Data Integrity',
        test: 'Starships with names',
        passed: parseInt(starshipsWithoutNames[0]?.count || '0') === 0,
        message: `Found ${starshipsWithoutNames[0]?.count || 0} starships without names`,
        severity: parseInt(starshipsWithoutNames[0]?.count || '0') === 0 ? 'info' : 'error',
        details: { count: parseInt(starshipsWithoutNames[0]?.count || '0') },
      });

      // Check for valid email formats in users table
      const invalidEmails = await this.connection.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM users
        WHERE email IS NOT NULL 
        AND email != ''
        AND email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'
      `);

      results.push({
        category: 'Data Integrity',
        test: 'Valid email formats',
        passed: parseInt(invalidEmails[0]?.count || '0') === 0,
        message: `Found ${invalidEmails[0]?.count || 0} users with invalid email formats`,
        severity: parseInt(invalidEmails[0]?.count || '0') === 0 ? 'info' : 'warning',
        details: { count: parseInt(invalidEmails[0]?.count || '0') },
      });

      // Check for valid date formats (created_at, updated_at)
      const invalidDates = await this.connection.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM starships
        WHERE created_at IS NULL OR updated_at IS NULL
      `);

      results.push({
        category: 'Data Integrity',
        test: 'Valid timestamp fields',
        passed: parseInt(invalidDates[0]?.count || '0') === 0,
        message: `Found ${invalidDates[0]?.count || 0} records with invalid timestamps`,
        severity: parseInt(invalidDates[0]?.count || '0') === 0 ? 'info' : 'warning',
        details: { count: parseInt(invalidDates[0]?.count || '0') },
      });
    } catch (error) {
      results.push({
        category: 'Data Integrity',
        test: 'Data integrity validation',
        passed: false,
        message: `Failed to validate data integrity: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      });
    }
  }

  /**
   * Validate performance characteristics
   */
  private async validatePerformance(results: ValidationResult[]): Promise<void> {
    try {
      // Test query performance for common operations
      const startTime = Date.now();

      await this.connection.query(`
        SELECT COUNT(*) as count
        FROM starships
        WHERE status = 'active'
        LIMIT 100
      `);

      const queryTime = Date.now() - startTime;

      results.push({
        category: 'Performance',
        test: 'Basic starship query performance',
        passed: queryTime < 100,
        message: `Query executed in ${queryTime}ms`,
        severity: queryTime < 100 ? 'info' : queryTime < 500 ? 'warning' : 'error',
        details: { executionTime: queryTime, threshold: 100 },
      });

      // Check database size
      const dbSize = await this.connection.query<{
        size: string;
        table_count: string;
      }>(`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as size,
          (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count
      `);

      const tableCount = parseInt(dbSize[0]?.table_count || '0');
      results.push({
        category: 'Performance',
        test: 'Database structure check',
        passed: tableCount >= 15,
        message: `Database contains ${tableCount} tables, size: ${dbSize[0]?.size || 'unknown'}`,
        severity: tableCount >= 15 ? 'info' : 'warning',
        details: { tableCount, expectedTables: 15, size: dbSize[0]?.size },
      });

      // Check for unused indexes (this is a complex query and might be slow)
      try {
        const unusedIndexes = await this.connection.query<{ count: string }>(`
          SELECT COUNT(*) as count
          FROM pg_stat_user_indexes 
          WHERE idx_scan = 0
          AND schemaname = 'public'
        `);

        results.push({
          category: 'Performance',
          test: 'Unused indexes check',
          passed: parseInt(unusedIndexes[0]?.count || '0') < 5,
          message: `Found ${unusedIndexes[0]?.count || 0} unused indexes`,
          severity: parseInt(unusedIndexes[0]?.count || '0') < 5 ? 'info' : 'warning',
          details: { count: parseInt(unusedIndexes[0]?.count || '0'), threshold: 5 },
        });
      } catch {
        // Ignore if pg_stat_user_indexes is not available
        results.push({
          category: 'Performance',
          test: 'Unused indexes check',
          passed: true,
          message: 'Index usage statistics not available',
          severity: 'info',
        });
      }
    } catch (error) {
      results.push({
        category: 'Performance',
        test: 'Performance validation',
        passed: false,
        message: `Failed to validate performance: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
      });
    }
  }

  /**
   * Validate full-text search configuration
   */
  private async validateFullTextSearch(results: ValidationResult[]): Promise<void> {
    try {
      // Check if pg_trgm extension is available
      const extensions = await this.connection.query<{ extname: string }>(`
        SELECT extname
        FROM pg_extension
        WHERE extname = 'pg_trgm'
      `);

      results.push({
        category: 'Full-Text Search',
        test: 'pg_trgm extension',
        passed: extensions.length > 0,
        message: extensions.length > 0 ? 'pg_trgm extension is installed' : 'pg_trgm extension not found',
        severity: extensions.length > 0 ? 'info' : 'warning',
      });

      // Check for full-text search indexes (GIN indexes with to_tsvector)
      const ftsIndexes = await this.connection.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexdef LIKE '%to_tsvector%'
        AND indexdef LIKE '%gin%'
      `);

      results.push({
        category: 'Full-Text Search',
        test: 'Full-text search indexes',
        passed: parseInt(ftsIndexes[0]?.count || '0') >= 5,
        message: `Found ${ftsIndexes[0]?.count || 0} full-text search indexes`,
        severity: parseInt(ftsIndexes[0]?.count || '0') >= 5 ? 'info' : 'warning',
        details: { count: parseInt(ftsIndexes[0]?.count || '0'), expected: 5 },
      });

      // Test search functionality
      try {
        await this.connection.query(`
          SELECT to_tsvector('english', 'test search functionality')
        `);

        results.push({
          category: 'Full-Text Search',
          test: 'Full-text search functionality',
          passed: true,
          message: 'Full-text search is functional',
          severity: 'info',
        });
      } catch {
        results.push({
          category: 'Full-Text Search',
          test: 'Full-text search functionality',
          passed: false,
          message: 'Full-text search functionality test failed',
          severity: 'warning',
        });
      }
    } catch (error) {
      results.push({
        category: 'Full-Text Search',
        test: 'Full-text search validation',
        passed: false,
        message: `Failed to validate full-text search: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'warning',
      });
    }
  }

  /**
   * Generate recommendations based on validation results
   */
  private generateRecommendations(results: ValidationResult[], recommendations: string[]): void {
    const failedTests = results.filter((r) => !r.passed);
    const performanceIssues = results.filter((r) => r.category === 'Performance' && !r.passed);
    const integrityIssues = results.filter((r) => r.category === 'Data Integrity' && !r.passed);

    if (failedTests.length === 0) {
      recommendations.push('✅ All validation tests passed! Your database is well-optimized.');
      return;
    }

    if (performanceIssues.length > 0) {
      recommendations.push('🚀 Consider running ANALYZE to update query planner statistics');
      recommendations.push('📊 Monitor query performance and consider additional indexes for slow queries');
      recommendations.push('🔍 Review unused indexes and consider dropping them to save space');
    }

    if (integrityIssues.length > 0) {
      recommendations.push('🔧 Run data cleanup procedures to fix integrity issues');
      recommendations.push('📋 Implement data validation in application layer to prevent future issues');
    }

    const missingIndexes = results.filter((r) => r.category === 'Indexes' && !r.passed && r.severity === 'warning');
    if (missingIndexes.length > 0) {
      recommendations.push('🔍 Consider adding missing performance indexes for better query performance');
    }

    const constraintIssues = results.filter((r) => r.category === 'Constraints' && !r.passed && r.severity === 'error');
    if (constraintIssues.length > 0) {
      recommendations.push('⚠️ Critical: Missing database constraints may lead to data corruption');
      recommendations.push('🛠️ Run schema migrations immediately to ensure data integrity');
    }

    const ftsIssues = results.filter((r) => r.category === 'Full-Text Search' && !r.passed);
    if (ftsIssues.length > 0) {
      recommendations.push('🔎 Install pg_trgm extension for improved full-text search performance');
      recommendations.push('📝 Consider adding full-text search indexes for better search performance');
    }

    recommendations.push('📈 Schedule regular validation checks to maintain database health');
    recommendations.push('🔄 Consider setting up automated monitoring and alerting');
  }

  /**
   * Generate detailed validation report
   */
  async generateReport(): Promise<string> {
    const report = await this.validateSchema();

    let output = `
# Database Schema Validation Report
**Generated:** ${report.timestamp}
**Overall Status:** ${report.overallStatus.toUpperCase()}

## Summary
- **Total Tests:** ${report.totalTests}
- **Passed:** ${report.passedTests} ✅
- **Failed:** ${report.failedTests} ❌
- **Warnings:** ${report.warningTests} ⚠️

## Test Results by Category
`;

    const categories = [...new Set(report.results.map((r) => r.category))];

    for (const category of categories) {
      const categoryResults = report.results.filter((r) => r.category === category);
      const passed = categoryResults.filter((r) => r.passed).length;
      const total = categoryResults.length;

      output += `\n### ${category} (${passed}/${total})\n`;

      for (const result of categoryResults) {
        const icon = result.passed ? '✅' : result.severity === 'error' ? '❌' : '⚠️';
        output += `${icon} **${result.test}:** ${result.message}\n`;

        if (result.details) {
          output += `   *Details: ${JSON.stringify(result.details)}*\n`;
        }
      }
    }

    if (report.recommendations.length > 0) {
      output += `\n## Recommendations\n`;
      for (const rec of report.recommendations) {
        output += `- ${rec}\n`;
      }
    }

    return output;
  }
}

// Export singleton instance
export const schemaValidator = new SchemaValidator();
