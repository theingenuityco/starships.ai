import { getConnection } from '../../packages/models/src/connection';
import { StarshipRepository } from '../../packages/models/src/repositories/StarshipRepository';
import { MCPServerOptionRepository } from '../../packages/models/src/repositories/MCPServerOptionRepository';
import { ProductionHealthChecker } from './production-health-checker';

export interface LoadTestConfig {
  concurrentUsers: number;
  testDuration: number; // in seconds
  rampUpTime: number; // in seconds
  operations: {
    readConnectorInstances: number; // percentage
    createConnectorInstance: number; // percentage
    updateConnectorInstance: number; // percentage
    deleteConnectorInstance: number; // percentage
  };
  thresholds: {
    maxResponseTime: number; // in ms
    maxErrorRate: number; // percentage
    minThroughput: number; // operations per second
  };
}

export interface LoadTestResult {
  success: boolean;
  duration: number;
  totalOperations: number;
  operationsPerSecond: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  errorRate: number;
  errors: string[];
  warnings: string[];
  performanceMetrics: {
    memoryUsage: {
      initial: number;
      peak: number;
      final: number;
    };
    databaseConnections: {
      active: number;
      peak: number;
    };
    systemLoad: {
      cpu: number;
      memory: number;
    };
  };
  operationBreakdown: {
    readConnectorInstances: OperationStats;
    createConnectorInstance: OperationStats;
    updateConnectorInstance: OperationStats;
    deleteConnectorInstance: OperationStats;
  };
}

export interface OperationStats {
  count: number;
  averageTime: number;
  maxTime: number;
  minTime: number;
  errorCount: number;
  successRate: number;
}

/**
 * Comprehensive load testing for connector instance operations
 */
export class LoadTester {
  private config: LoadTestConfig;
  private connection = getConnection();
  private starshipRepo = new StarshipRepository();
  private mcpServerRepo = new MCPServerOptionRepository();
  private testData: {
    starships: any[];
    templates: any[];
    createdInstances: string[];
  } = {
    starships: [],
    templates: [],
    createdInstances: [],
  };

  constructor(config: LoadTestConfig) {
    this.config = config;
  }

  /**
   * Run comprehensive load test
   */
  async runLoadTest(): Promise<LoadTestResult> {
    console.log('🚀 LOAD TESTING STARTED');
    console.log('======================');
    console.log(`👥 Concurrent Users: ${this.config.concurrentUsers}`);
    console.log(`⏱️  Test Duration: ${this.config.testDuration}s`);
    console.log(`📈 Ramp-up Time: ${this.config.rampUpTime}s`);
    console.log('');

    const startTime = Date.now();
    const result: LoadTestResult = {
      success: false,
      duration: 0,
      totalOperations: 0,
      operationsPerSecond: 0,
      averageResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Number.MAX_VALUE,
      errorRate: 0,
      errors: [],
      warnings: [],
      performanceMetrics: {
        memoryUsage: {
          initial: 0,
          peak: 0,
          final: 0,
        },
        databaseConnections: {
          active: 0,
          peak: 0,
        },
        systemLoad: {
          cpu: 0,
          memory: 0,
        },
      },
      operationBreakdown: {
        readConnectorInstances: this.initOperationStats(),
        createConnectorInstance: this.initOperationStats(),
        updateConnectorInstance: this.initOperationStats(),
        deleteConnectorInstance: this.initOperationStats(),
      },
    };

    try {
      // Phase 1: Setup test data
      console.log('📋 Phase 1: Setting up test data...');
      await this.setupTestData();

      // Phase 2: Baseline performance check
      console.log('📊 Phase 2: Baseline performance check...');
      await this.runBaselineCheck(result);

      // Phase 3: Ramp-up load test
      console.log('📈 Phase 3: Ramping up load...');
      await this.rampUpLoad(result);

      // Phase 4: Sustained load test
      console.log('🔥 Phase 4: Sustained load test...');
      await this.sustainedLoadTest(result);

      // Phase 5: Performance analysis
      console.log('📊 Phase 5: Performance analysis...');
      await this.analyzePerformance(result);

      // Phase 6: Cleanup
      console.log('🧹 Phase 6: Cleanup...');
      await this.cleanup();

      result.duration = Date.now() - startTime;
      result.success = this.evaluateTestSuccess(result);

      console.log(`\n${result.success ? '✅' : '❌'} Load test completed in ${result.duration}ms`);
      this.printResults(result);

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.duration = Date.now() - startTime;
      console.error('\n❌ Load test failed:', error);
      return result;
    }
  }

  /**
   * Setup test data for load testing
   */
  private async setupTestData(): Promise<void> {
    // Get existing starships and templates
    this.testData.starships = await this.starshipRepo.findAll();
    this.testData.templates = await this.mcpServerRepo.findAll();

    if (this.testData.starships.length === 0) {
      throw new Error('No starships found for load testing');
    }

    if (this.testData.templates.length === 0) {
      throw new Error('No MCP server templates found for load testing');
    }

    console.log(
      `✅ Test data ready: ${this.testData.starships.length} starships, ${this.testData.templates.length} templates`
    );
  }

  /**
   * Run baseline performance check
   */
  private async runBaselineCheck(result: LoadTestResult): Promise<void> {
    const initialMemory = process.memoryUsage();
    result.performanceMetrics.memoryUsage.initial = initialMemory.heapUsed / 1024 / 1024;

    // Test single operations for baseline
    const baselineOps = [
      () => this.performReadOperation(),
      () => this.performCreateOperation(),
      () => this.performUpdateOperation(),
    ];

    let totalTime = 0;
    for (const op of baselineOps) {
      const startTime = Date.now();
      try {
        await op();
        const opTime = Date.now() - startTime;
        totalTime += opTime;
      } catch (error) {
        result.warnings.push(
          `Baseline operation failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const baselineAverage = totalTime / baselineOps.length;
    console.log(`📊 Baseline average response time: ${baselineAverage.toFixed(2)}ms`);
  }

  /**
   * Ramp up load gradually
   */
  private async rampUpLoad(result: LoadTestResult): Promise<void> {
    const rampUpSteps = 5;
    const stepDuration = this.config.rampUpTime / rampUpSteps;
    const usersPerStep = Math.ceil(this.config.concurrentUsers / rampUpSteps);

    for (let step = 1; step <= rampUpSteps; step++) {
      const currentUsers = Math.min(step * usersPerStep, this.config.concurrentUsers);
      console.log(`📈 Ramp-up step ${step}/${rampUpSteps}: ${currentUsers} users`);

      await this.runLoadStep(currentUsers, stepDuration, result);

      // Brief pause between ramp-up steps
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Run sustained load test
   */
  private async sustainedLoadTest(result: LoadTestResult): Promise<void> {
    const sustainedDuration = this.config.testDuration - this.config.rampUpTime;
    console.log(
      `🔥 Running sustained load: ${this.config.concurrentUsers} users for ${sustainedDuration}s`
    );

    await this.runLoadStep(this.config.concurrentUsers, sustainedDuration, result);
  }

  /**
   * Run a load test step with specified users and duration
   */
  private async runLoadStep(
    users: number,
    duration: number,
    result: LoadTestResult
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    const stepStartTime = Date.now();
    const endTime = stepStartTime + duration * 1000;

    // Start concurrent user simulations
    for (let i = 0; i < users; i++) {
      promises.push(this.simulateUser(endTime, result));
    }

    // Wait for all users to complete
    await Promise.all(promises);

    // Update peak memory usage
    const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    result.performanceMetrics.memoryUsage.peak = Math.max(
      result.performanceMetrics.memoryUsage.peak,
      currentMemory
    );
  }

  /**
   * Simulate a single user's operations
   */
  private async simulateUser(endTime: number, result: LoadTestResult): Promise<void> {
    while (Date.now() < endTime) {
      try {
        const operation = this.selectRandomOperation();
        const startTime = Date.now();

        await this.executeOperation(operation, result);

        const responseTime = Date.now() - startTime;
        this.updateOperationStats(operation, responseTime, true, result);

        result.totalOperations++;
        result.averageResponseTime =
          (result.averageResponseTime * (result.totalOperations - 1) + responseTime) /
          result.totalOperations;
        result.maxResponseTime = Math.max(result.maxResponseTime, responseTime);
        result.minResponseTime = Math.min(result.minResponseTime, responseTime);

        // Small delay between operations
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
        this.updateOperationStats('error', 0, false, result);
      }
    }
  }

  /**
   * Select random operation based on configured percentages
   */
  private selectRandomOperation(): string {
    const rand = Math.random() * 100;
    let cumulative = 0;

    const operations = [
      { name: 'read', percentage: this.config.operations.readConnectorInstances },
      { name: 'create', percentage: this.config.operations.createConnectorInstance },
      { name: 'update', percentage: this.config.operations.updateConnectorInstance },
      { name: 'delete', percentage: this.config.operations.deleteConnectorInstance },
    ];

    for (const op of operations) {
      cumulative += op.percentage;
      if (rand <= cumulative) {
        return op.name;
      }
    }

    return 'read'; // fallback
  }

  /**
   * Execute a specific operation
   */
  private async executeOperation(operation: string, result: LoadTestResult): Promise<void> {
    switch (operation) {
      case 'read':
        await this.performReadOperation();
        break;
      case 'create':
        await this.performCreateOperation();
        break;
      case 'update':
        await this.performUpdateOperation();
        break;
      case 'delete':
        await this.performDeleteOperation();
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Perform read connector instances operation
   */
  private async performReadOperation(): Promise<void> {
    const randomStarship =
      this.testData.starships[Math.floor(Math.random() * this.testData.starships.length)];
    await this.starshipRepo.getConnectorInstances(randomStarship.id);
  }

  /**
   * Perform create connector instance operation
   */
  private async performCreateOperation(): Promise<void> {
    const randomStarship =
      this.testData.starships[Math.floor(Math.random() * this.testData.starships.length)];
    const randomTemplate =
      this.testData.templates[Math.floor(Math.random() * this.testData.templates.length)];

    try {
      const instance = await this.starshipRepo.createConnectorInstance(
        randomStarship.id,
        randomTemplate.id
      );
      this.testData.createdInstances.push(instance.id);
    } catch (error) {
      // Instance might already exist - this is expected in load testing
      if (!(error instanceof Error) || !error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Perform update connector instance operation
   */
  private async performUpdateOperation(): Promise<void> {
    if (this.testData.createdInstances.length === 0) {
      // No instances to update, perform a read instead
      await this.performReadOperation();
      return;
    }

    const randomStarship =
      this.testData.starships[Math.floor(Math.random() * this.testData.starships.length)];
    const randomInstanceId =
      this.testData.createdInstances[
        Math.floor(Math.random() * this.testData.createdInstances.length)
      ];

    await this.starshipRepo.updateConnectorInstance(randomStarship.id, randomInstanceId, {
      status: Math.random() > 0.5 ? 'active' : 'inactive',
      lastUsed: new Date().toISOString(),
    });
  }

  /**
   * Perform delete connector instance operation
   */
  private async performDeleteOperation(): Promise<void> {
    if (this.testData.createdInstances.length === 0) {
      // No instances to delete, perform a read instead
      await this.performReadOperation();
      return;
    }

    const randomStarship =
      this.testData.starships[Math.floor(Math.random() * this.testData.starships.length)];
    const randomInstanceId = this.testData.createdInstances.pop()!; // Remove from array

    await this.starshipRepo.removeConnectorInstance(randomStarship.id, randomInstanceId);
  }

  /**
   * Update operation statistics
   */
  private updateOperationStats(
    operation: string,
    responseTime: number,
    success: boolean,
    result: LoadTestResult
  ): void {
    let stats: OperationStats;

    switch (operation) {
      case 'read':
        stats = result.operationBreakdown.readConnectorInstances;
        break;
      case 'create':
        stats = result.operationBreakdown.createConnectorInstance;
        break;
      case 'update':
        stats = result.operationBreakdown.updateConnectorInstance;
        break;
      case 'delete':
        stats = result.operationBreakdown.deleteConnectorInstance;
        break;
      default:
        return;
    }

    stats.count++;
    if (success) {
      stats.averageTime =
        (stats.averageTime * (stats.count - stats.errorCount - 1) + responseTime) /
        (stats.count - stats.errorCount);
      stats.maxTime = Math.max(stats.maxTime, responseTime);
      stats.minTime = Math.min(stats.minTime, responseTime);
    } else {
      stats.errorCount++;
    }
    stats.successRate = ((stats.count - stats.errorCount) / stats.count) * 100;
  }

  /**
   * Analyze performance after load test
   */
  private async analyzePerformance(result: LoadTestResult): Promise<void> {
    // Final memory usage
    const finalMemory = process.memoryUsage();
    result.performanceMetrics.memoryUsage.final = finalMemory.heapUsed / 1024 / 1024;

    // Calculate operations per second
    result.operationsPerSecond = result.totalOperations / (result.duration / 1000);

    // Calculate error rate
    const totalErrors =
      result.errors.length +
      result.operationBreakdown.readConnectorInstances.errorCount +
      result.operationBreakdown.createConnectorInstance.errorCount +
      result.operationBreakdown.updateConnectorInstance.errorCount +
      result.operationBreakdown.deleteConnectorInstance.errorCount;

    result.errorRate = (totalErrors / result.totalOperations) * 100;

    // Run health check to assess system state
    const healthChecker = new ProductionHealthChecker({ timeout: 10000 });
    const healthResult = await healthChecker.runQuickCheck();

    if (!healthResult.healthy) {
      result.warnings.push('System health check failed after load test');
    }

    // System load analysis (simplified)
    result.performanceMetrics.systemLoad.memory = result.performanceMetrics.memoryUsage.final;
    result.performanceMetrics.systemLoad.cpu = 0; // Would need more sophisticated CPU monitoring
  }

  /**
   * Cleanup test data
   */
  private async cleanup(): Promise<void> {
    // Clean up any remaining test instances
    for (const instanceId of this.testData.createdInstances) {
      try {
        const randomStarship =
          this.testData.starships[Math.floor(Math.random() * this.testData.starships.length)];
        await this.starshipRepo.removeConnectorInstance(randomStarship.id, instanceId);
      } catch (error) {
        // Instance might already be deleted - ignore
      }
    }

    this.testData.createdInstances = [];
    console.log('✅ Cleanup completed');
  }

  /**
   * Evaluate if the test was successful based on thresholds
   */
  private evaluateTestSuccess(result: LoadTestResult): boolean {
    const failures: string[] = [];

    if (result.averageResponseTime > this.config.thresholds.maxResponseTime) {
      failures.push(
        `Average response time (${result.averageResponseTime.toFixed(2)}ms) exceeds threshold (${this.config.thresholds.maxResponseTime}ms)`
      );
    }

    if (result.errorRate > this.config.thresholds.maxErrorRate) {
      failures.push(
        `Error rate (${result.errorRate.toFixed(2)}%) exceeds threshold (${this.config.thresholds.maxErrorRate}%)`
      );
    }

    if (result.operationsPerSecond < this.config.thresholds.minThroughput) {
      failures.push(
        `Throughput (${result.operationsPerSecond.toFixed(2)} ops/s) below threshold (${this.config.thresholds.minThroughput} ops/s)`
      );
    }

    result.errors.push(...failures);
    return failures.length === 0;
  }

  /**
   * Print detailed test results
   */
  private printResults(result: LoadTestResult): void {
    console.log('\n📊 LOAD TEST RESULTS');
    console.log('====================');
    console.log(`✅ Success: ${result.success ? 'YES' : 'NO'}`);
    console.log(`⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`🔢 Total Operations: ${result.totalOperations}`);
    console.log(`📈 Operations/Second: ${result.operationsPerSecond.toFixed(2)}`);
    console.log(`⚡ Avg Response Time: ${result.averageResponseTime.toFixed(2)}ms`);
    console.log(`🔺 Max Response Time: ${result.maxResponseTime}ms`);
    console.log(`🔻 Min Response Time: ${result.minResponseTime}ms`);
    console.log(`❌ Error Rate: ${result.errorRate.toFixed(2)}%`);

    console.log('\n💾 Memory Usage:');
    console.log(`   Initial: ${result.performanceMetrics.memoryUsage.initial.toFixed(2)}MB`);
    console.log(`   Peak: ${result.performanceMetrics.memoryUsage.peak.toFixed(2)}MB`);
    console.log(`   Final: ${result.performanceMetrics.memoryUsage.final.toFixed(2)}MB`);

    console.log('\n📋 Operation Breakdown:');
    Object.entries(result.operationBreakdown).forEach(([operation, stats]) => {
      console.log(`   ${operation}:`);
      console.log(`     Count: ${stats.count}`);
      console.log(`     Avg Time: ${stats.averageTime.toFixed(2)}ms`);
      console.log(`     Success Rate: ${stats.successRate.toFixed(1)}%`);
    });

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
    }
  }

  /**
   * Initialize operation stats
   */
  private initOperationStats(): OperationStats {
    return {
      count: 0,
      averageTime: 0,
      maxTime: 0,
      minTime: Number.MAX_VALUE,
      errorCount: 0,
      successRate: 100,
    };
  }
}

/**
 * CLI interface for load testing
 */
export async function runLoadTest(): Promise<void> {
  console.log('🚀 Connector Instance Load Testing');
  console.log('==================================');

  const config: LoadTestConfig = {
    concurrentUsers: parseInt(process.env.LOAD_TEST_USERS || '10'),
    testDuration: parseInt(process.env.LOAD_TEST_DURATION || '60'),
    rampUpTime: parseInt(process.env.LOAD_TEST_RAMP_UP || '10'),
    operations: {
      readConnectorInstances: 60,
      createConnectorInstance: 20,
      updateConnectorInstance: 15,
      deleteConnectorInstance: 5,
    },
    thresholds: {
      maxResponseTime: 1000,
      maxErrorRate: 5,
      minThroughput: 10,
    },
  };

  console.log('Configuration:', config);

  try {
    const loadTester = new LoadTester(config);
    const result = await loadTester.runLoadTest();

    if (result.success) {
      console.log('\n🎉 Load test completed successfully!');
      process.exit(0);
    } else {
      console.error('\n💥 Load test failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Load test failed with error:', error);
    process.exit(1);
  }
}

// Run load test if this script is executed directly
if (require.main === module) {
  runLoadTest().catch(console.error);
}
