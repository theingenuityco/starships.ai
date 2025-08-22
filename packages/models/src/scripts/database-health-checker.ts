import { getConnection } from '../connection';

/**
 * Comprehensive Database Health Checker
 * 
 * Provides detailed health monitoring and validation for:
 * - Schema integrity and constraints
 * - Index performance and usage
 * - Data consistency and relationships
 * - Query performance benchmarks
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
    workflowSystem: HealthCheck;
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
        workflowSystem: await this.checkWorkflowSystem(),
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
      const requiredLabels: string[] = [
        'User', 'Agent', 'Starship', 'Workflow', 'WorkflowExecution'
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
      const requiredRelationships: string[] = [
        'OWNS', 'DEPLOYED_ON', 'HAS_WORKFLOW', 'EXECUTES'
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

      // Check for workflow system indexes
      const workflowIndexes = indexes.filter((idx: any) => 
        idx.name && (idx.name.includes('workflow') || idx.name.includes('starship') || idx.name.includes('agent'))
      );

      if (workflowIndexes.length < 5) {
        issues.push('Missing critical workflow system indexes');
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
          workflowIndexes: workflowIndexes.length,
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
      
      // Check for workflow system constraints
      const requiredUniqueConstraints: string[] = [
        'workflow_id_unique',
        'workflow_execution_id_unique'
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
      // Check for workflow constraint violations
      const duplicateWorkflows = await this.getConnection().executeQuery(
        `MATCH (w:Workflow)
         WITH w.id as id, count(w) as count
         WHERE count > 1
         RETURN count(*) as duplicates`
      );

      if (duplicateWorkflows[0]?.duplicates > 0) {
        violations.push('Duplicate workflow IDs found');
      }

      const orphanedExecutions = await this.getConnection().executeQuery(
        `MATCH (we:WorkflowExecution)
         WHERE NOT EXISTS((w:Workflow)-[:EXECUTES]->(we))
         RETURN count(we) as orphaned`
      );

      if (orphanedExecutions[0]?.orphaned > 0) {
        violations.push(`${orphanedExecutions[0].orphaned} orphaned workflow executions found`);
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
      // Check workflow system integrity
      const integrityChecks: Array<{
        checkName: string;
        description: string;
        query: string;
        expectedResult: any;
      }> = [
        {
          checkName: 'workflow_starship_relationship',
          description: 'All workflows must belong to a starship',
          query: `MATCH (w:Workflow) 
                  WHERE NOT EXISTS((s:Starship)-[:HAS_WORKFLOW]->(w))
                  RETURN count(w) as orphaned`,
          expectedResult: 0
        },
        {
          checkName: 'agent_starship_relationship',
          description: 'All agents must be deployed on a starship',
          query: `MATCH (a:Agent) 
                  WHERE NOT EXISTS((a)-[:DEPLOYED_ON]->(s:Starship))
                  RETURN count(a) as orphaned`,
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
      // Workflow system performance tests
      const performanceTests = [
        {
          queryName: 'basic_starship_query',
          query: `MATCH (s:Starship) 
                  RETURN count(s) LIMIT 1`,
          expectedMaxTime: 100
        },
        {
          queryName: 'user_starship_query',
          query: `MATCH (u:User)-[:OWNS]->(s:Starship) 
                  RETURN count(s) LIMIT 1`,
          expectedMaxTime: 200
        },
        {
          queryName: 'workflow_list_by_starship',
          query: `MATCH (s:Starship)-[:HAS_WORKFLOW]->(w:Workflow) 
                  RETURN count(w) LIMIT 1`,
          expectedMaxTime: 150
        },
        {
          queryName: 'agent_deployment_query',
          query: `MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) 
                  RETURN count(a) LIMIT 1`,
          expectedMaxTime: 200
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
   * Check workflow system specific health
   */
  private async checkWorkflowSystem(): Promise<HealthCheck> {
    const startTime = Date.now();
    const issues: string[] = [];
    let score = 100;
    
    try {
      // Check workflow node count
      const workflowCount = await this.getConnection().executeQuery(
        'MATCH (w:Workflow) RETURN count(w) as count'
      );
      
      // Check workflow execution count
      const executionCount = await this.getConnection().executeQuery(
        'MATCH (we:WorkflowExecution) RETURN count(we) as count'
      );
      
      const workflows = workflowCount[0]?.count || 0;
      const executions = executionCount[0]?.count || 0;
      
      if (workflows === 0) {
        issues.push('No workflows found in the system');
        score -= 20;
      }
      
      const status = score >= 90 ? 'pass' : score >= 70 ? 'warning' : 'fail';
      const message = issues.length === 0 
        ? `Workflow system healthy: ${workflows} workflows, ${executions} executions`
        : `Workflow system issues: ${issues.join('; ')}`;

      return {
        status,
        score: Math.max(0, score),
        message,
        details: { 
          workflowCount: workflows,
          executionCount: executions,
          issues 
        },
        executionTime: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        status: 'fail',
        score: 0,
        message: `Workflow system check failed: ${error instanceof Error ? error.message : String(error)}`,
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

      // Check for workflow data presence
      const workflowNodes = nodeCounts.find((item: any) => 
        item.labels && item.labels.includes('Workflow')
      );

      if (!workflowNodes || workflowNodes.count === 0) {
        issues.push('No workflow data found');
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
- Workflow System: ${result.checks.workflowSystem.status}
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

      // Check basic starship and workflow data
      const starships = await this.getConnection().executeQuery(
        'MATCH (s:Starship) RETURN count(s) as count LIMIT 1'
      );

      const workflows = await this.getConnection().executeQuery(
        'MATCH (w:Workflow) RETURN count(w) as count LIMIT 1'
      );

      if (starships[0]?.count === 0) {
        issues.push('No starship data found');
      }

      if (workflows[0]?.count === 0) {
        issues.push('No workflow data found');
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