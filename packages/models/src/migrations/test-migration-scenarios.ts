import { getConnection, createConnection } from '../connection';
import { Session } from 'neo4j-driver';
import { v4 as uuidv4 } from 'uuid';
import {
  ConnectorInstanceMigration,
  MigrationResult,
  RollbackData,
  ValidationResult,
} from './001-connector-instances';
import { StarshipRepository } from '../repositories/StarshipRepository';
import { MCPServerOptionRepository } from '../repositories/MCPServerOptionRepository';
import { Starship, MCPServerOption, User } from '../types';

/**
 * Performance benchmark thresholds as specified in requirements
 */
export const PERFORMANCE_BENCHMARKS = {
  MIGRATION_TIME_PER_100_RELATIONSHIPS: 1000, // <1 second per 100 relationships (in ms)
  MEMORY_USAGE_FOR_10K_RELATIONSHIPS: 100 * 1024 * 1024, // <100MB for 10,000 relationships (in bytes)
  DATABASE_LOCK_TIME: 5000, // <5 seconds total lock time (in ms)
};

/**
 * Test scenario results interface
 */
export interface TestScenarioResult {
  scenarioName: string;
  success: boolean;
  duration: number;
  migrationResult?: MigrationResult;
  validationResult?: ValidationResult;
  performanceMetrics?: {
    migrationTimePerRelationship: number;
    memoryUsage: number;
    lockTime: number;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Test data setup utilities
 */
export class MigrationTestDataSetup {
  private connection = getConnection();
  private starshipRepo = new StarshipRepository();
  private mcpServerRepo = new MCPServerOptionRepository();

  /**
   * Clean up all test data from the database
   */
  async cleanupTestData(): Promise<void> {
    console.log('[TEST-CLEANUP] 🧹 Cleaning up test data...');
    const session = this.connection.getSession();

    try {
      // Remove all test relationships and nodes
      await session.run(`
        MATCH (n)
        WHERE n.id STARTS WITH 'test-' OR n.id STARTS WITH 'migration-test-'
        DETACH DELETE n
      `);

      // Remove any remaining connector instances from tests
      await session.run(`
        MATCH (msc:MCPServerConnector)
        WHERE msc.id STARTS WITH 'test-' OR msc.starshipId STARTS WITH 'test-'
        DETACH DELETE msc
      `);

      console.log('[TEST-CLEANUP] ✅ Test data cleanup completed');
    } catch (error) {
      console.error('[TEST-CLEANUP] ❌ Error during cleanup:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a test user for starship ownership
   */
  async createTestUser(userId: string = `test-user-${uuidv4()}`): Promise<User> {
    const session = this.connection.getSession();
    const user: User = {
      id: userId,
      username: `testuser-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      displayName: 'Test User',
      createdAt: new Date().toISOString(),
    };

    try {
      await session.run('CREATE (u:User $props)', { props: user });
      console.log(`[TEST-SETUP] ✅ Created test user: ${user.id}`);
      return user;
    } finally {
      await session.close();
    }
  }

  /**
   * Create test MCP server options
   */
  async createTestMCPServers(count: number): Promise<MCPServerOption[]> {
    console.log(`[TEST-SETUP] 🔧 Creating ${count} test MCP servers...`);
    const servers: MCPServerOption[] = [];

    for (let i = 0; i < count; i++) {
      const server: MCPServerOption = {
        id: `test-mcp-server-${i + 1}-${uuidv4()}`,
        name: `Test MCP Server ${i + 1}`,
        command: i % 2 === 0 ? 'npx' : 'docker',
        args: [`@test/server-${i + 1}`],
        env: JSON.stringify({ TEST_VAR: `value-${i + 1}` }),
      };

      const createdServer = await this.mcpServerRepo.create({
        name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
      });

      servers.push({ ...server, id: createdServer.id });
    }

    console.log(`[TEST-SETUP] ✅ Created ${servers.length} test MCP servers`);
    return servers;
  }

  /**
   * Create test starships with HAS_CONNECTOR relationships
   */
  async createTestStarshipsWithConnectors(
    starshipCount: number,
    connectorsPerStarship: number,
    ownerId: string
  ): Promise<{ starships: Starship[]; servers: MCPServerOption[] }> {
    console.log(
      `[TEST-SETUP] 🚀 Creating ${starshipCount} starships with ${connectorsPerStarship} connectors each...`
    );

    // Create MCP servers first
    const totalServers = Math.max(connectorsPerStarship, 10); // Ensure we have enough servers
    const servers = await this.createTestMCPServers(totalServers);

    const starships: Starship[] = [];
    const session = this.connection.getSession();

    try {
      for (let i = 0; i < starshipCount; i++) {
        // Create starship
        const starship = await this.starshipRepo.create({
          slug: `test-starship-${i + 1}`,
          ownerId,
          class: i % 2 === 0 ? 'scout' : 'cruiser',
          name: `Test Starship ${i + 1}`,
          maxActiveExpeditions: i % 2 === 0 ? 3 : 6, // Scout=3, Cruiser=6
          status: 'active',
        });

        starships.push(starship);

        // Create HAS_CONNECTOR relationships
        for (let j = 0; j < connectorsPerStarship; j++) {
          const serverIndex = (i * connectorsPerStarship + j) % servers.length;
          const server = servers[serverIndex];

          await session.run(
            `
            MATCH (s:Starship {id: $starshipId}), (mso:MCPServerOption {id: $serverId})
            CREATE (s)-[:HAS_CONNECTOR {
              connectedAt: $timestamp,
              isActive: true
            }]->(mso)
            `,
            {
              starshipId: starship.id,
              serverId: server.id,
              timestamp: new Date().toISOString(),
            }
          );
        }
      }

      console.log(
        `[TEST-SETUP] ✅ Created ${starships.length} starships with ${
          starships.length * connectorsPerStarship
        } total connector relationships`
      );

      return { starships, servers };
    } finally {
      await session.close();
    }
  }

  /**
   * Verify database state before migration
   */
  async verifyPreMigrationState(): Promise<{
    starshipCount: number;
    serverCount: number;
    relationshipCount: number;
    connectorInstanceCount: number;
  }> {
    const session = this.connection.getSession();

    try {
      const result = await session.run(`
        MATCH (s:Starship) WITH count(s) as starshipCount
        MATCH (mso:MCPServerOption) WITH starshipCount, count(mso) as serverCount
        MATCH ()-[r:HAS_CONNECTOR]->() WITH starshipCount, serverCount, count(r) as relationshipCount
        OPTIONAL MATCH (msc:MCPServerConnector) WITH starshipCount, serverCount, relationshipCount, count(msc) as connectorInstanceCount
        RETURN starshipCount, serverCount, relationshipCount, connectorInstanceCount
      `);

      const record = result.records[0];
      return {
        starshipCount: record.get('starshipCount').toNumber(),
        serverCount: record.get('serverCount').toNumber(),
        relationshipCount: record.get('relationshipCount').toNumber(),
        connectorInstanceCount: record.get('connectorInstanceCount').toNumber(),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Force a migration failure at a specific percentage
   */
  async forceMigrationFailure(failurePercentage: number): Promise<void> {
    console.log(`[TEST-SETUP] 💥 Setting up migration failure at ${failurePercentage}%...`);

    // This is a simulation - in a real scenario, we might:
    // 1. Introduce a constraint violation
    // 2. Simulate network failure
    // 3. Create resource exhaustion
    // For testing purposes, we'll create a constraint that will cause failure

    const session = this.connection.getSession();
    try {
      // Get total relationship count
      const countResult = await session.run(`
        MATCH ()-[r:HAS_CONNECTOR]->()
        RETURN count(r) as totalCount
      `);

      const totalCount = countResult.records[0].get('totalCount').toNumber();
      const failurePoint = Math.floor(totalCount * (failurePercentage / 100));

      console.log(
        `[TEST-SETUP] Will simulate failure after ${failurePoint} of ${totalCount} relationships`
      );

      // We'll use a property to mark where failure should occur
      // This will be checked during migration
      await session.run(
        `
        MATCH ()-[r:HAS_CONNECTOR]->()
        WITH r
        LIMIT $failurePoint
        SET r._testFailureMarker = true
      `,
        { failurePoint }
      );
    } finally {
      await session.close();
    }
  }
}

/**
 * Comprehensive Migration Test Scenarios
 */
export class MigrationTestScenarios {
  private migration = new ConnectorInstanceMigration();
  private testSetup = new MigrationTestDataSetup();

  /**
   * Test Scenario 1: Empty Database Migration
   */
  async testEmptyDatabaseMigration(): Promise<TestScenarioResult> {
    console.log('\n🧪 TEST SCENARIO 1: Empty Database Migration');
    console.log('================================================');

    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Ensure database is clean
      await this.testSetup.cleanupTestData();

      // Verify empty state
      const preState = await this.testSetup.verifyPreMigrationState();
      if (preState.relationshipCount > 0) {
        errors.push(`Expected 0 relationships, found ${preState.relationshipCount}`);
      }

      // Run migration on empty database
      const migrationResult = await this.migration.migrate();

      // Validate results
      if (!migrationResult.success) {
        errors.push('Migration failed on empty database');
        errors.push(...migrationResult.errors);
      }

      if (migrationResult.migratedCount !== 0) {
        errors.push(`Expected 0 migrated relationships, got ${migrationResult.migratedCount}`);
      }

      // Verify post-migration state
      const postState = await this.testSetup.verifyPreMigrationState();
      if (postState.connectorInstanceCount !== 0) {
        errors.push(`Expected 0 connector instances, found ${postState.connectorInstanceCount}`);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Empty database migration completed in ${duration}ms`);

      return {
        scenarioName: 'Empty Database Migration',
        success: errors.length === 0,
        duration,
        migrationResult,
        errors,
        warnings,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(
        `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        scenarioName: 'Empty Database Migration',
        success: false,
        duration,
        errors,
        warnings,
      };
    }
  }

  /**
   * Test Scenario 2: Single Starship Migration
   */
  async testSingleStarshipMigration(): Promise<TestScenarioResult> {
    console.log('\n🧪 TEST SCENARIO 2: Single Starship Migration');
    console.log('===============================================');

    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Clean up and setup test data
      await this.testSetup.cleanupTestData();
      const testUser = await this.testSetup.createTestUser();
      const { starships, servers } = await this.testSetup.createTestStarshipsWithConnectors(
        1, // 1 starship
        2, // 2 connectors
        testUser.id
      );

      // Verify pre-migration state
      const preState = await this.testSetup.verifyPreMigrationState();
      if (preState.starshipCount !== 1) {
        errors.push(`Expected 1 starship, found ${preState.starshipCount}`);
      }
      if (preState.relationshipCount !== 2) {
        errors.push(`Expected 2 relationships, found ${preState.relationshipCount}`);
      }

      // Run migration
      const migrationResult = await this.migration.migrate();

      // Validate results
      if (!migrationResult.success) {
        errors.push('Migration failed');
        errors.push(...migrationResult.errors);
      }

      if (migrationResult.migratedCount !== 2) {
        errors.push(`Expected 2 migrated relationships, got ${migrationResult.migratedCount}`);
      }

      // Verify post-migration state
      const postState = await this.testSetup.verifyPreMigrationState();
      if (postState.connectorInstanceCount !== 2) {
        errors.push(`Expected 2 connector instances, found ${postState.connectorInstanceCount}`);
      }
      if (postState.relationshipCount !== 0) {
        errors.push(`Expected 0 old relationships, found ${postState.relationshipCount}`);
      }

      // Verify connector instances have correct relationships
      const session = getConnection().getSession();
      try {
        const instanceValidation = await session.run(
          `
          MATCH (s:Starship)-[:HAS_CONNECTOR_INSTANCE]->(msc:MCPServerConnector)-[:CREATED_FROM]->(mso:MCPServerOption)
          WHERE s.id = $starshipId
          RETURN count(*) as validInstances
        `,
          { starshipId: starships[0].id }
        );

        const validInstances = instanceValidation.records[0].get('validInstances').toNumber();
        if (validInstances !== 2) {
          errors.push(
            `Expected 2 valid connector instances with proper relationships, found ${validInstances}`
          );
        }
      } finally {
        await session.close();
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Single starship migration completed in ${duration}ms`);

      return {
        scenarioName: 'Single Starship Migration',
        success: errors.length === 0,
        duration,
        migrationResult,
        errors,
        warnings,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(
        `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        scenarioName: 'Single Starship Migration',
        success: false,
        duration,
        errors,
        warnings,
      };
    } finally {
      await this.testSetup.cleanupTestData();
    }
  }

  /**
   * Test Scenario 3: Large Dataset Migration
   */
  async testLargeDatasetMigration(): Promise<TestScenarioResult> {
    console.log('\n🧪 TEST SCENARIO 3: Large Dataset Migration');
    console.log('============================================');

    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Clean up and setup large test dataset
      await this.testSetup.cleanupTestData();
      const testUser = await this.testSetup.createTestUser();
      const { starships, servers } = await this.testSetup.createTestStarshipsWithConnectors(
        100, // 100 starships
        5, // 5 connectors each = 500 total relationships
        testUser.id
      );

      // Verify pre-migration state
      const preState = await this.testSetup.verifyPreMigrationState();
      if (preState.starshipCount !== 100) {
        errors.push(`Expected 100 starships, found ${preState.starshipCount}`);
      }
      if (preState.relationshipCount !== 500) {
        errors.push(`Expected 500 relationships, found ${preState.relationshipCount}`);
      }

      // Measure memory usage before migration
      const memoryBefore = process.memoryUsage();

      // Run migration with performance monitoring
      const migrationResult = await this.migration.migrate();

      // Measure memory usage after migration
      const memoryAfter = process.memoryUsage();
      const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;

      // Validate results
      if (!migrationResult.success) {
        errors.push('Large dataset migration failed');
        errors.push(...migrationResult.errors);
      }

      if (migrationResult.migratedCount !== 500) {
        errors.push(`Expected 500 migrated relationships, got ${migrationResult.migratedCount}`);
      }

      // Performance validation
      const migrationTimePerRelationship = migrationResult.duration / migrationResult.migratedCount;
      const migrationTimePer100 = migrationTimePerRelationship * 100;

      if (migrationTimePer100 > PERFORMANCE_BENCHMARKS.MIGRATION_TIME_PER_100_RELATIONSHIPS) {
        errors.push(
          `Migration time per 100 relationships (${migrationTimePer100.toFixed(2)}ms) exceeds benchmark (${PERFORMANCE_BENCHMARKS.MIGRATION_TIME_PER_100_RELATIONSHIPS}ms)`
        );
      }

      // Memory usage validation (scaled for 500 relationships vs 10k benchmark)
      const expectedMemoryForDataset =
        (PERFORMANCE_BENCHMARKS.MEMORY_USAGE_FOR_10K_RELATIONSHIPS * 500) / 10000;
      if (memoryUsed > expectedMemoryForDataset) {
        warnings.push(
          `Memory usage (${(memoryUsed / 1024 / 1024).toFixed(2)}MB) higher than expected (${(expectedMemoryForDataset / 1024 / 1024).toFixed(2)}MB)`
        );
      }

      // Verify post-migration state
      const postState = await this.testSetup.verifyPreMigrationState();
      if (postState.connectorInstanceCount !== 500) {
        errors.push(`Expected 500 connector instances, found ${postState.connectorInstanceCount}`);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Large dataset migration completed in ${duration}ms`);
      console.log(`📊 Performance: ${migrationTimePerRelationship.toFixed(2)}ms per relationship`);
      console.log(`💾 Memory used: ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);

      return {
        scenarioName: 'Large Dataset Migration',
        success: errors.length === 0,
        duration,
        migrationResult,
        performanceMetrics: {
          migrationTimePerRelationship,
          memoryUsage: memoryUsed,
          lockTime: migrationResult.duration, // Approximation
        },
        errors,
        warnings,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(
        `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        scenarioName: 'Large Dataset Migration',
        success: false,
        duration,
        errors,
        warnings,
      };
    } finally {
      await this.testSetup.cleanupTestData();
    }
  }

  /**
   * Test Scenario 4: Concurrent Access During Migration
   */
  async testConcurrentAccessDuringMigration(): Promise<TestScenarioResult> {
    console.log('\n🧪 TEST SCENARIO 4: Concurrent Access During Migration');
    console.log('======================================================');

    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Clean up and setup test data
      await this.testSetup.cleanupTestData();
      const testUser = await this.testSetup.createTestUser();
      const { starships, servers } = await this.testSetup.createTestStarshipsWithConnectors(
        10, // 10 starships
        5, // 5 connectors each = 50 total relationships
        testUser.id
      );

      // Start migration in background
      const migrationPromise = this.migration.migrate();

      // Simulate concurrent access attempts
      const concurrentOperations: Promise<any>[] = [];
      const session = getConnection().getSession();

      try {
        // Attempt to read data during migration
        concurrentOperations.push(
          session
            .run(
              `
            MATCH (s:Starship)-[r:HAS_CONNECTOR]->(mso:MCPServerOption)
            RETURN count(r) as relationshipCount
          `
            )
            .catch((error) => ({ error: error.message, operation: 'read' }))
        );

        // Attempt to write data during migration
        concurrentOperations.push(
          session
            .run(
              `
            MATCH (s:Starship {id: $starshipId})
            SET s.status = 'maintenance'
            RETURN s
          `,
              { starshipId: starships[0].id }
            )
            .catch((error) => ({ error: error.message, operation: 'write' }))
        );

        // Wait for both migration and concurrent operations
        const [migrationResult, ...concurrentResults] = await Promise.all([
          migrationPromise,
          ...concurrentOperations,
        ]);

        // Validate migration succeeded
        if (!migrationResult.success) {
          errors.push('Migration failed during concurrent access test');
          errors.push(...migrationResult.errors);
        }

        // Analyze concurrent operation results
        concurrentResults.forEach((result, index) => {
          if (result && result.error) {
            // This is expected - concurrent operations should be blocked or fail gracefully
            console.log(
              `🔒 Concurrent operation ${index + 1} was properly blocked: ${result.error}`
            );
          } else {
            warnings.push(
              `Concurrent operation ${index + 1} succeeded unexpectedly - transaction isolation may be insufficient`
            );
          }
        });

        // Verify final state
        const postState = await this.testSetup.verifyPreMigrationState();
        if (postState.connectorInstanceCount !== 50) {
          errors.push(`Expected 50 connector instances, found ${postState.connectorInstanceCount}`);
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Concurrent access test completed in ${duration}ms`);

        return {
          scenarioName: 'Concurrent Access During Migration',
          success: errors.length === 0,
          duration,
          migrationResult,
          errors,
          warnings,
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(
        `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        scenarioName: 'Concurrent Access During Migration',
        success: false,
        duration,
        errors,
        warnings,
      };
    } finally {
      await this.testSetup.cleanupTestData();
    }
  }

  /**
   * Test Scenario 5: Rollback After Partial Migration
   */
  async testRollbackAfterPartialMigration(): Promise<TestScenarioResult> {
    console.log('\n🧪 TEST SCENARIO 5: Rollback After Partial Migration');
    console.log('====================================================');

    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Clean up and setup test data
      await this.testSetup.cleanupTestData();
      const testUser = await this.testSetup.createTestUser();
      const { starships, servers } = await this.testSetup.createTestStarshipsWithConnectors(
        20, // 20 starships
        5, // 5 connectors each = 100 total relationships
        testUser.id
      );

      // Capture original state
      const originalState = await this.testSetup.verifyPreMigrationState();
      console.log(`📊 Original state: ${originalState.relationshipCount} relationships`);

      // Force migration failure at 50%
      await this.testSetup.forceMigrationFailure(50);

      // Attempt migration (should fail)
      let migrationResult: MigrationResult;
      try {
        migrationResult = await this.migration.migrate();

        // If migration succeeded when it should have failed, that's an issue
        if (migrationResult.success) {
          warnings.push(
            'Migration succeeded when failure was expected - test setup may need adjustment'
          );
        }
      } catch (error) {
        // Expected failure - create a mock result
        migrationResult = {
          success: false,
          migratedCount: 0,
          errors: [error instanceof Error ? error.message : String(error)],
          duration: 0,
          statistics: {
            totalStarships: originalState.starshipCount,
            totalTemplates: originalState.serverCount,
            totalRelationships: originalState.relationshipCount,
            createdConnectorInstances: 0,
          },
        };
      }

      // Check if partial migration occurred
      const partialState = await this.testSetup.verifyPreMigrationState();
      console.log(
        `📊 State after failed migration: ${partialState.connectorInstanceCount} instances, ${partialState.relationshipCount} old relationships`
      );

      // If we have rollback data, test rollback functionality
      if (migrationResult.rollbackData && migrationResult.rollbackData.length > 0) {
        console.log(
          `🔄 Testing rollback with ${migrationResult.rollbackData.length} rollback entries...`
        );

        const rollbackSuccess = await this.migration.rollback(migrationResult.rollbackData);

        if (!rollbackSuccess) {
          errors.push('Rollback operation failed');
        }

        // Verify rollback restored original state
        const restoredState = await this.testSetup.verifyPreMigrationState();

        if (restoredState.relationshipCount !== originalState.relationshipCount) {
          errors.push(
            `Rollback failed to restore relationships: expected ${originalState.relationshipCount}, got ${restoredState.relationshipCount}`
          );
        }

        if (restoredState.connectorInstanceCount !== 0) {
          errors.push(
            `Rollback failed to remove connector instances: expected 0, got ${restoredState.connectorInstanceCount}`
          );
        }

        console.log(
          `✅ Rollback completed - restored ${restoredState.relationshipCount} relationships`
        );
      } else {
        // Test rollback with empty data (should handle gracefully)
        console.log('🔄 Testing rollback with empty rollback data...');
        const rollbackSuccess = await this.migration.rollback([]);

        if (!rollbackSuccess) {
          warnings.push('Rollback with empty data returned false - this may be expected behavior');
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Rollback test completed in ${duration}ms`);

      return {
        scenarioName: 'Rollback After Partial Migration',
        success: errors.length === 0,
        duration,
        migrationResult,
        errors,
        warnings,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(
        `Test execution failed: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        scenarioName: 'Rollback After Partial Migration',
        success: false,
        duration,
        errors,
        warnings,
      };
    } finally {
      await this.testSetup.cleanupTestData();
    }
  }

  /**
   * Run all test scenarios
   */
  async runAllScenarios(): Promise<TestScenarioResult[]> {
    console.log('\n🚀 RUNNING ALL MIGRATION TEST SCENARIOS');
    console.log('========================================');

    const results: TestScenarioResult[] = [];

    try {
      // Run each scenario
      results.push(await this.testEmptyDatabaseMigration());
      results.push(await this.testSingleStarshipMigration());
      results.push(await this.testLargeDatasetMigration());
      results.push(await this.testConcurrentAccessDuringMigration());
      results.push(await this.testRollbackAfterPartialMigration());

      // Generate summary report
      this.generateSummaryReport(results);

      return results;
    } catch (error) {
      console.error('❌ Test suite execution failed:', error);
      throw error;
    }
  }

  /**
   * Generate summary report of all test results
   */
  private generateSummaryReport(results: TestScenarioResult[]): void {
    console.log('\n📊 MIGRATION TEST SUMMARY REPORT');
    console.log('=================================');

    const totalTests = results.length;
    const passedTests = results.filter((r) => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`📈 Overall Results: ${passedTests}/${totalTests} tests passed`);
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(
      `${passedTests === totalTests ? '✅' : '❌'} Test Suite: ${passedTests === totalTests ? 'PASSED' : 'FAILED'}`
    );

    console.log('\n📋 Individual Test Results:');
    results.forEach((result, index) => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${index + 1}. ${result.scenarioName}: ${status} (${result.duration}ms)`);

      if (result.errors.length > 0) {
        console.log(`     Errors: ${result.errors.length}`);
        result.errors.forEach((error) => console.log(`       - ${error}`));
      }

      if (result.warnings.length > 0) {
        console.log(`     Warnings: ${result.warnings.length}`);
        result.warnings.forEach((warning) => console.log(`       - ${warning}`));
      }

      if (result.performanceMetrics) {
        console.log(
          `     Performance: ${result.performanceMetrics.migrationTimePerRelationship.toFixed(2)}ms per relationship`
        );
        console.log(
          `     Memory: ${(result.performanceMetrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`
        );
      }
    });

    console.log('\n🎯 Performance Benchmark Results:');
    const performanceResults = results.filter((r) => r.performanceMetrics);
    if (performanceResults.length > 0) {
      performanceResults.forEach((result) => {
        const metrics = result.performanceMetrics!;
        const timePer100 = metrics.migrationTimePerRelationship * 100;
        const timeStatus =
          timePer100 <= PERFORMANCE_BENCHMARKS.MIGRATION_TIME_PER_100_RELATIONSHIPS ? '✅' : '❌';

        console.log(`  ${result.scenarioName}:`);
        console.log(
          `    ${timeStatus} Migration Time: ${timePer100.toFixed(2)}ms per 100 relationships (benchmark: ${PERFORMANCE_BENCHMARKS.MIGRATION_TIME_PER_100_RELATIONSHIPS}ms)`
        );
        console.log(`    💾 Memory Usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
      });
    }

    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS REQUIRE ATTENTION');
      console.log(
        'Please review the errors above and fix any issues before proceeding to production migration.'
      );
    } else {
      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('Migration is ready for production deployment.');
    }
  }
}

/**
 * CLI interface for running migration test scenarios
 */
export async function runMigrationTests(): Promise<void> {
  console.log('🧪 Starting MCP Connector Instance Migration Tests');
  console.log('==================================================');

  try {
    const testScenarios = new MigrationTestScenarios();
    const results = await testScenarios.runAllScenarios();

    const allPassed = results.every((r) => r.success);

    if (allPassed) {
      console.log('\n✅ All migration tests passed successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Some migration tests failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Migration test suite failed with error:', error);
    process.exit(1);
  }
}

/**
 * CLI interface for running individual test scenarios
 */
export async function runIndividualTest(scenarioName: string): Promise<void> {
  console.log(`🧪 Running Individual Test: ${scenarioName}`);
  console.log('='.repeat(50 + scenarioName.length));

  try {
    const testScenarios = new MigrationTestScenarios();
    let result: TestScenarioResult;

    switch (scenarioName.toLowerCase()) {
      case 'empty':
      case 'empty-database':
        result = await testScenarios.testEmptyDatabaseMigration();
        break;
      case 'single':
      case 'single-starship':
        result = await testScenarios.testSingleStarshipMigration();
        break;
      case 'large':
      case 'large-dataset':
        result = await testScenarios.testLargeDatasetMigration();
        break;
      case 'concurrent':
      case 'concurrent-access':
        result = await testScenarios.testConcurrentAccessDuringMigration();
        break;
      case 'rollback':
      case 'rollback-partial':
        result = await testScenarios.testRollbackAfterPartialMigration();
        break;
      default:
        throw new Error(
          `Unknown test scenario: ${scenarioName}. Available: empty, single, large, concurrent, rollback`
        );
    }

    if (result.success) {
      console.log(`\n✅ Test "${result.scenarioName}" passed successfully!`);
      console.log(`⏱️  Duration: ${result.duration}ms`);
      process.exit(0);
    } else {
      console.log(`\n❌ Test "${result.scenarioName}" failed!`);
      console.log('🔍 Errors:');
      result.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n💥 Test "${scenarioName}" failed with error:`, error);
    process.exit(1);
  }
}
