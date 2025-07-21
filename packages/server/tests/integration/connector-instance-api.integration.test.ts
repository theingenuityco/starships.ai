/**
 * Comprehensive Integration Tests for Connector Instance API Endpoints
 * Phase 3: Backend API Implementation
 *
 * This test suite validates the complete connector instance management API
 * including CRUD operations, error handling, and integration workflows.
 */

import { createConnection } from '@starships/models/src/connection';
import { MCPServerOptionRepository } from '@starships/models/src/repositories/MCPServerOptionRepository';
import { MCPServerConnectorRepository } from '@starships/models/src/repositories/MCPServerConnectorRepository';
import { StarshipRepository } from '@starships/models/src/repositories/StarshipRepository';
import { UserRepository } from '@starships/models/src/repositories/UserRepository';

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

class ConnectorInstanceAPITester {
  private baseURL: string;
  private authToken: string;
  private testResults: TestSuite[] = [];
  private connection: any;
  private mcpServerRepo: MCPServerOptionRepository;
  private mcpConnectorRepo: MCPServerConnectorRepository;
  private starshipRepo: StarshipRepository;
  private userRepo: UserRepository;
  private testStarshipId: string | null = null;
  private testUserId: string = 'test-user-1';
  private testTemplateIds: string[] = [];

  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3001';
    this.authToken = 'test-auth-token'; // Using test backdoor token

    // Initialize database connection and repositories
    const config = {
      uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    };

    this.connection = createConnection(config);
    this.mcpServerRepo = new MCPServerOptionRepository();
    this.mcpConnectorRepo = new MCPServerConnectorRepository();
    this.starshipRepo = new StarshipRepository();
    this.userRepo = new UserRepository();
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
      const response = await fetch(`${this.baseURL}/api${endpoint}`, config);
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
    console.log('🚀 Starting Connector Instance API Integration Tests');
    console.log('==================================================\n');

    try {
      // Connect to database
      await this.connection.connect();
      console.log('✅ Connected to Neo4j database\n');

      // Set up test environment
      await this.setupTestEnvironment();

      // Run test suites
      await this.testGetConnectorInstances();
      await this.testCreateConnectorInstance();
      await this.testUpdateConnectorInstance();
      await this.testDeleteConnectorInstance();
      await this.testGetSpecificConnectorInstance();
      await this.testErrorHandlingScenarios();
      await this.testBackwardCompatibility();
      await this.testCompleteWorkflows();
      await this.testConcurrencyAndRaceConditions();
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

    try {
      // Ensure test user exists
      const existingUser = await this.userRepo.findById(this.testUserId);
      if (!existingUser) {
        await this.userRepo.create({
          email: 'test@starships.ai',
          displayName: 'Test User',
          username: 'test-user',
          kindeId: this.testUserId,
        });
        console.log(`✅ Created test user: ${this.testUserId}`);
      }

      // Create a test starship
      const testStarship = await this.starshipRepo.create({
        name: 'Connector Test Starship',
        ownerId: this.testUserId,
        class: 'cruiser',
        slug: 'connector-test-starship',
        maxActiveExpeditions: 5,
        status: 'active',
      });
      this.testStarshipId = testStarship.id;
      console.log(`✅ Created test starship: ${this.testStarshipId}`);

      // Get available MCP server templates
      const templates = await this.mcpServerRepo.findAll();
      this.testTemplateIds = templates.slice(0, 3).map((t) => t.id); // Use first 3 templates
      console.log(`✅ Found ${this.testTemplateIds.length} MCP server templates for testing`);
    } catch (error) {
      console.error('❌ Failed to set up test environment:', error);
      throw error;
    }

    console.log('');
  }

  private async testGetConnectorInstances(): Promise<void> {
    const suite: TestSuite = {
      name: 'GET /starships/:id/connectors',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('📋 Testing GET /starships/:id/connectors');
    console.log('========================================');

    if (!this.testStarshipId) {
      console.log('⚠️  Skipping - no test starship available');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Test 1: Get empty connector list
    suite.results.push(
      await this.runTest('Returns empty list for starship with no connectors', async () => {
        const response = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors`
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
        if (connectedConnectors.length !== 0) {
          throw new Error(`Expected empty array, got ${connectedConnectors.length} connectors`);
        }

        console.log('   ✅ Empty connector list returned correctly');
      })
    );

    // Test 2: Invalid starship ID format
    suite.results.push(
      await this.runTest('Handles invalid starship ID format', async () => {
        const response = await this.makeRequest('GET', '/starships/invalid-id/connectors');

        if (response.status !== 404) {
          throw new Error(`Expected 404, got ${response.status}`);
        }
        if (!response.data.error?.includes('not found')) {
          throw new Error('Expected "not found" error message');
        }
      })
    );

    // Test 3: Non-existent starship
    suite.results.push(
      await this.runTest('Returns 404 for non-existent starship', async () => {
        const fakeId = '12345678-1234-1234-1234-123456789012';
        const response = await this.makeRequest('GET', `/starships/${fakeId}/connectors`);

        if (response.status !== 404) {
          throw new Error(`Expected 404, got ${response.status}`);
        }
      })
    );

    // Test 4: Access control - different user's starship
    suite.results.push(
      await this.runTest('Denies access to other users starships', async () => {
        // Create starship for different user
        const otherStarship = await this.starshipRepo.create({
          name: 'Other User Starship',
          ownerId: 'other-user-id',
          class: 'scout',
          slug: 'other-user-starship',
          maxActiveExpeditions: 3,
          status: 'active',
        });

        try {
          const response = await this.makeRequest(
            'GET',
            `/starships/${otherStarship.id}/connectors`
          );

          if (response.status !== 403) {
            throw new Error(`Expected 403, got ${response.status}`);
          }
          if (!response.data.error?.includes('Access denied')) {
            throw new Error('Expected "Access denied" error message');
          }
        } finally {
          // Clean up
          await this.starshipRepo.delete(otherStarship.id);
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testCreateConnectorInstance(): Promise<void> {
    const suite: TestSuite = {
      name: 'POST /starships/:id/connectors/:templateId',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('➕ Testing POST /starships/:id/connectors/:templateId');
    console.log('==================================================');

    if (!this.testStarshipId || this.testTemplateIds.length === 0) {
      console.log('⚠️  Skipping - missing test starship or templates');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    const templateId = this.testTemplateIds[0];

    // Test 1: Successful connector instance creation
    suite.results.push(
      await this.runTest('Successfully creates connector instance from template', async () => {
        const response = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );

        if (response.status !== 201) {
          throw new Error(`Expected 201, got ${response.status}: ${JSON.stringify(response.data)}`);
        }

        const {
          message,
          starshipId,
          connectorId,
          templateId: responseTemplateId,
          status,
          connectedAt,
          createdAt,
        } = response.data;

        if (!message?.includes('created successfully')) {
          throw new Error('Expected success message');
        }
        if (starshipId !== this.testStarshipId) {
          throw new Error('Response should include correct starshipId');
        }
        if (responseTemplateId !== templateId) {
          throw new Error('Response should include correct templateId');
        }
        if (!connectorId) {
          throw new Error('Response should include connectorId');
        }
        if (status !== 'connecting') {
          throw new Error('Initial status should be "connecting"');
        }
        if (!connectedAt || !createdAt) {
          throw new Error('Response should include timestamps');
        }

        console.log(`   ✅ Created connector instance: ${connectorId}`);
      })
    );

    // Test 2: Duplicate connector instance prevention
    suite.results.push(
      await this.runTest('Prevents duplicate connector instances (idempotent)', async () => {
        const response = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200 (idempotent), got ${response.status}: ${JSON.stringify(response.data)}`
          );
        }

        const { message, alreadyConnected } = response.data;
        if (!message?.includes('already exists')) {
          throw new Error('Expected "already exists" message');
        }
        if (!alreadyConnected) {
          throw new Error('Response should indicate already connected');
        }

        console.log('   ✅ Duplicate creation handled correctly (idempotent)');
      })
    );

    // Test 3: Invalid template ID
    suite.results.push(
      await this.runTest('Returns 404 for non-existent template', async () => {
        const fakeTemplateId = '12345678-1234-1234-1234-123456789012';
        const response = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${fakeTemplateId}`
        );

        if (response.status !== 404) {
          throw new Error(`Expected 404, got ${response.status}`);
        }
        if (!response.data.error?.includes('template not found')) {
          throw new Error('Expected "template not found" error message');
        }
      })
    );

    // Test 4: Invalid starship ID
    suite.results.push(
      await this.runTest('Returns 404 for non-existent starship', async () => {
        const fakeStarshipId = '12345678-1234-1234-1234-123456789012';
        const response = await this.makeRequest(
          'POST',
          `/starships/${fakeStarshipId}/connectors/${templateId}`
        );

        if (response.status !== 404) {
          throw new Error(`Expected 404, got ${response.status}`);
        }
        if (!response.data.error?.includes('not found')) {
          throw new Error('Expected "not found" error message');
        }
      })
    );

    // Test 5: Invalid UUID format validation
    suite.results.push(
      await this.runTest('Validates UUID format for template ID', async () => {
        const response = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/invalid-uuid`
        );

        if (response.status !== 400) {
          throw new Error(`Expected 400, got ${response.status}`);
        }
        if (
          !response.data.error?.includes('UUID format') &&
          !response.data.message?.includes('UUID format')
        ) {
          throw new Error('Expected UUID format validation error');
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testUpdateConnectorInstance(): Promise<void> {
    const suite: TestSuite = {
      name: 'PUT /starships/:id/connectors/:connectorId',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('✏️  Testing PUT /starships/:id/connectors/:connectorId');
    console.log('==================================================');

    if (!this.testStarshipId || this.testTemplateIds.length === 0) {
      console.log('⚠️  Skipping - missing test starship or templates');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Get existing connector instance
    const connectors = await this.mcpConnectorRepo.findByStarship(this.testStarshipId);
    if (connectors.length === 0) {
      console.log('⚠️  Skipping - no connector instances available for testing');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    const connectorId = connectors[0].id;

    // Test 1: Successful status update
    suite.results.push(
      await this.runTest('Successfully updates connector instance status', async () => {
        const updates = { status: 'active', isActive: true };
        const response = await this.makeRequest(
          'PUT',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`,
          updates
        );

        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
        }

        const { message, starshipId, connector } = response.data;
        if (!message?.includes('updated successfully')) {
          throw new Error('Expected success message');
        }
        if (starshipId !== this.testStarshipId) {
          throw new Error('Response should include correct starshipId');
        }
        if (connector.status !== 'active') {
          throw new Error('Status should be updated to "active"');
        }
        if (!connector.isActive) {
          throw new Error('isActive should be updated to true');
        }

        console.log('   ✅ Connector instance status updated successfully');
      })
    );

    // Test 2: Invalid status value
    suite.results.push(
      await this.runTest('Validates status values', async () => {
        const updates = { status: 'invalid-status' };
        const response = await this.makeRequest(
          'PUT',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`,
          updates
        );

        if (response.status !== 400) {
          throw new Error(`Expected 400, got ${response.status}`);
        }
        if (
          !response.data.error?.includes('Status must be one of') &&
          !response.data.message?.includes('Status must be one of')
        ) {
          throw new Error('Expected status validation error');
        }
      })
    );

    // Test 3: Empty update payload
    suite.results.push(
      await this.runTest('Handles empty update payload', async () => {
        const response = await this.makeRequest(
          'PUT',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`,
          {}
        );

        if (response.status !== 400) {
          throw new Error(`Expected 400, got ${response.status}`);
        }
        if (
          !response.data.error?.includes('Update data is required') &&
          !response.data.message?.includes('Update data is required')
        ) {
          throw new Error('Expected empty payload validation error');
        }
      })
    );

    // Test 4: Non-existent connector
    suite.results.push(
      await this.runTest('Returns 404 for non-existent connector', async () => {
        const fakeConnectorId = '12345678-1234-1234-1234-123456789012';
        const updates = { status: 'active' };
        const response = await this.makeRequest(
          'PUT',
          `/starships/${this.testStarshipId}/connectors/${fakeConnectorId}`,
          updates
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

  private async testDeleteConnectorInstance(): Promise<void> {
    const suite: TestSuite = {
      name: 'DELETE /starships/:id/connectors/:connectorId',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🗑️  Testing DELETE /starships/:id/connectors/:connectorId');
    console.log('====================================================');

    if (!this.testStarshipId || this.testTemplateIds.length < 2) {
      console.log('⚠️  Skipping - missing test starship or insufficient templates');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Create a connector instance specifically for deletion testing
    const templateId = this.testTemplateIds[1];
    const createdConnector = await this.mcpConnectorRepo.createFromTemplate(
      this.testStarshipId,
      templateId
    );
    const connectorId = createdConnector.id;

    // Test 1: Successful deletion
    suite.results.push(
      await this.runTest('Successfully deletes connector instance', async () => {
        const response = await this.makeRequest(
          'DELETE',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`
        );

        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
        }

        const {
          message,
          starshipId,
          connectorId: responseConnectorId,
          templateId: responseTemplateId,
          removedAt,
        } = response.data;
        if (!message?.includes('removed successfully')) {
          throw new Error('Expected success message');
        }
        if (starshipId !== this.testStarshipId) {
          throw new Error('Response should include correct starshipId');
        }
        if (responseConnectorId !== connectorId) {
          throw new Error('Response should include correct connectorId');
        }
        if (responseTemplateId !== templateId) {
          throw new Error('Response should include correct templateId');
        }
        if (!removedAt) {
          throw new Error('Response should include removedAt timestamp');
        }

        // Verify deletion
        const deletedConnector = await this.mcpConnectorRepo.findById(connectorId);
        if (deletedConnector) {
          throw new Error('Connector instance should be deleted from database');
        }

        console.log('   ✅ Connector instance deleted successfully');
      })
    );

    // Test 2: Delete non-existent connector
    suite.results.push(
      await this.runTest('Returns 404 for non-existent connector', async () => {
        const fakeConnectorId = '12345678-1234-1234-1234-123456789012';
        const response = await this.makeRequest(
          'DELETE',
          `/starships/${this.testStarshipId}/connectors/${fakeConnectorId}`
        );

        if (response.status !== 404) {
          throw new Error(`Expected 404, got ${response.status}`);
        }
        if (!response.data.error?.includes('not found')) {
          throw new Error('Expected "not found" error message');
        }
      })
    );

    // Test 3: Delete already deleted connector (idempotent)
    suite.results.push(
      await this.runTest('Handles deletion of already deleted connector', async () => {
        const response = await this.makeRequest(
          'DELETE',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`
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

  private async testGetSpecificConnectorInstance(): Promise<void> {
    const suite: TestSuite = {
      name: 'GET /starships/:id/connectors/:connectorId',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔍 Testing GET /starships/:id/connectors/:connectorId');
    console.log('==================================================');

    if (!this.testStarshipId) {
      console.log('⚠️  Skipping - missing test starship');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Get existing connector instance
    const connectors = await this.mcpConnectorRepo.findByStarship(this.testStarshipId);
    if (connectors.length === 0) {
      console.log('⚠️  Skipping - no connector instances available for testing');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    const connectorId = connectors[0].id;

    // Test 1: Successfully retrieve specific connector instance
    suite.results.push(
      await this.runTest('Successfully retrieves specific connector instance', async () => {
        const response = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`
        );

        if (response.status !== 200) {
          throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
        }

        const { starshipId, connector } = response.data;
        if (starshipId !== this.testStarshipId) {
          throw new Error('Response should include correct starshipId');
        }
        if (connector.id !== connectorId) {
          throw new Error('Response should include correct connector');
        }

        // Verify connector has template details
        const requiredFields = [
          'id',
          'templateId',
          'name',
          'command',
          'args',
          'env',
          'status',
          'isActive',
          'connectedAt',
          'createdAt',
          'updatedAt',
        ];
        for (const field of requiredFields) {
          if (!(field in connector)) {
            throw new Error(`Connector missing required field: ${field}`);
          }
        }

        console.log('   ✅ Connector instance retrieved with template details');
      })
    );

    // Test 2: Non-existent connector
    suite.results.push(
      await this.runTest('Returns 404 for non-existent connector', async () => {
        const fakeConnectorId = '12345678-1234-1234-1234-123456789012';
        const response = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors/${fakeConnectorId}`
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

    // Test 1: Malformed JSON in request body
    suite.results.push(
      await this.runTest('Handles malformed JSON in request body', async () => {
        const response = await fetch(
          `${this.baseURL}/api/starships/${this.testStarshipId}/connectors/test-id`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${this.authToken}`,
              'Content-Type': 'application/json',
            },
            body: '{"invalid": json}', // Malformed JSON
          }
        );

        if (response.status !== 400) {
          throw new Error(`Expected 400, got ${response.status}`);
        }
      })
    );

    // Test 2: Very large request payload
    suite.results.push(
      await this.runTest('Handles large request payloads', async () => {
        const largePayload = {
          status: 'active',
          errorMessage: 'x'.repeat(10000), // 10KB string
        };

        const response = await this.makeRequest(
          'PUT',
          `/starships/${this.testStarshipId}/connectors/test-id`,
          largePayload
        );

        // Should handle gracefully (either accept or reject with appropriate error)
        if (response.status >= 500) {
          throw new Error(`Server error with large payload: ${response.status}`);
        }
      })
    );

    // Test 3: Special characters in IDs
    suite.results.push(
      await this.runTest('Handles special characters in IDs', async () => {
        const specialId = 'test%20with%20spaces&special=chars';
        const response = await this.makeRequest('GET', `/starships/${specialId}/connectors`);

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

  private async testBackwardCompatibility(): Promise<void> {
    const suite: TestSuite = {
      name: 'Backward Compatibility',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔄 Testing Backward Compatibility');
    console.log('================================');

    // Test 1: Existing MCP server template endpoints still work
    suite.results.push(
      await this.runTest('MCP server template endpoints remain functional', async () => {
        // Test GET /mcp-servers
        const response = await this.makeRequest('GET', '/mcp-servers');

        if (response.status !== 200) {
          throw new Error(`MCP servers endpoint failed: ${response.status}`);
        }

        const { mcpServers } = response.data;
        if (!Array.isArray(mcpServers)) {
          throw new Error('MCP servers endpoint should return array');
        }

        console.log('   ✅ Legacy MCP server endpoints working');
      })
    );

    // Test 2: Old starship connector endpoints still work (if they exist)
    suite.results.push(
      await this.runTest('Legacy starship connector endpoints remain functional', async () => {
        if (!this.testStarshipId) {
          throw new Error('No test starship available');
        }

        // Test the new connector instance endpoint works alongside any legacy endpoints
        const response = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors`
        );

        if (response.status !== 200) {
          throw new Error(`Starship connectors endpoint failed: ${response.status}`);
        }

        const { starshipId, connectedConnectors } = response.data;
        if (starshipId !== this.testStarshipId) {
          throw new Error('Response format should be consistent');
        }
        if (!Array.isArray(connectedConnectors)) {
          throw new Error('Response should include connectedConnectors array');
        }

        console.log('   ✅ Starship connector endpoints working');
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testCompleteWorkflows(): Promise<void> {
    const suite: TestSuite = {
      name: 'Complete Integration Workflows',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔄 Testing Complete Integration Workflows');
    console.log('========================================');

    if (!this.testStarshipId || this.testTemplateIds.length < 2) {
      console.log('⚠️  Skipping - insufficient test resources');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Test 1: Complete CRUD workflow
    suite.results.push(
      await this.runTest('Complete CRUD workflow for connector instances', async () => {
        const templateId = this.testTemplateIds[1];

        // Step 1: Create connector instance
        let response = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );
        if (response.status !== 201) {
          throw new Error(`Failed to create connector: ${response.status}`);
        }
        const { connectorId } = response.data;

        // Step 2: Read connector instance
        response = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`
        );
        if (response.status !== 200) {
          throw new Error(`Failed to read connector: ${response.status}`);
        }

        // Step 3: Update connector instance
        const updates = { status: 'active', isActive: true };
        response = await this.makeRequest(
          'PUT',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`,
          updates
        );
        if (response.status !== 200) {
          throw new Error(`Failed to update connector: ${response.status}`);
        }

        // Step 4: List all connectors (should include our connector)
        response = await this.makeRequest('GET', `/starships/${this.testStarshipId}/connectors`);
        if (response.status !== 200) {
          throw new Error(`Failed to list connectors: ${response.status}`);
        }
        const foundConnector = response.data.connectedConnectors.find(
          (c: any) => c.id === connectorId
        );
        if (!foundConnector) {
          throw new Error('Created connector not found in list');
        }

        // Step 5: Delete connector instance
        response = await this.makeRequest(
          'DELETE',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`
        );
        if (response.status !== 200) {
          throw new Error(`Failed to delete connector: ${response.status}`);
        }

        // Step 6: Verify deletion
        response = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors/${connectorId}`
        );
        if (response.status !== 404) {
          throw new Error(`Connector should be deleted: ${response.status}`);
        }

        console.log('   ✅ Complete CRUD workflow executed successfully');
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testConcurrencyAndRaceConditions(): Promise<void> {
    const suite: TestSuite = {
      name: 'Concurrency & Race Conditions',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('⚡ Testing Concurrency & Race Conditions');
    console.log('======================================');

    if (!this.testStarshipId || this.testTemplateIds.length === 0) {
      console.log('⚠️  Skipping - insufficient test resources');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Test 1: Concurrent connector creation (should prevent duplicates)
    suite.results.push(
      await this.runTest('Handles concurrent connector creation', async () => {
        const templateId = this.testTemplateIds[0];

        // Create multiple concurrent requests to create the same connector
        const promises = Array(3)
          .fill(null)
          .map(() =>
            this.makeRequest('POST', `/starships/${this.testStarshipId}/connectors/${templateId}`)
          );

        const responses = await Promise.all(promises);

        // One should succeed (201), others should be idempotent (200)
        const successCount = responses.filter((r) => r.status === 201).length;
        const idempotentCount = responses.filter((r) => r.status === 200).length;

        if (successCount !== 1) {
          throw new Error(`Expected exactly 1 success, got ${successCount}`);
        }
        if (idempotentCount !== 2) {
          throw new Error(`Expected 2 idempotent responses, got ${idempotentCount}`);
        }

        console.log('   ✅ Concurrent creation handled correctly');
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

    try {
      if (this.testStarshipId) {
        // Remove all connector instances
        const connectors = await this.mcpConnectorRepo.findByStarship(this.testStarshipId);
        for (const connector of connectors) {
          await this.mcpConnectorRepo.delete(connector.id);
        }

        // Delete the test starship
        const deleted = await this.starshipRepo.delete(this.testStarshipId);
        if (deleted) {
          console.log(`✅ Deleted test starship: ${this.testStarshipId}`);
        } else {
          console.log(`⚠️  Could not delete test starship: ${this.testStarshipId}`);
        }
      }

      // Clean up test user if needed
      const testUser = await this.userRepo.findById(this.testUserId);
      if (testUser) {
        await this.userRepo.delete(this.testUserId);
        console.log(`✅ Deleted test user: ${this.testUserId}`);
      }
    } catch (error) {
      console.error(
        `❌ Error during cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    console.log('');
  }

  private printResults(): void {
    console.log('📊 Connector Instance API Test Results Summary');
    console.log('==============================================');

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
      console.log(
        '\n🎉 All connector instance API tests passed! The endpoints are working correctly.'
      );
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }

    // Provide recommendations
    console.log('\n💡 Recommendations');
    console.log('==================');

    if (successRate >= 95) {
      console.log('✅ Connector Instance API is production ready');
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
  const tester = new ConnectorInstanceAPITester();
  tester.runAllTests().catch(console.error);
}

export { ConnectorInstanceAPITester };
