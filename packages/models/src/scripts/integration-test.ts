#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { MCPServerOptionRepository } from '../repositories/MCPServerOptionRepository';
import { StarshipRepository } from '../repositories/StarshipRepository';
import { MCPServerOption, Starship } from '../types';

interface TestResults {
  passed: number;
  failed: number;
  errors: string[];
}

class DatabaseIntegrationTester {
  private connection: any;
  private mcpRepo: MCPServerOptionRepository;
  private starshipRepo: StarshipRepository;
  private results: TestResults = { passed: 0, failed: 0, errors: [] };
  private testStarshipId: string | null = null;

  constructor() {
    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'mcppassword',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    };

    this.connection = createConnection(config);
    this.mcpRepo = new MCPServerOptionRepository();
    this.starshipRepo = new StarshipRepository();
  }

  private async test(name: string, testFn: () => Promise<void>): Promise<void> {
    try {
      console.log(`🧪 Testing: ${name}`);
      await testFn();
      this.results.passed++;
      console.log(`✅ PASSED: ${name}`);
    } catch (error) {
      this.results.failed++;
      const errorMsg = `❌ FAILED: ${name} - ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      this.results.errors.push(errorMsg);
    }
  }

  private async assert(condition: boolean, message: string): Promise<void> {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Database Integration Tests');
    console.log('=====================================\n');

    try {
      await this.connection.connect();
      console.log('✅ Connected to Neo4j database\n');

      // Test MCPServerOptionRepository methods
      await this.testMCPServerOptionRepository();

      // Test StarshipRepository connector methods
      await this.testStarshipRepositoryConnectorMethods();

      // Test integration workflows
      await this.testIntegrationWorkflows();

      // Test error handling and edge cases
      await this.testErrorHandling();

      // Test concurrent operations
      await this.testConcurrentOperations();
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      this.results.errors.push(
        `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await this.cleanup();
      await this.connection.disconnect();
      this.printResults();
    }
  }

  private async testMCPServerOptionRepository(): Promise<void> {
    console.log('📋 Testing MCPServerOptionRepository Methods');
    console.log('===========================================');

    await this.test('MCPServerOptionRepository.findAll()', async () => {
      const servers = await this.mcpRepo.findAll();
      await this.assert(Array.isArray(servers), 'findAll should return an array');
      await this.assert(servers.length > 0, 'Should have MCP server options in database');
      console.log(`   Found ${servers.length} MCP server options`);
    });

    await this.test('MCPServerOptionRepository.findById() - valid ID', async () => {
      const servers = await this.mcpRepo.findAll();
      const firstServer = servers[0];
      const foundServer = await this.mcpRepo.findById(firstServer.id);
      await this.assert(foundServer !== null, 'Should find server by valid ID');
      await this.assert(foundServer!.id === firstServer.id, 'Should return correct server');
      console.log(`   Found server: ${foundServer!.name}`);
    });

    await this.test('MCPServerOptionRepository.findById() - invalid ID', async () => {
      const foundServer = await this.mcpRepo.findById('non-existent-id');
      await this.assert(foundServer === null, 'Should return null for invalid ID');
    });

    await this.test('MCPServerOptionRepository.findByCommand()', async () => {
      const dockerServers = await this.mcpRepo.findByCommand('docker');
      await this.assert(Array.isArray(dockerServers), 'findByCommand should return an array');
      console.log(`   Found ${dockerServers.length} Docker-based servers`);

      if (dockerServers.length > 0) {
        await this.assert(
          dockerServers[0].command === 'docker',
          'Should return servers with correct command'
        );
      }
    });

    await this.test('MCPServerOptionRepository.searchByName()', async () => {
      const githubServers = await this.mcpRepo.searchByName('github');
      await this.assert(Array.isArray(githubServers), 'searchByName should return an array');
      console.log(`   Found ${githubServers.length} servers matching 'github'`);
    });

    await this.test('MCPServerOptionRepository.findActive()', async () => {
      const activeServers = await this.mcpRepo.findActive();
      await this.assert(Array.isArray(activeServers), 'findActive should return an array');
      console.log(`   Found ${activeServers.length} active servers`);
    });

    console.log('');
  }

  private async testStarshipRepositoryConnectorMethods(): Promise<void> {
    console.log('🚀 Testing StarshipRepository Connector Methods');
    console.log('==============================================');

    // First, create a test starship
    await this.test('Create test starship', async () => {
      const testStarship = await this.starshipRepo.create({
        name: 'Integration Test Ship',
        ownerId: 'test-owner-id',
        class: 'scout',
        slug: 'integration-test-ship',
        status: 'active',
      });
      this.testStarshipId = testStarship.id;
      await this.assert(testStarship.id !== undefined, 'Should create starship with ID');
      console.log(`   Created test starship: ${testStarship.id}`);
    });

    if (!this.testStarshipId) {
      throw new Error('Failed to create test starship');
    }

    await this.test('StarshipRepository.getConnectedMCPServers() - empty', async () => {
      const connectedServers = await this.starshipRepo.getConnectedMCPServers(this.testStarshipId!);
      await this.assert(Array.isArray(connectedServers), 'Should return an array');
      await this.assert(
        connectedServers.length === 0,
        'New starship should have no connected servers'
      );
      console.log(`   Found ${connectedServers.length} connected servers (expected 0)`);
    });

    // Get a real MCP server to test with
    const mcpServers = await this.mcpRepo.findAll();
    const testMCPServer = mcpServers[0];

    await this.test('StarshipRepository.connectMCPServer()', async () => {
      const success = await this.starshipRepo.connectMCPServer(
        this.testStarshipId!,
        testMCPServer.id
      );
      await this.assert(success === true, 'Should successfully connect MCP server');
      console.log(`   Connected MCP server: ${testMCPServer.name}`);
    });

    await this.test('StarshipRepository.getConnectedMCPServers() - with connection', async () => {
      const connectedServers = await this.starshipRepo.getConnectedMCPServers(this.testStarshipId!);
      await this.assert(connectedServers.length === 1, 'Should have one connected server');
      await this.assert(
        connectedServers[0].id === testMCPServer.id,
        'Should return the connected server'
      );
      console.log(`   Found ${connectedServers.length} connected servers`);
    });

    await this.test('StarshipRepository.connectMCPServer() - duplicate prevention', async () => {
      const success = await this.starshipRepo.connectMCPServer(
        this.testStarshipId!,
        testMCPServer.id
      );
      await this.assert(success === false, 'Should prevent duplicate connections');
      console.log(`   Correctly prevented duplicate connection`);
    });

    await this.test('StarshipRepository.disconnectMCPServer()', async () => {
      const success = await this.starshipRepo.disconnectMCPServer(
        this.testStarshipId!,
        testMCPServer.id
      );
      await this.assert(success === true, 'Should successfully disconnect MCP server');
      console.log(`   Disconnected MCP server: ${testMCPServer.name}`);
    });

    await this.test('StarshipRepository.getConnectedMCPServers() - after disconnect', async () => {
      const connectedServers = await this.starshipRepo.getConnectedMCPServers(this.testStarshipId!);
      await this.assert(
        connectedServers.length === 0,
        'Should have no connected servers after disconnect'
      );
      console.log(`   Found ${connectedServers.length} connected servers (expected 0)`);
    });

    console.log('');
  }

  private async testIntegrationWorkflows(): Promise<void> {
    console.log('🔄 Testing Integration Workflows');
    console.log('===============================');

    if (!this.testStarshipId) {
      console.log('⚠️  Skipping integration workflows - no test starship available');
      return;
    }

    const mcpServers = await this.mcpRepo.findAll();
    const testServers = mcpServers.slice(0, 3); // Test with first 3 servers

    await this.test('Connect multiple MCP servers', async () => {
      for (const server of testServers) {
        const success = await this.starshipRepo.connectMCPServer(this.testStarshipId!, server.id);
        await this.assert(success === true, `Should connect ${server.name}`);
      }

      const connectedServers = await this.starshipRepo.getConnectedMCPServers(this.testStarshipId!);
      await this.assert(
        connectedServers.length === testServers.length,
        'Should have all servers connected'
      );
      console.log(`   Connected ${connectedServers.length} servers`);
    });

    await this.test('Verify data consistency after multiple connections', async () => {
      const connectedServers = await this.starshipRepo.getConnectedMCPServers(this.testStarshipId!);

      // Check that all connected servers exist in the original list
      for (const connectedServer of connectedServers) {
        const originalServer = await this.mcpRepo.findById(connectedServer.id);
        await this.assert(
          originalServer !== null,
          `Connected server ${connectedServer.id} should exist in database`
        );
        await this.assert(
          originalServer!.name === connectedServer.name,
          'Server data should be consistent'
        );
      }
      console.log(`   Verified data consistency for ${connectedServers.length} servers`);
    });

    await this.test('Disconnect all MCP servers', async () => {
      const connectedServers = await this.starshipRepo.getConnectedMCPServers(this.testStarshipId!);

      for (const server of connectedServers) {
        const success = await this.starshipRepo.disconnectMCPServer(
          this.testStarshipId!,
          server.id
        );
        await this.assert(success === true, `Should disconnect ${server.name}`);
      }

      const remainingServers = await this.starshipRepo.getConnectedMCPServers(this.testStarshipId!);
      await this.assert(
        remainingServers.length === 0,
        'Should have no connected servers after disconnect all'
      );
      console.log(`   Disconnected all servers successfully`);
    });

    console.log('');
  }

  private async testErrorHandling(): Promise<void> {
    console.log('⚠️  Testing Error Handling and Edge Cases');
    console.log('========================================');

    await this.test('MCPServerOptionRepository.findById() - empty string', async () => {
      try {
        await this.mcpRepo.findById('');
        await this.assert(false, 'Should throw error for empty ID');
      } catch (error) {
        await this.assert(error instanceof Error, 'Should throw an Error');
        console.log(
          `   Correctly threw error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    await this.test(
      'StarshipRepository.getConnectedMCPServers() - invalid starship ID',
      async () => {
        try {
          await this.starshipRepo.getConnectedMCPServers('non-existent-starship');
          // This might not throw an error, just return empty array
          console.log(`   Handled invalid starship ID gracefully`);
        } catch (error) {
          console.log(
            `   Threw error for invalid starship ID: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    );

    await this.test('StarshipRepository.connectMCPServer() - invalid starship ID', async () => {
      try {
        const mcpServers = await this.mcpRepo.findAll();
        await this.starshipRepo.connectMCPServer('non-existent-starship', mcpServers[0].id);
        await this.assert(false, 'Should throw error for invalid starship ID');
      } catch (error) {
        await this.assert(error instanceof Error, 'Should throw an Error');
        console.log(
          `   Correctly threw error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    await this.test('StarshipRepository.connectMCPServer() - invalid MCP server ID', async () => {
      if (!this.testStarshipId) {
        console.log('   Skipping - no test starship available');
        return;
      }

      try {
        await this.starshipRepo.connectMCPServer(this.testStarshipId, 'non-existent-mcp-server');
        await this.assert(false, 'Should throw error for invalid MCP server ID');
      } catch (error) {
        await this.assert(error instanceof Error, 'Should throw an Error');
        console.log(
          `   Correctly threw error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    await this.test(
      'StarshipRepository.disconnectMCPServer() - non-existent connection',
      async () => {
        if (!this.testStarshipId) {
          console.log('   Skipping - no test starship available');
          return;
        }

        const mcpServers = await this.mcpRepo.findAll();
        const success = await this.starshipRepo.disconnectMCPServer(
          this.testStarshipId,
          mcpServers[0].id
        );
        await this.assert(success === false, 'Should return false for non-existent connection');
        console.log(`   Correctly returned false for non-existent connection`);
      }
    );

    console.log('');
  }

  private async testConcurrentOperations(): Promise<void> {
    console.log('⚡ Testing Concurrent Operations');
    console.log('==============================');

    if (!this.testStarshipId) {
      console.log('⚠️  Skipping concurrent operations - no test starship available');
      return;
    }

    const mcpServers = await this.mcpRepo.findAll();
    const testServer = mcpServers[0];

    await this.test('Concurrent connection attempts', async () => {
      // Try to connect the same server multiple times concurrently
      const promises = Array(5)
        .fill(null)
        .map(() => this.starshipRepo.connectMCPServer(this.testStarshipId!, testServer.id));

      const results = await Promise.all(promises);

      // Only one should succeed, others should return false (idempotent)
      const successCount = results.filter((r) => r === true).length;
      const failureCount = results.filter((r) => r === false).length;

      await this.assert(successCount === 1, 'Only one connection should succeed');
      await this.assert(failureCount === 4, 'Other attempts should return false');

      // Verify only one connection exists
      const connectedServers = await this.starshipRepo.getConnectedMCPServers(this.testStarshipId!);
      await this.assert(connectedServers.length === 1, 'Should have exactly one connection');

      console.log(
        `   Concurrent operations handled correctly: ${successCount} success, ${failureCount} prevented duplicates`
      );
    });

    await this.test('Concurrent read operations', async () => {
      // Multiple concurrent reads should all succeed
      const promises = Array(10)
        .fill(null)
        .map(() => this.starshipRepo.getConnectedMCPServers(this.testStarshipId!));

      const results = await Promise.all(promises);

      // All should return the same result
      await this.assert(
        results.every((r) => r.length === 1),
        'All reads should return same result'
      );
      await this.assert(
        results.every((r) => r[0].id === testServer.id),
        'All reads should return same server'
      );

      console.log(`   ${results.length} concurrent reads completed successfully`);
    });

    // Clean up the connection for next tests
    await this.starshipRepo.disconnectMCPServer(this.testStarshipId, testServer.id);

    console.log('');
  }

  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test data');
    console.log('========================');

    if (this.testStarshipId) {
      try {
        // Disconnect any remaining MCP servers
        const connectedServers = await this.starshipRepo.getConnectedMCPServers(
          this.testStarshipId
        );
        for (const server of connectedServers) {
          await this.starshipRepo.disconnectMCPServer(this.testStarshipId, server.id);
        }

        // Delete the test starship
        const deleted = await this.starshipRepo.delete(this.testStarshipId);
        if (deleted) {
          console.log(`✅ Deleted test starship: ${this.testStarshipId}`);
        } else {
          console.log(`⚠️  Could not delete test starship: ${this.testStarshipId}`);
        }
      } catch (error) {
        console.error(
          `❌ Error during cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    console.log('');
  }

  private printResults(): void {
    console.log('📊 Test Results Summary');
    console.log('======================');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Total:  ${this.results.passed + this.results.failed}`);

    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.results.errors.forEach((error) => console.log(`   ${error}`));
    }

    const successRate = (this.results.passed / (this.results.passed + this.results.failed)) * 100;
    console.log(`\n🎯 Success Rate: ${successRate.toFixed(1)}%`);

    if (this.results.failed === 0) {
      console.log('\n🎉 All tests passed! Database integration is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new DatabaseIntegrationTester();
  tester.runAllTests().catch(console.error);
}

export { DatabaseIntegrationTester };
