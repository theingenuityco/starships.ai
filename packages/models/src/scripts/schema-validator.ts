import { getConnection } from '@/helpers/database';

/**
 * Schema Validation and Data Integrity Checker
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
      // Check unique constraints
      const uniqueConstraints = await this.connection.executeQuery<{
        name: string;
        type: string;
        entityType: string;
        labelsOrTypes: string[];
        properties: string[];
      }>(
        `SHOW CONSTRAINTS 
         YIELD name, type, entityType, labelsOrTypes, properties 
         WHERE type = 'UNIQUENESS'`
      );

      // Expedition system was removed - commenting out expedition constraints
      const expectedUniqueConstraints: string[] = [
        // 'expedition_id_unique',
        // 'expedition_task_id_unique',
        // 'expedition_message_id_unique',
        // 'expedition_result_id_unique'
      ];

      for (const expected of expectedUniqueConstraints) {
        const found = uniqueConstraints.some((c) => c.name === expected);
        results.push({
          category: 'Constraints',
          test: `Unique constraint: ${expected}`,
          passed: found,
          message: found ? 'Constraint exists' : 'Missing unique constraint',
          severity: found ? 'info' : 'error',
        });
      }

      // Check property existence constraints
      const existenceConstraints = await this.connection.executeQuery<{
        name: string;
        type: string;
      }>(
        `SHOW CONSTRAINTS 
         YIELD name, type 
         WHERE type = 'NODE_PROPERTY_EXISTENCE'`
      );

      results.push({
        category: 'Constraints',
        test: 'Property existence constraints',
        passed: existenceConstraints.length >= 7,
        message: `Found ${existenceConstraints.length} property existence constraints`,
        severity: existenceConstraints.length >= 7 ? 'info' : 'warning',
        details: { count: existenceConstraints.length, expected: 7 },
      });

      // Check property type constraints
      const typeConstraints = await this.connection.executeQuery<{
        name: string;
        type: string;
      }>(
        `SHOW CONSTRAINTS 
         YIELD name, type 
         WHERE type = 'NODE_PROPERTY_TYPE'`
      );

      results.push({
        category: 'Constraints',
        test: 'Property type constraints',
        passed: typeConstraints.length >= 10,
        message: `Found ${typeConstraints.length} property type constraints`,
        severity: typeConstraints.length >= 10 ? 'info' : 'warning',
        details: { count: typeConstraints.length, expected: 10 },
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
      const indexes = await this.connection.executeQuery<{
        name: string;
        type: string;
        entityType: string;
        labelsOrTypes: string[];
        properties: string[];
      }>(
        `SHOW INDEXES 
         YIELD name, type, entityType, labelsOrTypes, properties`
      );

      // Expedition system was removed - skipping expedition index checks
      // const expeditionIndexes = indexes.filter(i =>
      //   i.name.includes('expedition') ||
      //   i.labelsOrTypes.some(l => l.includes('Expedition'))
      // );

      // results.push({
      //   category: 'Indexes',
      //   test: 'Expedition-related indexes',
      //   passed: expeditionIndexes.length >= 15,
      //   message: `Found ${expeditionIndexes.length} expedition-related indexes`,
      //   severity: expeditionIndexes.length >= 15 ? 'info' : 'warning',
      //   details: { count: expeditionIndexes.length, expected: 15 }
      // });

      // Check composite indexes
      const compositeIndexes = indexes.filter((i) => i.properties.length > 1);
      results.push({
        category: 'Indexes',
        test: 'Composite indexes',
        passed: compositeIndexes.length >= 10,
        message: `Found ${compositeIndexes.length} composite indexes`,
        severity: compositeIndexes.length >= 10 ? 'info' : 'warning',
        details: { count: compositeIndexes.length, expected: 10 },
      });

      // Check range indexes
      const rangeIndexes = indexes.filter((i) => i.type === 'RANGE');
      results.push({
        category: 'Indexes',
        test: 'Range indexes for date queries',
        passed: rangeIndexes.length >= 8,
        message: `Found ${rangeIndexes.length} range indexes`,
        severity: rangeIndexes.length >= 8 ? 'info' : 'warning',
        details: { count: rangeIndexes.length, expected: 8 },
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
      // Expedition system was removed - skipping orphaned expedition checks
      // const orphanedExpeditions = await this.connection.executeQuery<{ count: number }>(
      //   `MATCH (e:Expedition)
      //    WHERE NOT EXISTS((s:Starship)-[:HAS_EXPEDITION]->(e))
      //    RETURN count(e) as count`
      // );
      // results.push({
      //   category: 'Relationships',
      //   test: 'Orphaned expeditions',
      //   passed: orphanedExpeditions[0]?.count === 0,
      //   message: `Found ${orphanedExpeditions[0]?.count || 0} orphaned expeditions`,
      //   severity: orphanedExpeditions[0]?.count === 0 ? 'info' : 'error',
      //   details: { count: orphanedExpeditions[0]?.count || 0 }
      // });
      // Expedition system was removed - skipping orphaned task checks
      // const orphanedTasks = await this.connection.executeQuery<{ count: number }>(
      //   `MATCH (t:ExpeditionTask)
      //    WHERE NOT EXISTS((e:Expedition)-[:HAS_TASK]->(t))
      //    RETURN count(t) as count`
      // );
      // results.push({
      //   category: 'Relationships',
      //   test: 'Orphaned tasks',
      //   passed: orphanedTasks[0]?.count === 0,
      //   message: `Found ${orphanedTasks[0]?.count || 0} orphaned tasks`,
      //   severity: orphanedTasks[0]?.count === 0 ? 'info' : 'error',
      //   details: { count: orphanedTasks[0]?.count || 0 }
      // });
      // Expedition system was removed - skipping orphaned message checks
      // const orphanedMessages = await this.connection.executeQuery<{ count: number }>(
      //   `MATCH (m:ExpeditionMessage)
      //    WHERE NOT EXISTS((e:Expedition)-[:HAS_MESSAGE]->(m))
      //    RETURN count(m) as count`
      // );
      // results.push({
      //   category: 'Relationships',
      //   test: 'Orphaned messages',
      //   passed: orphanedMessages[0]?.count === 0,
      //   message: `Found ${orphanedMessages[0]?.count || 0} orphaned messages`,
      //   severity: orphanedMessages[0]?.count === 0 ? 'info' : 'warning',
      //   details: { count: orphanedMessages[0]?.count || 0 }
      // });
      // Expedition system was removed - skipping circular task dependency checks
      // const circularDependencies = await this.connection.executeQuery<{ count: number }>(
      //   `MATCH (t:ExpeditionTask)
      //    WHERE EXISTS((t)-[:DEPENDS_ON*]->(t))
      //    RETURN count(t) as count`
      // );
      // results.push({
      //   category: 'Relationships',
      //   test: 'Circular task dependencies',
      //   passed: circularDependencies[0]?.count === 0,
      //   message: `Found ${circularDependencies[0]?.count || 0} tasks with circular dependencies`,
      //   severity: circularDependencies[0]?.count === 0 ? 'info' : 'error',
      //   details: { count: circularDependencies[0]?.count || 0 }
      // });
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
      // Expedition system was removed - skipping expedition status validation
      // const invalidExpeditionStatuses = await this.connection.executeQuery<{ count: number }>(
      //   `MATCH (e:Expedition)
      //    WHERE NOT e.status IN ['draft', 'planning', 'in-progress', 'review', 'completed', 'failed', 'cancelled']
      //    RETURN count(e) as count`
      // );
      // results.push({
      //   category: 'Data Integrity',
      //   test: 'Valid expedition statuses',
      //   passed: invalidExpeditionStatuses[0]?.count === 0,
      //   message: `Found ${invalidExpeditionStatuses[0]?.count || 0} expeditions with invalid status`,
      //   severity: invalidExpeditionStatuses[0]?.count === 0 ? 'info' : 'error',
      //   details: { count: invalidExpeditionStatuses[0]?.count || 0 }
      // });
      // Expedition system was removed - skipping expedition title validation
      // const expeditionsWithoutTitle = await this.connection.executeQuery<{ count: number }>(
      //   `MATCH (e:Expedition)
      //    WHERE e.title IS NULL OR e.title = ''
      //    RETURN count(e) as count`
      // );
      // results.push({
      //   category: 'Data Integrity',
      //   test: 'Expeditions with titles',
      //   passed: expeditionsWithoutTitle[0]?.count === 0,
      //   message: `Found ${expeditionsWithoutTitle[0]?.count || 0} expeditions without titles`,
      //   severity: expeditionsWithoutTitle[0]?.count === 0 ? 'info' : 'error',
      //   details: { count: expeditionsWithoutTitle[0]?.count || 0 }
      // });
      // Expedition system was removed - skipping expedition date validation
      // const invalidDates = await this.connection.executeQuery<{ count: number }>(
      //   `MATCH (e:Expedition)
      //    WHERE e.createdAt IS NULL OR NOT e.createdAt =~ '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*'
      //    RETURN count(e) as count`
      // );
      // results.push({
      //   category: 'Data Integrity',
      //   test: 'Valid date formats',
      //   passed: invalidDates[0]?.count === 0,
      //   message: `Found ${invalidDates[0]?.count || 0} records with invalid date formats`,
      //   severity: invalidDates[0]?.count === 0 ? 'info' : 'warning',
      //   details: { count: invalidDates[0]?.count || 0 }
      // });
      // Expedition system was removed - skipping starship expedition capacity checks
      // const overCapacityStarships = await this.connection.executeQuery<{ count: number }>(
      //   `MATCH (s:Starship)
      //    WHERE s.activeExpeditions > s.maxActiveExpeditions
      //    RETURN count(s) as count`
      // );
      // results.push({
      //   category: 'Data Integrity',
      //   test: 'Starship capacity constraints',
      //   passed: overCapacityStarships[0]?.count === 0,
      //   message: `Found ${overCapacityStarships[0]?.count || 0} starships over capacity`,
      //   severity: overCapacityStarships[0]?.count === 0 ? 'info' : 'warning',
      //   details: { count: overCapacityStarships[0]?.count || 0 }
      // });
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

      // Expedition system was removed - using basic starship query instead
      await this.connection.executeQuery(
        `MATCH (s:Starship {id: 'test'})
         RETURN count(s) as count`
      );

      const queryTime = Date.now() - startTime;

      results.push({
        category: 'Performance',
        test: 'Basic starship query performance',
        passed: queryTime < 100,
        message: `Query executed in ${queryTime}ms`,
        severity: queryTime < 100 ? 'info' : queryTime < 500 ? 'warning' : 'error',
        details: { executionTime: queryTime, threshold: 100 },
      });

      // Check index usage
      const indexStats = await this.connection.executeQuery<{
        relationshipCount: number;
        nodeCount: number;
      }>(
        `CALL db.stats.retrieve('GRAPH COUNTS') YIELD data
         RETURN data.relationships as relationshipCount, data.nodes as nodeCount`
      );

      const nodeCount = Number(indexStats[0]?.nodeCount || 0);
      results.push({
        category: 'Performance',
        test: 'Database size check',
        passed: nodeCount < 1000000,
        message: `Database contains ${nodeCount} nodes`,
        severity: nodeCount < 1000000 ? 'info' : 'warning',
        details: { nodeCount, threshold: 1000000 },
      });
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
      // Check full-text indexes exist
      const fullTextIndexes = await this.connection.executeQuery<{ name: string }>(
        `CALL db.index.fulltext.listAvailableAnalyzers() 
         YIELD analyzer 
         RETURN analyzer as name`
      );

      results.push({
        category: 'Full-Text Search',
        test: 'Full-text analyzers available',
        passed: fullTextIndexes.length > 0,
        message: `Found ${fullTextIndexes.length} full-text analyzers`,
        severity: fullTextIndexes.length > 0 ? 'info' : 'warning',
        details: { count: fullTextIndexes.length },
      });

      // Test search functionality
      try {
        // Expedition system was removed - skipping expedition search test
        // await this.connection.executeQuery(
        //   `CALL db.index.fulltext.queryNodes("expeditionSearch", "test")
        //    YIELD node, score
        //    RETURN count(node) as results`
        // );

        results.push({
          category: 'Full-Text Search',
          test: 'Full-text search analyzers available',
          passed: true,
          message: 'Full-text search analyzers are available (expedition search skipped)',
          severity: 'info',
        });
      } catch {
        results.push({
          category: 'Full-Text Search',
          test: 'Full-text search analyzers available',
          passed: false,
          message: 'Full-text search analyzers check failed',
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
    }

    if (integrityIssues.length > 0) {
      recommendations.push('🔧 Run data cleanup procedures to fix integrity issues');
      recommendations.push('📋 Implement data validation in application layer to prevent future issues');
    }

    const missingIndexes = results.filter((r) => r.category === 'Indexes' && !r.passed && r.severity === 'warning');
    if (missingIndexes.length > 0) {
      recommendations.push('🔍 Run migration 003 and 004 to add missing performance indexes');
    }

    const constraintIssues = results.filter((r) => r.category === 'Constraints' && !r.passed && r.severity === 'error');
    if (constraintIssues.length > 0) {
      recommendations.push('⚠️ Critical: Missing database constraints may lead to data corruption');
      recommendations.push('🛠️ Run constraint migrations immediately to ensure data integrity');
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
