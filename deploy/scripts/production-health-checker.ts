import { getConnection } from '../../packages/models/src/connection';
import { StarshipRepository } from '../../packages/models/src/repositories/StarshipRepository';
import { MCPServerOptionRepository } from '../../packages/models/src/repositories/MCPServerOptionRepository';

export interface HealthCheckConfig {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    responseTime: number;
    databaseConnectivity: boolean;
    repositoryFunctionality: boolean;
    dataIntegrity: boolean;
    performanceMetrics: {
      queryResponseTime: number;
      memoryUsage: number;
      activeConnections: number;
    };
  };
}

/**
 * Production health checker for connector instance architecture
 */
export class ProductionHealthChecker {
  private config: Required<HealthCheckConfig>;
  private connection = getConnection();

  constructor(config: HealthCheckConfig = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
    };
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<HealthCheckResult> {
    console.log('[HEALTH] 🏥 Running production health checks...');

    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    const metrics = {
      responseTime: 0,
      databaseConnectivity: false,
      repositoryFunctionality: false,
      dataIntegrity: false,
      performanceMetrics: {
        queryResponseTime: 0,
        memoryUsage: 0,
        activeConnections: 0,
      },
    };

    try {
      // Health Check 1: Database Connectivity
      console.log('[HEALTH] 🔌 Checking database connectivity...');
      metrics.databaseConnectivity = await this.checkDatabaseConnectivity(errors);

      // Health Check 2: Repository Functionality
      console.log('[HEALTH] 📚 Checking repository functionality...');
      metrics.repositoryFunctionality = await this.checkRepositoryFunctionality(errors);

      // Health Check 3: Data Integrity
      console.log('[HEALTH] 🔍 Checking data integrity...');
      metrics.dataIntegrity = await this.checkDataIntegrity(errors, warnings);

      // Health Check 4: Performance Metrics
      console.log('[HEALTH] 📊 Gathering performance metrics...');
      metrics.performanceMetrics = await this.gatherPerformanceMetrics(warnings);

      // Health Check 5: System Resources
      console.log('[HEALTH] 💾 Checking system resources...');
      await this.checkSystemResources(warnings);

      // Health Check 6: Connector Instance Operations
      console.log('[HEALTH] 🔗 Testing connector instance operations...');
      await this.testConnectorInstanceOperations(errors, warnings);

      metrics.responseTime = Date.now() - startTime;

      const healthy = errors.length === 0;

      console.log(
        `[HEALTH] ${healthy ? '✅' : '❌'} Health check completed in ${metrics.responseTime}ms`
      );

      return {
        healthy,
        errors,
        warnings,
        metrics,
      };
    } catch (error) {
      errors.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
      metrics.responseTime = Date.now() - startTime;

      return {
        healthy: false,
        errors,
        warnings,
        metrics,
      };
    }
  }

  /**
   * Check database connectivity with retry logic
   */
  private async checkDatabaseConnectivity(errors: string[]): Promise<boolean> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const session = this.connection.getSession();

        try {
          const result = await Promise.race([
            session.run('RETURN 1 as healthCheck'),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Database query timeout')), this.config.timeout)
            ),
          ]);

          if (
            Array.isArray(result) &&
            result.length > 0 &&
            result[0].records[0]?.get('healthCheck') === 1
          ) {
            return true;
          } else {
            throw new Error('Invalid database response');
          }
        } finally {
          await session.close();
        }
      } catch (error) {
        console.warn(
          `[HEALTH] Database connectivity attempt ${attempt}/${this.config.maxRetries} failed:`,
          error
        );

        if (attempt === this.config.maxRetries) {
          errors.push(
            `Database connectivity failed after ${this.config.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
          );
          return false;
        }

        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));
      }
    }

    return false;
  }

  /**
   * Check repository functionality
   */
  private async checkRepositoryFunctionality(errors: string[]): Promise<boolean> {
    try {
      const starshipRepo = new StarshipRepository();
      const mcpServerRepo = new MCPServerOptionRepository();

      // Test basic repository operations
      const starships = await starshipRepo.findAll();
      const mcpServers = await mcpServerRepo.findAll();

      if (!Array.isArray(starships)) {
        errors.push('StarshipRepository.findAll() did not return an array');
        return false;
      }

      if (!Array.isArray(mcpServers)) {
        errors.push('MCPServerOptionRepository.findAll() did not return an array');
        return false;
      }

      // Test connector instance operations if starships exist
      if (starships.length > 0) {
        const testStarship = starships[0];
        const connectorInstances = await starshipRepo.getConnectorInstances(testStarship.id);

        if (!Array.isArray(connectorInstances)) {
          errors.push('StarshipRepository.getConnectorInstances() did not return an array');
          return false;
        }
      }

      return true;
    } catch (error) {
      errors.push(
        `Repository functionality check failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Check data integrity
   */
  private async checkDataIntegrity(errors: string[], warnings: string[]): Promise<boolean> {
    const session = this.connection.getSession();

    try {
      // Check for orphaned connector instances
      const orphanedResult = await session.run(`
        MATCH (msc:MCPServerConnector)
        WHERE NOT EXISTS((msc)<-[:HAS_CONNECTOR_INSTANCE]-(:Starship))
           OR NOT EXISTS((msc)-[:CREATED_FROM]->(:MCPServerOption))
        RETURN count(msc) as orphanedCount
      `);

      const orphanedCount = orphanedResult.records[0]?.get('orphanedCount').toNumber() || 0;
      if (orphanedCount > 0) {
        errors.push(`Found ${orphanedCount} orphaned connector instances`);
      }

      // Check for duplicate instances
      const duplicateResult = await session.run(`
        MATCH (msc:MCPServerConnector)
        WITH msc.starshipId as starshipId, msc.templateId as templateId, count(msc) as instanceCount
        WHERE instanceCount > 1
        RETURN count(*) as duplicateCount
      `);

      const duplicateCount = duplicateResult.records[0]?.get('duplicateCount').toNumber() || 0;
      if (duplicateCount > 0) {
        errors.push(`Found ${duplicateCount} duplicate connector instances`);
      }

      // Check for old relationships (should be zero after migration)
      const oldRelResult = await session.run(`
        MATCH ()-[r:HAS_CONNECTOR]->()
        RETURN count(r) as oldRelCount
      `);

      const oldRelCount = oldRelResult.records[0]?.get('oldRelCount').toNumber() || 0;
      if (oldRelCount > 0) {
        warnings.push(
          `Found ${oldRelCount} old HAS_CONNECTOR relationships - migration may be incomplete`
        );
      }

      // Check for inconsistent data
      const inconsistentResult = await session.run(`
        MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)
        WHERE msc.starshipId <> s.id
        RETURN count(msc) as inconsistentCount
      `);

      const inconsistentCount =
        inconsistentResult.records[0]?.get('inconsistentCount').toNumber() || 0;
      if (inconsistentCount > 0) {
        errors.push(
          `Found ${inconsistentCount} connector instances with inconsistent starship IDs`
        );
      }

      return errors.length === 0;
    } catch (error) {
      errors.push(
        `Data integrity check failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * Gather performance metrics
   */
  private async gatherPerformanceMetrics(
    warnings: string[]
  ): Promise<HealthCheckResult['metrics']['performanceMetrics']> {
    const session = this.connection.getSession();

    try {
      // Measure query response time
      const queryStart = Date.now();
      await session.run(`
        MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)-[:CREATED_FROM]->(mso:MCPServerOption)
        RETURN count(*) as totalConnections
        LIMIT 100
      `);
      const queryResponseTime = Date.now() - queryStart;

      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const memoryUsedMB = memoryUsage.heapUsed / 1024 / 1024;

      // Estimate active connections (simplified)
      const activeConnections = 1; // This would be more sophisticated in a real implementation

      // Performance warnings
      if (queryResponseTime > 1000) {
        warnings.push(`Slow query performance: ${queryResponseTime}ms`);
      }

      if (memoryUsedMB > 500) {
        warnings.push(`High memory usage: ${memoryUsedMB.toFixed(2)}MB`);
      }

      return {
        queryResponseTime,
        memoryUsage: memoryUsedMB,
        activeConnections,
      };
    } catch (error) {
      warnings.push(
        `Could not gather performance metrics: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        queryResponseTime: -1,
        memoryUsage: -1,
        activeConnections: -1,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Check system resources
   */
  private async checkSystemResources(warnings: string[]): Promise<void> {
    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    if (memoryUsedPercent > 80) {
      warnings.push(`High memory usage: ${memoryUsedPercent.toFixed(1)}%`);
    }

    // Check uptime
    const uptimeHours = process.uptime() / 3600;
    if (uptimeHours < 0.1) {
      // Less than 6 minutes
      warnings.push(
        `Low uptime: ${uptimeHours.toFixed(2)} hours - system may have recently restarted`
      );
    }

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      warnings.push(`Old Node.js version: ${nodeVersion} - consider upgrading to v18+`);
    }
  }

  /**
   * Test connector instance operations
   */
  private async testConnectorInstanceOperations(
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    try {
      const starshipRepo = new StarshipRepository();
      const starships = await starshipRepo.findAll();

      if (starships.length === 0) {
        warnings.push('No starships found - cannot test connector instance operations');
        return;
      }

      // Test getting connector instances for the first starship
      const testStarship = starships[0];
      const connectorInstances = await starshipRepo.getConnectorInstances(testStarship.id);

      // Test should complete without errors
      if (!Array.isArray(connectorInstances)) {
        errors.push('Connector instance operations returned invalid data type');
      }

      // If there are connector instances, test their structure
      if (connectorInstances.length > 0) {
        const instance = connectorInstances[0];
        const requiredFields = ['id', 'starshipId', 'templateId', 'status', 'isActive'];

        for (const field of requiredFields) {
          if (!(field in instance)) {
            errors.push(`Connector instance missing required field: ${field}`);
          }
        }
      }
    } catch (error) {
      errors.push(
        `Connector instance operations test failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Run a quick health check (subset of full checks)
   */
  async runQuickCheck(): Promise<{ healthy: boolean; responseTime: number }> {
    const startTime = Date.now();

    try {
      const session = this.connection.getSession();

      try {
        await session.run('RETURN 1 as quickCheck');
        return {
          healthy: true,
          responseTime: Date.now() - startTime,
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
      };
    }
  }
}

/**
 * CLI interface for health checks
 */
export async function runHealthChecks(): Promise<void> {
  console.log('🏥 Production Health Check');
  console.log('=========================');

  try {
    const healthChecker = new ProductionHealthChecker();
    const result = await healthChecker.runAllChecks();

    if (result.healthy) {
      console.log('\n✅ All health checks passed!');
      console.log(`⏱️  Response time: ${result.metrics.responseTime}ms`);
      console.log('📊 Metrics:', result.metrics);
    } else {
      console.error('\n❌ Health checks failed!');
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

    if (!result.healthy) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Health check failed with error:', error);
    process.exit(1);
  }
}

// Run health checks if this script is executed directly
if (require.main === module) {
  runHealthChecks().catch(console.error);
}
