import { getConnection } from '../connection';

/**
 * Comprehensive Database Health Checker for Expedition System
 * 
 * Provides detailed health monitoring and validation for:
 * - Schema integrity and constraints
 * - Index performance and usage
 * - Data consistency and relationships
 * - Query performance benchmarks
 * - Expedition-specific validations
 * - System resource utilization
 */

export interface HealthCheckResult {
  overall: 'healthy' | 'warning' | 'critical';
  score: number; // 0-100
  timestamp: string;
  checks: {
    connectivity: HealthCheck;
    schema: HealthCheck;
    indexes: HealthCheck;
    constraints: HealthCheck;
    dataIntegrity: HealthCheck;
    performance: HealthCheck;
    expeditionSystem: HealthCheck;
    resources: HealthCheck;
  };
  recommendations: string[];
  criticalIssues: string[];
}

export interface HealthCheck {
  status: 'pass' | 'warning' | 'fail';
  score: number;
  message: string;
  details: any;
  executionTime: number;
}

export interface PerformanceBenchmark {
  queryName: string;
  query: string;
  expectedMaxTime: number;
  actualTime: number;
  status: 'pass' | 'warning' | 'fail';
}

export interface DataIntegrityCheck {
  checkName: string;
  description: string;
  query: string;
  expectedResult: any;
  actualResult: any;
  status: 'pass' | 'fail';
}

export class DatabaseHealthChecker {
  private connection: any = null;

  private getConnection() {
    if (!this.connection) {
      this.connection = getConnection();
    }
    return this.connection;
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    console.log('Starting comprehensive database health check...');
    const startTime = Date.now();

    const result: HealthCheckResult = {
      overall: 'healthy',
      score: 0,
      timestamp: new Date().toISOString(),
      checks: {
        connectivity: await this.checkConnectivity(),
        schema: await this.checkSchema(),
        indexes: await this.checkIndexes(),
        constraints: await this.checkConstraints(),
        dataIntegrity: await this.checkDataIntegrity(),
        performance: await this.checkPerformance(),
        expeditionSystem: await this.checkExpeditionSystem(),
        resources: await this.checkResources()
      },
      recommendations: [],
      criticalIssues: []
    };

    // Calculate overall score and status
    const checks = Object.values(result.checks);
    const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
    result.score = Math.round(totalScore / checks.length);

    // Determine overall status
    const failedChecks = checks.filter(c => c.status === 'fail').length;
    const warningChecks = checks.filter(c => c.status === 'warning').length;

    if (failedChecks > 0) {
      result.overall = 'critical';
    } else if (warningChecks > 2) {
      result.overall = 'warning';
    }

    // Collect recommendations and critical issues
    for (const [checkName, check] of Object.entries(result.checks)) {
      if (check.status === 'fail') {
        result.criticalIssues.push(`${checkName}: ${check.message}`);
      } else if (check.status === 'warning') {
        result.recommendations.push(`${checkName}: ${check.message}`);
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`Health check completed in ${totalTime}ms`);
    console.log(`Overall status: ${result.overall} (Score: ${result.score}/100)`);

    return result;
  }

  /**
   * Check database connectivity
   */
  private async checkConnectivity(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      await this.getConnection().executeQuery('RETURN 1 as test');
      
      return {
        status: 'pass',
        score: 100,
        message: 'Database connectivity is healthy',
        details: { connected: true },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Database connectivity failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { connected: false, error: error instanceof Error ? error.message : String(error) },
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check schema integrity
   */
  private async checkSchema(): Promise<HealthCheck> {
    const startTime = Date.now();
    const issues: string[] = [];
    let score = 100;

    try {
      // Check for required node labels
      const requiredLabels = [
        'User', 'Agent', 'Starship', 'Expedition', 
        'ExpeditionTask', 'ExpeditionMessage', 'ExpeditionResult'
      ];

      const labelResult = await this.getConnection().executeQuery(
        'CALL db.labels() YIELD label RETURN collect(label) as labels'
      );
      
      const existingLabels = new Set(labelResult[0]?.labels || []);
      const missingLabels = requiredLabels.filter(label => !existingLabels.has(label));

      if (missingLabels.length > 0) {
        issues.push(`Missing node labels: ${missingLabels.join(', ')}`);
        score -= missingLabels.length * 10;
      }

      // Check for required relationship types
      const requiredRelationships = [
        'OWNS', 'DEPLOYED_ON', 'HAS_EXPEDITION', 'HAS_TASK', 
        'HAS_MESSAGE', 'HAS_RESULT', 'ASSIGNED_TO', 'DEPENDS_ON'
      ];

      const relResult = await this.getConnection().executeQuery(
        'CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) as types'
      );
      
      const existingRels = new Set(relResult[0]?.types || []);
      const missingRels = requiredRelationships.filter(rel => !existingRels.has(rel));

      if (missingRels.length > 0) {
        issues.push(`Missing relationship types: ${missingRels.join(', ')}`);
        score -= missingRels.length * 5;
      }

      const status = score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'fail';
      const message = issues.length === 0 
        ? 'Schema integrity is healthy'
        : `Schema issues detected: ${issues.join('; ')}`;

      return {
        status,
        score: Math.max(0, score),
        message,
        details: { 
          existingLabels: Array.from(existingLabels),
          existingRelationships: Array.from(existingRels),
          issues 
        },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Schema check failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check index health and performance
   */
  private async checkIndexes(): Promise<HealthCheck> {
    const startTime = Date.now();
    const issues: string[] = [];
    let score = 100;

    try {
      // Get index information
      const indexResult = await this.getConnection().executeQuery(
        `SHOW INDEXES 
         YIELD name, type, entityType, labelsOrTypes, properties, state, populationPercent
         RETURN name, type, entityType, labelsOrTypes, properties, state, populationPercent`
      );

      const indexes = indexResult || [];
      const offlineIndexes = indexes.filter((idx: any) => idx.state !== 'ONLINE');
      const lowPopulationIndexes = indexes.filter((idx: any) => 
        idx.populationPercent !== null && idx.populationPercent < 100
      );

      if (offlineIndexes.length > 0) {
        issues.push(`${offlineIndexes.length} indexes are offline`);
        score -= offlineIndexes.length * 20;
      }

      if (lowPopulationIndexes.length > 0) {
        issues.push(`${lowPopulationIndexes.length} indexes have low population`);
        score -= lowPopulationIndexes.length * 10;
      }

      // Check for missing critical indexes
      const expeditionIndexes = indexes.filter((idx: any) => 
        idx.name && idx.name.includes('expedition')
      );

      if (expeditionIndexes.length < 10) {
        issues.push('Missing critical expedition system indexes');
        score -= 30;
      }

      const status = score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'fail';
      const message = issues.length === 0 
        ? `All ${indexes.length} indexes are healthy`
        : `Index issues detected: ${issues.join('; ')}`;

      return {
        status,
        score: Math.max(0, score),
        message,
        details: { 
          totalIndexes: indexes.length,
          offlineIndexes: offlineIndexes.length,
          expeditionIndexes: expeditionIndexes.length,
          issues 
        },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Index check failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check constraint integrity
   */
  private async checkConstraints(): Promise<HealthCheck> {
    const startTime = Date.now();
    const issues: string[] = [];
    let score = 100;

    try {
      // Get constraint information
      const constraintResult = await this.getConnection().executeQuery(
        `SHOW CONSTRAINTS 
         YIELD name, type, entityType, labelsOrTypes, properties
         RETURN name, type, entityType, labelsOrTypes, properties`
      );

      const constraints = constraintResult || [];
      
      // Check for required unique constraints
      const requiredUniqueConstraints = [
        'expedition_id_unique',
        'expedition_task_id_unique',
        'expedition_message_id_unique',
        'expedition_result_id_unique'
      ];

      const existingConstraintNames = new Set(
        constraints.map((c: any) => c.name).filter(Boolean)
      );

      const missingConstraints = requiredUniqueConstraints.filter(
        name => !existingConstraintNames.has(name)
      );

      if (missingConstraints.length > 0) {
        issues.push(`Missing required constraints: ${missingConstraints.join(', ')}`);
        score -= missingConstraints.length * 20;
      }

      // Test constraint violations
      try {
        const violationTests = await this.testConstraintViolations();
        if (violationTests.length > 0) {
          issues.push(`Constraint violations detected: ${violationTests.join(', ')}`);
          score -= violationTests.length * 15;
        }
      } catch (error) {
        issues.push('Unable to test constraint violations');
        score -= 10;
      }

      const status = score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'fail';
      const message = issues.length === 0 
        ? `All ${constraints.length} constraints are healthy`
        : `Constraint issues detected: ${issues.join('; ')}`;

      return {
        status,
        score: Math.max(0, score),
        message,
        details: { 
          totalConstraints: constraints.length,
          missingConstraints,
          issues 
        },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Constraint check failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Test for constraint violations
   */
  private async testConstraintViolations(): Promise<string[]> {
    const violations: string[] = [];

    try {
      // Check for duplicate expedition IDs
      const duplicateExpeditions = await this.getConnection().executeQuery(
        `MATCH (e:Expedition)
         WITH e.id as id, count(e) as count
         WHERE count > 1
         RETURN count(*) as duplicates`
      );

      if (duplicateExpeditions[0]?.duplicates > 0) {
        violations.push('Duplicate expedition IDs found');
      }

      // Check for orphaned tasks
      const orphanedTasks = await this.getConnection().executeQuery(
        `MATCH (t:ExpeditionTask)
         WHERE NOT EXISTS((e:Expedition)-[:HAS_TASK]->(t))
         RETURN count(t) as orphaned`
      );

      if (orphanedTasks[0]?.orphaned > 0) {
        violations.push(`${orphanedTasks[0].orphaned} orphaned tasks found`);
      }

    } catch (error) {
      violations.push('Error testing constraint violations');
    }

    return violations;
  }

  /**
   * Check data integrity
   */
  private async checkDataIntegrity(): Promise<HealthCheck> {
    const startTime = Date.now();
    const checks: DataIntegrityCheck[] = [];
    let score = 100;

    try {
      // Define integrity checks
      const integrityChecks = [
        {
          checkName: 'expedition_starship_relationship',
          description: 'All expeditions must belong to a starship',
          query: `MATCH (e:Expedition) 
                  WHERE NOT EXISTS((s:Starship)-[:HAS_EXPEDITION]->(e))
                  RETURN count(e) as orphaned`,
          expectedResult: 0
        },
        {
          checkName: 'task_expedition_relationship',
          description: 'All tasks must belong to an expedition',
          query: `MATCH (t:ExpeditionTask) 
                  WHERE NOT EXISTS((e:Expedition)-[:HAS_TASK]->(t))
                  RETURN count(t) as orphaned`,
          expectedResult: 0
        },
        {
          checkName: 'message_expedition_relationship',
          description: 'All messages must belong to an expedition',
          query: `MATCH (m:ExpeditionMessage) 
                  WHERE NOT EXISTS((e:Expedition)-[:HAS_MESSAGE]->(m))
                  RETURN count(m) as orphaned`,
          expectedResult: 0
        },
        {
          checkName: 'result_expedition_relationship',
          description: 'All results must belong to an expedition',
          query: `MATCH (r:ExpeditionResult) 
                  WHERE NOT EXISTS((e:Expedition)-[:HAS_RESULT]->(r))
                  RETURN count(r) as orphaned`,
          expectedResult: 0
        },
        {
          checkName: 'task_dependency_cycles',
          description: 'Task dependencies should not have cycles',
          query: `MATCH path = (t:ExpeditionTask)-[:DEPENDS_ON*]->(t)
                  RETURN count(path) as cycles`,
          expectedResult: 0
        }
      ];

      for (const check of integrityChecks) {
        try {
          const result = await this.getConnection().executeQuery(check.query);
          const actualResult = result[0] ? Object.values(result[0])[0] : null;
          
          const status = actualResult === check.expectedResult ? 'pass' : 'fail';
          
          checks.push({
            checkName: check.checkName,
            description: check.description,
            query: check.query,
            expectedResult: check.expectedResult,
            actualResult,
            status
          });

          if (status === 'fail') {
            score -= 15;
          }

        } catch (error) {
          checks.push({
            checkName: check.checkName,
            description: check.description,
            query: check.query,
            expectedResult: check.expectedResult,
            actualResult: `Error: ${error instanceof Error ? error.message : String(error)}`,
            status: 'fail'
          });
          score -= 20;
        }
      }

      const failedChecks = checks.filter(c => c.status === 'fail');
      const status = score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'fail';
      const message = failedChecks.length === 0 
        ? 'Data integrity is healthy'
        : `${failedChecks.length} integrity checks failed`;

      return {
        status,
        score: Math.max(0, score),
        message,
        details: { checks, failedChecks: failedChecks.length },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Data integrity check failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check query performance
   */
  private async checkPerformance(): Promise<HealthCheck> {
    const startTime = Date.now();
    const benchmarks: PerformanceBenchmark[] = [];
    let score = 100;

    try {
      // Define performance benchmarks
      const performanceTests = [
        {
          queryName: 'expedition_list_by_starship',
          query: `MATCH (s:Starship {id: 'test-starship'})-[:HAS_EXPEDITION]->(e:Expedition) 
                  RETURN count(e) LIMIT 1`,
          expectedMaxTime: 100
        },
        {
          queryName: 'task_dependencies_check',
          query: `MATCH (t:ExpeditionTask)-[:DEPENDS_ON]->(dep:ExpeditionTask) 
                  RETURN count(t) LIMIT 1`,
          expectedMaxTime: 200
        },
        {
          queryName: 'message_thread_traversal',
          query: `MATCH (m:ExpeditionMessage)-[:REPLIES_TO*]->(root:ExpeditionMessage) 
                  RETURN count(m) LIMIT 1`,
          expectedMaxTime: 300
        },
        {
          queryName: 'expedition_full_text_search',
          query: `CALL db.index.fulltext.queryNodes('expeditionAdvancedSearch', 'test') 
                  YIELD node RETURN count(node) LIMIT 1`,
          expectedMaxTime: 500
        },
        {
          queryName: 'agent_performance_aggregation',
          query: `MATCH (a:Agent)-[:ASSIGNED_TO]->(t:ExpeditionTask) 
                  WITH a, count(t) as taskCount 
                  RETURN avg(taskCount) LIMIT 1`,
          expectedMaxTime: 400
        }
      ];

      for (const test of performanceTests) {
        const testStart = Date.now();
        
        try {
          await this.getConnection().executeQuery(test.query);
          const actualTime = Date.now() - testStart;
          
          let status: 'pass' | 'warning' | 'fail' = 'pass';
          if (actualTime > test.expectedMaxTime * 2) {
            status = 'fail';
            score -= 20;
          } else if (actualTime > test.expectedMaxTime) {
            status = 'warning';
            score -= 10;
          }

          benchmarks.push({
            queryName: test.queryName,
            query: test.query,
            expectedMaxTime: test.expectedMaxTime,
            actualTime,
            status
          });

        } catch (error) {
          benchmarks.push({
            queryName: test.queryName,
            query: test.query,
            expectedMaxTime: test.expectedMaxTime,
            actualTime: -1,
            status: 'fail'
          });
          score -= 25;
        }
      }

      const failedBenchmarks = benchmarks.filter(b => b.status === 'fail');
      const warningBenchmarks = benchmarks.filter(b => b.status === 'warning');
      
      const status = score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'fail';
      const message = failedBenchmarks.length === 0 && warningBenchmarks.length === 0
        ? 'Query performance is healthy'
        : `Performance issues: ${failedBenchmarks.length} failed, ${warningBenchmarks.length} warnings`;

      return {
        status,
        score: Math.max(0, score),
        message,
        details: { 
          benchmarks, 
          failedCount: failedBenchmarks.length,
          warningCount: warningBenchmarks.length 
        },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Performance check failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check expedition system specific health
   */
  private async checkExpeditionSystem(): Promise<HealthCheck> {
    const startTime = Date.now();
    const issues: string[] = [];
    let score = 100;

    try {
      // Check expedition system components
      const systemChecks = [
        {
          name: 'expedition_workflow_states',
          query: `MATCH (e:Expedition)
                  WITH count(CASE WHEN e.status IN ['draft', 'planning', 'in-progress', 'review', 'completed', 'failed', 'cancelled'] THEN 1 END) as valid,
                       count(e) as total
                  RETURN valid, total`,
          validator: (result: any) => result.valid === result.total
        },
        {
          name: 'task_status_consistency',
          query: `MATCH (t:ExpeditionTask)
                  WITH count(CASE WHEN t.status IN ['pending', 'assigned', 'in-progress', 'blocked', 'review', 'completed', 'failed'] THEN 1 END) as valid,
                       count(t) as total
                  RETURN valid, total`,
          validator: (result: any) => result.valid === result.total
        },
        {
          name: 'message_role_consistency',
          query: `MATCH (m:ExpeditionMessage)
                  WITH count(CASE WHEN m.role IN ['user', 'first-officer', 'agent', 'system'] THEN 1 END) as valid,
                       count(m) as total
                  RETURN valid, total`,
          validator: (result: any) => result.valid === result.total
        },
        {
          name: 'result_quality_scores',
          query: `MATCH (r:ExpeditionResult)
                  WITH count(CASE WHEN r.quality.overall >= 0 AND r.quality.overall <= 100 THEN 1 END) as valid,
                       count(r) as total
                  RETURN valid, total`,
          validator: (result: any) => result.valid === result.total
        }
      ];

      for (const check of systemChecks) {
        try {
          const result = await this.getConnection().executeQuery(check.query);
          const data = result[0];
          
          if (!check.validator(data)) {
            issues.push(`${check.name}: validation failed`);
            score -= 20;
          }

        } catch (error) {
          issues.push(`${check.name}: check failed - ${error instanceof Error ? error.message : String(error)}`);
          score -= 25;
        }
      }

      // Check for expedition system cache nodes
      const cacheNodes = await this.getConnection().executeQuery(
        'MATCH (cache:QueryCache) RETURN count(cache) as count'
      );

      if (cacheNodes[0]?.count < 3) {
        issues.push('Missing expedition system cache nodes');
        score -= 15;
      }

      const status = score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'fail';
      const message = issues.length === 0 
        ? 'Expedition system is healthy'
        : `Expedition system issues: ${issues.join('; ')}`;

      return {
        status,
        score: Math.max(0, score),
        message,
        details: { issues, cacheNodes: cacheNodes[0]?.count || 0 },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Expedition system check failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check system resources
   */
  private async checkResources(): Promise<HealthCheck> {
    const startTime = Date.now();
    const issues: string[] = [];
    let score = 100;

    try {
      // Get database statistics
      const dbStats = await this.getConnection().executeQuery(
        `CALL dbms.queryJmx('org.neo4j:instance=kernel#0,name=Store file sizes') 
         YIELD attributes 
         RETURN attributes`
      );

      // Get node and relationship counts
      const nodeCounts = await this.getConnection().executeQuery(
        `MATCH (n) 
         RETURN labels(n) as labels, count(n) as count 
         ORDER BY count DESC`
      );

      const relCounts = await this.getConnection().executeQuery(
        `MATCH ()-[r]->() 
         RETURN type(r) as type, count(r) as count 
         ORDER BY count DESC`
      );

      const totalNodes = nodeCounts.reduce((sum: number, item: any) => sum + item.count, 0);
      const totalRels = relCounts.reduce((sum: number, item: any) => sum + item.count, 0);

      // Check for reasonable data distribution
      if (totalNodes === 0) {
        issues.push('No data found in database');
        score -= 50;
      } else if (totalNodes < 10) {
        issues.push('Very low data volume detected');
        score -= 20;
      }

      // Check for expedition data presence
      const expeditionNodes = nodeCounts.find((item: any) => 
        item.labels && item.labels.includes('Expedition')
      );

      if (!expeditionNodes || expeditionNodes.count === 0) {
        issues.push('No expedition data found');
        score -= 30;
      }

      const status = score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'fail';
      const message = issues.length === 0 
        ? `Resources healthy: ${totalNodes} nodes, ${totalRels} relationships`
        : `Resource issues: ${issues.join('; ')}`;

      return {
        status,
        score: Math.max(0, score),
        message,
        details: { 
          totalNodes, 
          totalRels, 
          nodeCounts: nodeCounts.slice(0, 10), // Top 10
          relCounts: relCounts.slice(0, 10),   // Top 10
          issues 
        },
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Resource check failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { error: error instanceof Error ? error.message : String(error) },
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Generate detailed health report
   */
  generateHealthReport(result: HealthCheckResult): string {
    const report = `
=== DATABASE HEALTH CHECK REPORT ===

Timestamp: ${result.timestamp}
Overall Status: ${result.overall.toUpperCase()}
Overall Score: ${result.score}/100

=== CHECK RESULTS ===

${Object.entries(result.checks).map(([name, check]) => `
${name.toUpperCase()}:
  Status: ${check.status.toUpperCase()}
  Score: ${check.score}/100
  Message: ${check.message}
  Execution Time: ${check.executionTime}ms
  Details: ${JSON.stringify(check.details, null, 2)}
`).join('\n')}

=== CRITICAL ISSUES ===
${result.criticalIssues.length > 0 
  ? result.criticalIssues.map(issue => `- ${issue}`).join('\n')
  : 'None'
}

=== RECOMMENDATIONS ===
${result.recommendations.length > 0 
  ? result.recommendations.map(rec => `- ${rec}`).join('\n')
  : 'None'
}

=== SUMMARY ===
- Connectivity: ${result.checks.connectivity.status}
- Schema: ${result.checks.schema.status}
- Indexes: ${result.checks.indexes.status}
- Constraints: ${result.checks.constraints.status}
- Data Integrity: ${result.checks.dataIntegrity.status}
- Performance: ${result.checks.performance.status}
- Expedition System: ${result.checks.expeditionSystem.status}
- Resources: ${result.checks.resources.status}

${result.overall === 'critical' 
  ? '⚠️  IMMEDIATE ATTENTION REQUIRED - Critical issues detected'
  : result.overall === 'warning'
  ? '⚠️  Some issues require attention'
  : '✅ System is healthy'
}
`;

    return report;
  }

  /**
   * Run quick health check (subset of full check)
   */
  async runQuickHealthCheck(): Promise<{ status: string; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Quick connectivity test
      await this.getConnection().executeQuery('RETURN 1');

      // Quick constraint check
      const constraints = await this.getConnection().executeQuery(
        'SHOW CONSTRAINTS YIELD name RETURN count(*) as count'
      );
      
      if (constraints[0]?.count < 5) {
        issues.push('Missing database constraints');
      }

      // Quick data check
      const expeditions = await this.getConnection().executeQuery(
        'MATCH (e:Expedition) RETURN count(e) as count LIMIT 1'
      );

      if (expeditions[0]?.count === 0) {
        issues.push('No expedition data found');
      }

    } catch (error) {
      issues.push(`Database connectivity failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const status = issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'warning' : 'critical';
    return { status, issues };
  }
}

// Export singleton instance
export const databaseHealthChecker = new DatabaseHealthChecker();