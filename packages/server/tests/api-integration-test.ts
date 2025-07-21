#!/usr/bin/env tsx

/**
 * Comprehensive API Integration Test Suite for MCP Server Endpoints
 * Task 4.2: API Testing for crew console connectors plan
 *
 * This script performs comprehensive testing of all MCP server API endpoints
 * including authentication, authorization, error handling, and performance testing.
 */

import { createConnection } from '@starships/models/src/connection';
import { MCPServerOptionRepository } from '@starships/models/src/repositories/MCPServerOptionRepository';
import { StarshipRepository } from '@starships/models/src/repositories/StarshipRepository';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: string;
  details?: any;
}

interface TestSuite {
  name: string;
  results: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  totalDuration: number;
}

class APIIntegrationTester {
  private baseURL: string;
  private authToken: string;
  private testResults: TestSuite[] = [];
  private connection: any;
  private mcpRepo: MCPServerOptionRepository;
  private starshipRepo: StarshipRepository;
  private testStarshipId: string | null = null;

  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:4000';
    this.authToken = 'test-auth-token'; // Using test backdoor token

    // Initialize database connection and repositories
    const config = {
      uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    };

    this.connection = createConnection(config);
    this.mcpRepo = new MCPServerOptionRepository();
    this.starshipRepo = new StarshipRepository();
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
    const startTime = Date.now();

    try {
      console.log(`🧪 Testing: ${name}`);
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`✅ PASSED: ${name} (${duration}ms)`);
      return { name, status: 'PASS', duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ FAILED: ${name} (${duration}ms) - ${errorMsg}`);
      return { name, status: 'FAIL', duration, error: errorMsg };
    }
  }

  private async makeRequest(method: string, endpoint: string, data?: any, headers?: any) {
    // Simple fetch-based request instead of axios to avoid dependency issues
    const config: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);
      const responseData = await response.json().catch(() => ({}));

      return {
        status: response.status,
        data: responseData,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error('Server not running - please start the server first');
      }
      throw error;
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive API Integration Tests');
    console.log('==============================================\n');

    try {
      // Connect to database
      await this.connection.connect();
      console.log('✅ Connected to Neo4j database\n');

      // Set up test environment
      await this.setupTestEnvironment();

      // Run test suites
      await this.testAuthenticationAndAuthorization();
      await this.testMCPServersEndpoint();
      await this.testStarshipConnectorsEndpoint();
      await this.testConnectMCPServerEndpoint();
      await this.testDisconnectMCPServerEndpoint();
      await this.testErrorHandlingScenarios();
      await this.testIntegrationWorkflows();
      await this.testPerformanceAndLoad();
    } catch (error) {
      console.error('❌ Failed to initialize tests:', error);
    } finally {
      await this.cleanup();
      await this.connection.disconnect();
      this.printResults();
    }
  }

  private async setupTestEnvironment(): Promise<void> {
    console.log('🔧 Setting up test environment');
    console.log('=============================');

    // Create a test starship for testing
    try {
      const testStarship = await this.starshipRepo.create({
        name: 'API Test Starship',
        ownerId: 'test-user-1',
        class: 'scout',
        slug: 'api-test-starship',
        powerLevel: 100,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active',
      });
      this.testStarshipId = testStarship.id;
      console.log(`✅ Created test starship: ${this.testStarshipId}`);
    } catch (error) {
      console.error('❌ Failed to create test starship:', error);
    }

    console.log('');
  }

  private async testAuthenticationAndAuthorization(): Promise<void> {
    const suite: TestSuite = {
      name: 'Authentication & Authorization',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔐 Testing Authentication & Authorization');
    console.log('=======================================');

    // Test 1: No authentication token
    suite.results.push(
      await this.runTest('Request without authentication token', async () => {
        const response = await this.makeRequest('GET', '/api/mcp-servers', null, {
          Authorization: undefined,
        });
        if (response.status !== 401) {
          throw new Error(`Expected 401, got ${response.status}`);
        }
        if (!response.data.error || !response.data.error.includes('Authorization')) {
          throw new Error('Expected authorization error message');
        }
      })
    );

    // Test 2: Valid test token
    suite.results.push(
      await this.runTest('Request with valid test token', async () => {
        const response = await this.makeRequest('GET', '/api/mcp-servers');
        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
        }
        if (!response.data.mcpServers || !Array.isArray(response.data.mcpServers)) {
          throw new Error('Expected mcpServers array in response');
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testMCPServersEndpoint(): Promise<void> {
    const suite: TestSuite = {
      name: 'GET /api/mcp-servers',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('📋 Testing GET /api/mcp-servers');
    console.log('==============================');

    // Test 1: Basic functionality
    suite.results.push(
      await this.runTest('Returns list of MCP servers', async () => {
        const response = await this.makeRequest('GET', '/api/mcp-servers');
        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
        }

        const { mcpServers } = response.data;
        if (!Array.isArray(mcpServers)) {
          throw new Error('mcpServers should be an array');
        }

        if (mcpServers.length > 0) {
          const server = mcpServers[0];
          const requiredFields = ['id', 'name', 'command', 'args'];
          for (const field of requiredFields) {
            if (!(field in server)) {
              throw new Error(`MCP server missing required field: ${field}`);
            }
          }
        }

        console.log(`   Found ${mcpServers.length} MCP servers`);
      })
    );

    // Test 2: Response headers
    suite.results.push(
      await this.runTest('Returns correct content-type headers', async () => {
        const response = await this.makeRequest('GET', '/api/mcp-servers');
        if (!response.headers['content-type']?.includes('application/json')) {
          throw new Error('Expected application/json content-type');
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testStarshipConnectorsEndpoint(): Promise<void> {
    const suite: TestSuite = {
      name: 'GET /api/starships/:id/connectors',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🚀 Testing GET /api/starships/:id/connectors');
    console.log('==========================================');

    if (!this.testStarshipId) {
      console.log('⚠️  Skipping - no test starship available');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Test 1: Valid starship returns connectors
    suite.results.push(
      await this.runTest('Returns connected connectors for valid starship', async () => {
        const response = await this.makeRequest(
          'GET',
          `/api/starships/${this.testStarshipId}/connectors`
        );
        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
        }

        const { starshipId, connectedConnectors } = response.data;
        if (starshipId !== this.testStarshipId) {
          throw new Error('Response should include correct starshipId');
        }
        if (!Array.isArray(connectedConnectors)) {
          throw new Error('connectedConnectors should be an array');
        }

        console.log(`   Found ${connectedConnectors.length} connected connectors`);
      })
    );

    // Test 2: Invalid starship ID
    suite.results.push(
      await this.runTest('Returns 404 for non-existent starship', async () => {
        const response = await this.makeRequest(
          'GET',
          '/api/starships/non-existent-starship/connectors'
        );
        if (response.status !== 404) {
          throw new Error(`Expected 404, got ${response.status}`);
        }
        if (!response.data.error?.includes('not found')) {
          throw new Error('Expected "not found" error message');
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testConnectMCPServerEndpoint(): Promise<void> {
    const suite: TestSuite = {
      name: 'POST /api/starships/:id/connectors/:mcpServerId',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔗 Testing POST /api/starships/:id/connectors/:mcpServerId');
    console.log('====================================================');

    if (!this.testStarshipId) {
      console.log('⚠️  Skipping - no test starship available');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Get available MCP servers for testing
    const mcpServers = await this.mcpRepo.findAll();
    if (mcpServers.length === 0) {
      console.log('⚠️  Skipping - no MCP servers available');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    const testMCPServer = mcpServers[0];

    // Test 1: Successful connection
    suite.results.push(
      await this.runTest('Successfully connects MCP server to starship', async () => {
        const response = await this.makeRequest(
          'POST',
          `/api/starships/${this.testStarshipId}/connectors/${testMCPServer.id}`
        );
        if (response.status !== 201) {
          throw new Error(`Expected 201, got ${response.status}: ${JSON.stringify(response.data)}`);
        }

        const { message, starshipId, mcpServerId, connectedAt } = response.data;
        if (!message?.includes('connected successfully')) {
          throw new Error('Expected success message');
        }
        if (starshipId !== this.testStarshipId) {
          throw new Error('Response should include correct starshipId');
        }
        if (mcpServerId !== testMCPServer.id) {
          throw new Error('Response should include correct mcpServerId');
        }
        if (!connectedAt) {
          throw new Error('Response should include connectedAt timestamp');
        }

        console.log(`   Connected ${testMCPServer.name} to starship`);
      })
    );

    // Test 2: Duplicate connection prevention
    suite.results.push(
      await this.runTest('Prevents duplicate connections', async () => {
        const response = await this.makeRequest(
          'POST',
          `/api/starships/${this.testStarshipId}/connectors/${testMCPServer.id}`
        );
        if (response.status !== 409) {
          throw new Error(`Expected 409, got ${response.status}: ${JSON.stringify(response.data)}`);
        }
        if (!response.data.error?.includes('already connected')) {
          throw new Error('Expected "already connected" error message');
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testDisconnectMCPServerEndpoint(): Promise<void> {
    const suite: TestSuite = {
      name: 'DELETE /api/starships/:id/connectors/:mcpServerId',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔌 Testing DELETE /api/starships/:id/connectors/:mcpServerId');
    console.log('=======================================================');

    if (!this.testStarshipId) {
      console.log('⚠️  Skipping - no test starship available');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    const mcpServers = await this.mcpRepo.findAll();
    if (mcpServers.length === 0) {
      console.log('⚠️  Skipping - no MCP servers available');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    const testMCPServer = mcpServers[0];

    // Test 1: Successful disconnection
    suite.results.push(
      await this.runTest('Successfully disconnects MCP server from starship', async () => {
        const response = await this.makeRequest(
          'DELETE',
          `/api/starships/${this.testStarshipId}/connectors/${testMCPServer.id}`
        );
        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
        }

        const { message, starshipId, mcpServerId, disconnectedAt } = response.data;
        if (!message?.includes('disconnected successfully')) {
          throw new Error('Expected success message');
        }
        if (starshipId !== this.testStarshipId) {
          throw new Error('Response should include correct starshipId');
        }
        if (mcpServerId !== testMCPServer.id) {
          throw new Error('Response should include correct mcpServerId');
        }
        if (!disconnectedAt) {
          throw new Error('Response should include disconnectedAt timestamp');
        }

        console.log(`   Disconnected ${testMCPServer.name} from starship`);
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testErrorHandlingScenarios(): Promise<void> {
    const suite: TestSuite = {
      name: 'Error Handling Scenarios',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('⚠️  Testing Error Handling Scenarios');
    console.log('===================================');

    // Test 1: Very long request URLs
    suite.results.push(
      await this.runTest('Handles very long URLs', async () => {
        const longId = 'a'.repeat(1000);
        const response = await this.makeRequest('GET', `/api/starships/${longId}/connectors`);

        // Should return 400 or 404, not crash
        if (response.status < 400 || response.status >= 500) {
          throw new Error(`Expected 4xx error, got ${response.status}`);
        }
      })
    );

    // Test 2: Special characters in parameters
    suite.results.push(
      await this.runTest('Handles special characters in parameters', async () => {
        const specialId = 'test%20with%20spaces&special=chars';
        const response = await this.makeRequest('GET', `/api/starships/${specialId}/connectors`);

        // Should handle gracefully
        if (response.status >= 500) {
          throw new Error(`Server error with special characters: ${response.status}`);
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testIntegrationWorkflows(): Promise<void> {
    const suite: TestSuite = {
      name: 'Integration Workflows',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔄 Testing Integration Workflows');
    console.log('===============================');

    if (!this.testStarshipId) {
      console.log('⚠️  Skipping - no test starship available');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    const mcpServers = await this.mcpRepo.findAll();
    if (mcpServers.length < 2) {
      console.log('⚠️  Skipping - need at least 2 MCP servers for workflow testing');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Test 1: Complete connect-list-disconnect workflow
    suite.results.push(
      await this.runTest('Complete connector workflow', async () => {
        const server1 = mcpServers[0];
        const server2 = mcpServers[1];

        // Step 1: Connect first server
        let response = await this.makeRequest(
          'POST',
          `/api/starships/${this.testStarshipId}/connectors/${server1.id}`
        );
        if (response.status !== 201) {
          throw new Error(`Failed to connect server1: ${response.status}`);
        }

        // Step 2: Connect second server
        response = await this.makeRequest(
          'POST',
          `/api/starships/${this.testStarshipId}/connectors/${server2.id}`
        );
        if (response.status !== 201) {
          throw new Error(`Failed to connect server2: ${response.status}`);
        }

        // Step 3: List connectors
        response = await this.makeRequest(
          'GET',
          `/api/starships/${this.testStarshipId}/connectors`
        );
        if (response.status !== 200) {
          throw new Error(`Failed to list connectors: ${response.status}`);
        }

        const { connectedConnectors } = response.data;
        if (connectedConnectors.length !== 2) {
          throw new Error(`Expected 2 connectors, got ${connectedConnectors.length}`);
        }

        // Step 4: Disconnect both servers
        response = await this.makeRequest(
          'DELETE',
          `/api/starships/${this.testStarshipId}/connectors/${server1.id}`
        );
        if (response.status !== 200) {
          throw new Error(`Failed to disconnect server1: ${response.status}`);
        }

        response = await this.makeRequest(
          'DELETE',
          `/api/starships/${this.testStarshipId}/connectors/${server2.id}`
        );
        if (response.status !== 200) {
          throw new Error(`Failed to disconnect server2: ${response.status}`);
        }

        // Step 5: Verify no connectors remain
        response = await this.makeRequest(
          'GET',
          `/api/starships/${this.testStarshipId}/connectors`
        );
        if (response.status !== 200) {
          throw new Error(`Failed to verify cleanup: ${response.status}`);
        }

        if (response.data.connectedConnectors.length !== 0) {
          throw new Error(
            `Expected 0 connectors after cleanup, got ${response.data.connectedConnectors.length}`
          );
        }

        console.log('   Complete workflow executed successfully');
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testPerformanceAndLoad(): Promise<void> {
    const suite: TestSuite = {
      name: 'Performance & Load Testing',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('⚡ Testing Performance & Load');
    console.log('============================');

    // Test 1: Response time for MCP servers endpoint
    suite.results.push(
      await this.runTest('MCP servers endpoint response time', async () => {
        const startTime = Date.now();
        const response = await this.makeRequest('GET', '/api/mcp-servers');
        const responseTime = Date.now() - startTime;

        if (response.status !== 200) {
          throw new Error(`Request failed: ${response.status}`);
        }

        if (responseTime > 5000) {
          throw new Error(`Response too slow: ${responseTime}ms`);
        }

        console.log(`   Response time: ${responseTime}ms`);
      })
    );

    // Test 2: Concurrent requests
    suite.results.push(
      await this.runTest('Concurrent requests handling', async () => {
        const concurrentRequests = 5;
        const promises = Array(concurrentRequests)
          .fill(null)
          .map(() => this.makeRequest('GET', '/api/mcp-servers'));

        const startTime = Date.now();
        const responses = await Promise.all(promises);
        const totalTime = Date.now() - startTime;

        // Check all responses succeeded
        for (let i = 0; i < responses.length; i++) {
          if (responses[i].status !== 200) {
            throw new Error(`Request ${i} failed: ${responses[i].status}`);
          }
        }

        if (totalTime > 10000) {
          throw new Error(`Concurrent requests too slow: ${totalTime}ms`);
        }

        console.log(`   ${concurrentRequests} concurrent requests completed in ${totalTime}ms`);
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private calculateSuiteStats(suite: TestSuite): void {
    suite.passed = suite.results.filter((r) => r.status === 'PASS').length;
    suite.failed = suite.results.filter((r) => r.status === 'FAIL').length;
    suite.skipped = suite.results.filter((r) => r.status === 'SKIP').length;
    suite.totalDuration = suite.results.reduce((sum, result) => sum + result.duration, 0);
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
    console.log('📊 API Integration Test Results Summary');
    console.log('======================================');

    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalDuration = 0;

    for (const suite of this.testResults) {
      console.log(`\n📋 ${suite.name}`);
      console.log(`   ✅ Passed: ${suite.passed}`);
      console.log(`   ❌ Failed: ${suite.failed}`);
      console.log(`   ⏭️  Skipped: ${suite.skipped}`);
      console.log(`   ⏱️  Duration: ${suite.totalDuration}ms`);

      if (suite.failed > 0) {
        console.log('   🔍 Failed Tests:');
        suite.results
          .filter((r) => r.status === 'FAIL')
          .forEach((r) => console.log(`      - ${r.name}: ${r.error}`));
      }

      totalPassed += suite.passed;
      totalFailed += suite.failed;
      totalSkipped += suite.skipped;
      totalDuration += suite.totalDuration;
    }

    console.log('\n🎯 Overall Results');
    console.log('==================');
    console.log(`✅ Total Passed: ${totalPassed}`);
    console.log(`❌ Total Failed: ${totalFailed}`);
    console.log(`⏭️  Total Skipped: ${totalSkipped}`);
    console.log(`📈 Total Tests: ${totalPassed + totalFailed + totalSkipped}`);
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);

    const successRate =
      totalPassed + totalFailed > 0 ? (totalPassed / (totalPassed + totalFailed)) * 100 : 0;
    console.log(`🎯 Success Rate: ${successRate.toFixed(1)}%`);

    if (totalFailed === 0) {
      console.log('\n🎉 All API tests passed! The MCP server endpoints are working correctly.');
    } else {
      console.log('\n⚠️  Some API tests failed. Please review the errors above.');
    }

    // Provide recommendations
    console.log('\n💡 Recommendations');
    console.log('==================');

    if (successRate >= 95) {
      console.log('✅ API is production ready');
    } else if (successRate >= 80) {
      console.log('⚠️  API needs minor fixes before production');
    } else {
      console.log('❌ API needs significant work before production');
    }

    if (totalSkipped > 0) {
      console.log(
        `⚠️  ${totalSkipped} tests were skipped - consider addressing missing dependencies`
      );
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new APIIntegrationTester();
  tester.runAllTests().catch(console.error);
}

export { APIIntegrationTester };
