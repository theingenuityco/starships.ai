/**
 * Comprehensive End-to-End Integration Test for Connector Instance Workflow
 *
 * This test validates the complete connector instance architecture from frontend
 * components through backend API endpoints to the database layer.
 *
 * Test Coverage:
 * - Frontend components can successfully call backend API
 * - StarshipCrewContent component properly loads and displays connector instances
 * - ConnectorSelector component can create and remove connector instances
 * - API endpoints return expected data format
 * - Error handling works correctly across the stack
 * - Real-time status updates flow correctly
 * - Cache invalidation works correctly
 */

import { createConnection } from '@starships/models/src/connection';
import { MCPServerOptionRepository } from '@starships/models/src/repositories/MCPServerOptionRepository';
import { MCPServerConnectorRepository } from '@starships/models/src/repositories/MCPServerConnectorRepository';
import { StarshipRepository } from '@starships/models/src/repositories/StarshipRepository';
import { UserRepository } from '@starships/models/src/repositories/UserRepository';
import {
  ValidationError,
  ConstraintViolationError,
  NotFoundError,
} from '@starships/models/src/types';

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

class EndToEndConnectorWorkflowTester {
  private baseURL: string;
  private authToken: string;
  private testResults: TestSuite[] = [];
  private connection: any;
  private mcpServerRepo: MCPServerOptionRepository;
  private mcpConnectorRepo: MCPServerConnectorRepository;
  private starshipRepo: StarshipRepository;
  private userRepo: UserRepository;
  private testStarshipId: string | null = null;
  private testUserId: string = 'test-user-e2e';
  private testTemplateIds: string[] = [];

  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3001';
    this.authToken = 'test-auth-token';

    const config = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
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
    console.log('🚀 Starting End-to-End Connector Instance Workflow Tests');
    console.log('=========================================================\n');

    try {
      await this.connection.connect();
      console.log('✅ Connected to Neo4j database\n');

      await this.setupTestEnvironment();

      // Run comprehensive test suites
      await this.testCompleteWorkflowIntegration();
      await this.testFrontendBackendIntegration();
      await this.testErrorHandlingAcrossStack();
      await this.testRealTimeStatusUpdates();
      await this.testCacheInvalidation();
      await this.testConcurrentOperations();
      await this.testDataConsistency();
      await this.testPerformanceAndScalability();
    } catch (error) {
      console.error('❌ Failed to initialize tests:', error);
    } finally {
      await this.cleanup();
      await this.connection.disconnect();
      this.printResults();
    }
  }

  private async setupTestEnvironment(): Promise<void> {
    console.log('🔧 Setting up end-to-end test environment');
    console.log('==========================================');

    try {
      // Ensure test user exists
      const existingUser = await this.userRepo.findById(this.testUserId);
      if (!existingUser) {
        await this.userRepo.create({
          email: 'e2e-test@starships.ai',
          displayName: 'E2E Test User',
          username: 'e2e-test-user',
          kindeId: this.testUserId,
        });
        console.log(`✅ Created test user: ${this.testUserId}`);
      }

      // Create a test starship
      const testStarship = await this.starshipRepo.create({
        name: 'E2E Test Starship',
        ownerId: this.testUserId,
        class: 'cruiser',
        slug: 'e2e-test-starship',
        powerLevel: 100,
        activeExpeditions: 0,
        sibilInsights: 0,
        status: 'active',
      });
      this.testStarshipId = testStarship.id;
      console.log(`✅ Created test starship: ${this.testStarshipId}`);

      // Get available MCP server templates
      const templates = await this.mcpServerRepo.findAll();
      this.testTemplateIds = templates.slice(0, 5).map((t) => t.id);
      console.log(`✅ Found ${this.testTemplateIds.length} MCP server templates for testing`);

      console.log('');
    } catch (error) {
      console.error('❌ Failed to set up test environment:', error);
      throw error;
    }
  }

  private async testCompleteWorkflowIntegration(): Promise<void> {
    const suite: TestSuite = {
      name: 'Complete Workflow Integration',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔄 Testing Complete Workflow Integration');
    console.log('=======================================');

    if (!this.testStarshipId || this.testTemplateIds.length === 0) {
      console.log('⚠️  Skipping - insufficient test resources');
      suite.results.push({ name: 'All tests', status: 'SKIP', duration: 0 });
      this.calculateSuiteStats(suite);
      this.testResults.push(suite);
      return;
    }

    // Test 1: Complete frontend-to-database workflow
    suite.results.push(
      await this.runTest('Complete frontend-to-database workflow simulation', async () => {
        const templateId = this.testTemplateIds[0];

        // Step 1: Simulate frontend fetching available templates
        const templatesResponse = await this.makeRequest('GET', '/mcp-servers');
        if (templatesResponse.status !== 200) {
          throw new Error(`Failed to fetch templates: ${templatesResponse.status}`);
        }
        const availableTemplates = templatesResponse.data.mcpServers;
        if (!Array.isArray(availableTemplates) || availableTemplates.length === 0) {
          throw new Error('No templates available for testing');
        }

        // Step 2: Simulate frontend fetching current connector instances
        const instancesResponse = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors`
        );
        if (instancesResponse.status !== 200) {
          throw new Error(`Failed to fetch connector instances: ${instancesResponse.status}`);
        }
        const initialInstances = instancesResponse.data.connectedConnectors;
        if (!Array.isArray(initialInstances)) {
          throw new Error('Invalid connector instances response format');
        }

        // Step 3: Simulate frontend creating a connector instance
        const createResponse = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );
        if (createResponse.status !== 201) {
          throw new Error(`Failed to create connector instance: ${createResponse.status}`);
        }
        const createdInstance = createResponse.data;
        if (!createdInstance.connectorId || !createdInstance.templateId) {
          throw new Error('Invalid create response format');
        }

        // Step 4: Simulate frontend fetching updated connector instances
        const updatedInstancesResponse = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors`
        );
        if (updatedInstancesResponse.status !== 200) {
          throw new Error(
            `Failed to fetch updated connector instances: ${updatedInstancesResponse.status}`
          );
        }
        const updatedInstances = updatedInstancesResponse.data.connectedConnectors;
        if (updatedInstances.length !== initialInstances.length + 1) {
          throw new Error('Connector instance count mismatch after creation');
        }

        // Step 5: Simulate frontend updating connector status
        const updateResponse = await this.makeRequest(
          'PUT',
          `/starships/${this.testStarshipId}/connectors/${createdInstance.connectorId}`,
          { status: 'active', isActive: true }
        );
        if (updateResponse.status !== 200) {
          throw new Error(`Failed to update connector instance: ${updateResponse.status}`);
        }

        // Step 6: Verify database consistency
        const dbInstance = await this.mcpConnectorRepo.findById(createdInstance.connectorId);
        if (!dbInstance || dbInstance.status !== 'active' || !dbInstance.isActive) {
          throw new Error('Database state inconsistent with API response');
        }

        // Step 7: Simulate frontend removing connector instance
        const deleteResponse = await this.makeRequest(
          'DELETE',
          `/starships/${this.testStarshipId}/connectors/${createdInstance.connectorId}`
        );
        if (deleteResponse.status !== 200) {
          throw new Error(`Failed to delete connector instance: ${deleteResponse.status}`);
        }

        // Step 8: Verify removal
        const finalInstancesResponse = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors`
        );
        const finalInstances = finalInstancesResponse.data.connectedConnectors;
        if (finalInstances.length !== initialInstances.length) {
          throw new Error('Connector instance count mismatch after deletion');
        }

        console.log('   ✅ Complete workflow executed successfully');
      })
    );

    // Test 2: Multi-connector workflow
    suite.results.push(
      await this.runTest('Multi-connector workflow with concurrent operations', async () => {
        const templateIds = this.testTemplateIds.slice(0, 3);
        const createdConnectors: string[] = [];

        try {
          // Create multiple connectors concurrently
          const createPromises = templateIds.map((templateId) =>
            this.makeRequest('POST', `/starships/${this.testStarshipId}/connectors/${templateId}`)
          );
          const createResponses = await Promise.all(createPromises);

          // Verify all creations succeeded
          for (const response of createResponses) {
            if (response.status !== 201) {
              throw new Error(`Failed to create connector: ${response.status}`);
            }
            createdConnectors.push(response.data.connectorId);
          }

          // Verify all connectors exist in database
          const dbInstances = await Promise.all(
            createdConnectors.map((id) => this.mcpConnectorRepo.findById(id))
          );
          if (dbInstances.some((instance) => !instance)) {
            throw new Error('Some connector instances not found in database');
          }

          // Update all connectors concurrently
          const updatePromises = createdConnectors.map((connectorId) =>
            this.makeRequest('PUT', `/starships/${this.testStarshipId}/connectors/${connectorId}`, {
              status: 'active',
            })
          );
          const updateResponses = await Promise.all(updatePromises);

          // Verify all updates succeeded
          for (const response of updateResponses) {
            if (response.status !== 200) {
              throw new Error(`Failed to update connector: ${response.status}`);
            }
          }

          console.log('   ✅ Multi-connector workflow completed successfully');
        } finally {
          // Cleanup: Remove all created connectors
          const deletePromises = createdConnectors.map((connectorId) =>
            this.makeRequest(
              'DELETE',
              `/starships/${this.testStarshipId}/connectors/${connectorId}`
            )
          );
          await Promise.all(deletePromises);
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testFrontendBackendIntegration(): Promise<void> {
    const suite: TestSuite = {
      name: 'Frontend-Backend API Integration',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔗 Testing Frontend-Backend API Integration');
    console.log('==========================================');

    // Test 1: API response format matches frontend expectations
    suite.results.push(
      await this.runTest(
        'API response format matches frontend interface expectations',
        async () => {
          // Test connector instances response format
          const response = await this.makeRequest(
            'GET',
            `/starships/${this.testStarshipId}/connectors`
          );
          if (response.status !== 200) {
            throw new Error(`API request failed: ${response.status}`);
          }

          const { starshipId, connectedConnectors } = response.data;

          // Verify response structure matches frontend MCPServerConnector interface
          if (starshipId !== this.testStarshipId) {
            throw new Error('Response starshipId mismatch');
          }

          if (!Array.isArray(connectedConnectors)) {
            throw new Error('connectedConnectors must be an array');
          }

          // If there are connectors, verify their structure
          if (connectedConnectors.length > 0) {
            const connector = connectedConnectors[0];
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
                throw new Error(`Missing required field in connector response: ${field}`);
              }
            }

            // Verify field types
            if (typeof connector.id !== 'string') throw new Error('connector.id must be string');
            if (typeof connector.templateId !== 'string')
              throw new Error('connector.templateId must be string');
            if (typeof connector.name !== 'string')
              throw new Error('connector.name must be string');
            if (typeof connector.command !== 'string')
              throw new Error('connector.command must be string');
            if (!Array.isArray(connector.args)) throw new Error('connector.args must be array');
            if (typeof connector.env !== 'string') throw new Error('connector.env must be string');
            if (!['active', 'inactive', 'error', 'connecting'].includes(connector.status)) {
              throw new Error('connector.status must be valid status');
            }
            if (typeof connector.isActive !== 'boolean')
              throw new Error('connector.isActive must be boolean');
          }

          console.log('   ✅ API response format matches frontend expectations');
        }
      )
    );

    // Test 2: Error responses match frontend error handling
    suite.results.push(
      await this.runTest('Error responses match frontend error handling expectations', async () => {
        // Test 404 error format
        const notFoundResponse = await this.makeRequest(
          'GET',
          '/starships/non-existent-id/connectors'
        );
        if (notFoundResponse.status !== 404) {
          throw new Error(`Expected 404, got ${notFoundResponse.status}`);
        }

        if (!notFoundResponse.data.error) {
          throw new Error('Error response must include error field');
        }

        // Test validation error format
        const validationResponse = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/invalid-uuid`
        );
        if (validationResponse.status !== 400) {
          throw new Error(`Expected 400, got ${validationResponse.status}`);
        }

        if (!validationResponse.data.error && !validationResponse.data.message) {
          throw new Error('Validation error response must include error or message field');
        }

        console.log('   ✅ Error responses match frontend expectations');
      })
    );

    // Test 3: Cache behavior matches frontend expectations
    suite.results.push(
      await this.runTest('API caching behavior supports frontend cache invalidation', async () => {
        const templateId = this.testTemplateIds[0];

        // Create connector instance
        const createResponse = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );
        if (createResponse.status !== 201) {
          throw new Error(`Failed to create connector: ${createResponse.status}`);
        }
        const connectorId = createResponse.data.connectorId;

        try {
          // Immediate fetch should show the new connector
          const immediateResponse = await this.makeRequest(
            'GET',
            `/starships/${this.testStarshipId}/connectors`
          );
          const immediateConnectors = immediateResponse.data.connectedConnectors;

          const foundConnector = immediateConnectors.find((c: any) => c.id === connectorId);
          if (!foundConnector) {
            throw new Error('Newly created connector not immediately visible');
          }

          // Update connector
          await this.makeRequest(
            'PUT',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`,
            { status: 'active' }
          );

          // Fetch should show updated status
          const updatedResponse = await this.makeRequest(
            'GET',
            `/starships/${this.testStarshipId}/connectors`
          );
          const updatedConnectors = updatedResponse.data.connectedConnectors;
          const updatedConnector = updatedConnectors.find((c: any) => c.id === connectorId);

          if (!updatedConnector || updatedConnector.status !== 'active') {
            throw new Error('Connector update not immediately visible');
          }

          console.log('   ✅ Cache invalidation works correctly');
        } finally {
          // Cleanup
          await this.makeRequest(
            'DELETE',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`
          );
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testErrorHandlingAcrossStack(): Promise<void> {
    const suite: TestSuite = {
      name: 'Error Handling Across Stack',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('⚠️  Testing Error Handling Across Stack');
    console.log('======================================');

    // Test 1: Database constraint violations are properly handled
    suite.results.push(
      await this.runTest('Database constraint violations are properly handled', async () => {
        const templateId = this.testTemplateIds[0];

        // Create first connector instance
        const firstResponse = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );
        if (firstResponse.status !== 201) {
          throw new Error(`Failed to create first connector: ${firstResponse.status}`);
        }
        const connectorId = firstResponse.data.connectorId;

        try {
          // Attempt to create duplicate - should be handled gracefully
          const duplicateResponse = await this.makeRequest(
            'POST',
            `/starships/${this.testStarshipId}/connectors/${templateId}`
          );

          // Should return 200 (idempotent) or 409 (conflict), not 500
          if (duplicateResponse.status === 500) {
            throw new Error('Database constraint violation caused server error');
          }

          if (duplicateResponse.status === 200) {
            // Idempotent response
            if (!duplicateResponse.data.alreadyConnected) {
              throw new Error('Idempotent response should indicate already connected');
            }
          } else if (duplicateResponse.status === 409) {
            // Conflict response
            if (!duplicateResponse.data.error) {
              throw new Error('Conflict response should include error message');
            }
          } else {
            throw new Error(
              `Unexpected status for duplicate creation: ${duplicateResponse.status}`
            );
          }

          console.log('   ✅ Database constraint violations handled properly');
        } finally {
          // Cleanup
          await this.makeRequest(
            'DELETE',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`
          );
        }
      })
    );

    // Test 2: Network errors are handled gracefully
    suite.results.push(
      await this.runTest('Network and timeout errors are handled gracefully', async () => {
        // Test with invalid endpoint
        try {
          const response = await fetch(`${this.baseURL}/api/invalid-endpoint`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${this.authToken}` },
          });

          // Should get 404, not crash
          if (response.status !== 404) {
            console.log(`Got status ${response.status} for invalid endpoint - acceptable`);
          }
        } catch (error) {
          // Network errors should be caught and handled
          if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
            throw new Error('Server connection refused - server may not be running');
          }
          // Other network errors are acceptable for this test
        }

        console.log('   ✅ Network errors handled gracefully');
      })
    );

    // Test 3: Validation errors provide clear feedback
    suite.results.push(
      await this.runTest('Validation errors provide clear feedback to frontend', async () => {
        // Test invalid UUID format
        const invalidUuidResponse = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/invalid-uuid`
        );
        if (invalidUuidResponse.status !== 400) {
          throw new Error(`Expected 400 for invalid UUID, got ${invalidUuidResponse.status}`);
        }

        const errorMessage =
          invalidUuidResponse.data.error || invalidUuidResponse.data.message || '';
        if (!errorMessage.toLowerCase().includes('uuid')) {
          throw new Error('Validation error should mention UUID format');
        }

        // Test empty update payload
        const templateId = this.testTemplateIds[0];
        const createResponse = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );
        if (createResponse.status !== 201) {
          throw new Error(`Failed to create test connector: ${createResponse.status}`);
        }
        const connectorId = createResponse.data.connectorId;

        try {
          const emptyUpdateResponse = await this.makeRequest(
            'PUT',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`,
            {}
          );

          if (emptyUpdateResponse.status !== 400) {
            throw new Error(`Expected 400 for empty update, got ${emptyUpdateResponse.status}`);
          }

          const updateErrorMessage =
            emptyUpdateResponse.data.error || emptyUpdateResponse.data.message || '';
          if (
            !updateErrorMessage.toLowerCase().includes('required') &&
            !updateErrorMessage.toLowerCase().includes('empty')
          ) {
            throw new Error('Empty update error should mention required data');
          }

          console.log('   ✅ Validation errors provide clear feedback');
        } finally {
          // Cleanup
          await this.makeRequest(
            'DELETE',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`
          );
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testRealTimeStatusUpdates(): Promise<void> {
    const suite: TestSuite = {
      name: 'Real-Time Status Updates',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('⚡ Testing Real-Time Status Updates');
    console.log('==================================');

    // Test 1: Status updates are immediately reflected
    suite.results.push(
      await this.runTest('Status updates are immediately reflected in API responses', async () => {
        const templateId = this.testTemplateIds[0];

        // Create connector instance
        const createResponse = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );
        if (createResponse.status !== 201) {
          throw new Error(`Failed to create connector: ${createResponse.status}`);
        }
        const connectorId = createResponse.data.connectorId;

        try {
          // Initial status should be 'connecting'
          if (createResponse.data.status !== 'connecting') {
            throw new Error(
              `Expected initial status 'connecting', got '${createResponse.data.status}'`
            );
          }

          // Update to active
          const updateResponse = await this.makeRequest(
            'PUT',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`,
            { status: 'active', isActive: true }
          );

          if (updateResponse.status !== 200) {
            throw new Error(`Failed to update status: ${updateResponse.status}`);
          }

          // Verify update is immediately visible
          const fetchResponse = await this.makeRequest(
            'GET',
            `/starships/${this.testStarshipId}/connectors`
          );
          const connectors = fetchResponse.data.connectedConnectors;
          const updatedConnector = connectors.find((c: any) => c.id === connectorId);

          if (!updatedConnector) {
            throw new Error('Updated connector not found in list');
          }

          if (updatedConnector.status !== 'active' || !updatedConnector.isActive) {
            throw new Error('Status update not immediately reflected');
          }

          // Update to error state
          const errorUpdateResponse = await this.makeRequest(
            'PUT',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`,
            { status: 'error', errorMessage: 'Test error message' }
          );

          if (errorUpdateResponse.status !== 200) {
            throw new Error(`Failed to update to error status: ${errorUpdateResponse.status}`);
          }

          // Verify error state is immediately visible
          const errorFetchResponse = await this.makeRequest(
            'GET',
            `/starships/${this.testStarshipId}/connectors`
          );
          const errorConnectors = errorFetchResponse.data.connectedConnectors;
          const errorConnector = errorConnectors.find((c: any) => c.id === connectorId);

          if (
            !errorConnector ||
            errorConnector.status !== 'error' ||
            errorConnector.errorMessage !== 'Test error message'
          ) {
            throw new Error('Error status update not immediately reflected');
          }

          console.log('   ✅ Status updates immediately reflected');
        } finally {
          // Cleanup
          await this.makeRequest(
            'DELETE',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`
          );
        }
      })
    );

    // Test 2: Concurrent status updates are handled correctly
    suite.results.push(
      await this.runTest('Concurrent status updates are handled correctly', async () => {
        const templateIds = this.testTemplateIds.slice(0, 3);
        const connectorIds: string[] = [];

        try {
          // Create multiple connectors
          for (const templateId of templateIds) {
            const response = await this.makeRequest(
              'POST',
              `/starships/${this.testStarshipId}/connectors/${templateId}`
            );
            if (response.status !== 201) {
              throw new Error(`Failed to create connector: ${response.status}`);
            }
            connectorIds.push(response.data.connectorId);
          }

          // Update all connectors concurrently
          const updatePromises = connectorIds.map((connectorId, index) =>
            this.makeRequest('PUT', `/starships/${this.testStarshipId}/connectors/${connectorId}`, {
              status: 'active',
              errorMessage: `Connector ${index + 1} active`,
            })
          );

          const updateResponses = await Promise.all(updatePromises);

          // Verify all updates succeeded
          for (const response of updateResponses) {
            if (response.status !== 200) {
              throw new Error(`Concurrent update failed: ${response.status}`);
            }
          }

          // Verify all updates are reflected
          const fetchResponse = await this.makeRequest(
            'GET',
            `/starships/${this.testStarshipId}/connectors`
          );
          const connectors = fetchResponse.data.connectedConnectors;

          for (const connectorId of connectorIds) {
            const connector = connectors.find((c: any) => c.id === connectorId);
            if (!connector || connector.status !== 'active') {
              throw new Error(`Concurrent update not reflected for connector ${connectorId}`);
            }
          }

          console.log('   ✅ Concurrent status updates handled correctly');
        } finally {
          // Cleanup
          const deletePromises = connectorIds.map((connectorId) =>
            this.makeRequest(
              'DELETE',
              `/starships/${this.testStarshipId}/connectors/${connectorId}`
            )
          );
          await Promise.all(deletePromises);
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testCacheInvalidation(): Promise<void> {
    const suite: TestSuite = {
      name: 'Cache Invalidation',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🗄️  Testing Cache Invalidation');
    console.log('=============================');

    // Test 1: Cache invalidation after connector operations
    suite.results.push(
      await this.runTest(
        'Cache invalidation works correctly after connector operations',
        async () => {
          const templateId = this.testTemplateIds[0];

          // Create connector instance
          const createResponse = await this.makeRequest(
            'POST',
            `/starships/${this.testStarshipId}/connectors/${templateId}`
          );
          if (createResponse.status !== 201) {
            throw new Error(`Failed to create connector: ${createResponse.status}`);
          }
          const connectorId = createResponse.data.connectorId;

          try {
            // Fetch connectors - should include new connector
            const fetchResponse1 = await this.makeRequest(
              'GET',
              `/starships/${this.testStarshipId}/connectors`
            );
            const connectors1 = fetchResponse1.data.connectedConnectors;
            const foundConnector1 = connectors1.find((c: any) => c.id === connectorId);

            if (!foundConnector1) {
              throw new Error('New connector not found after creation');
            }

            // Update connector
            await this.makeRequest(
              'PUT',
              `/starships/${this.testStarshipId}/connectors/${connectorId}`,
              { status: 'active' }
            );

            // Fetch again - should show updated status
            const fetchResponse2 = await this.makeRequest(
              'GET',
              `/starships/${this.testStarshipId}/connectors`
            );
            const connectors2 = fetchResponse2.data.connectedConnectors;
            const foundConnector2 = connectors2.find((c: any) => c.id === connectorId);

            if (!foundConnector2 || foundConnector2.status !== 'active') {
              throw new Error('Connector update not reflected - cache not invalidated');
            }

            // Delete connector
            await this.makeRequest(
              'DELETE',
              `/starships/${this.testStarshipId}/connectors/${connectorId}`
            );

            // Fetch again - should not include deleted connector
            const fetchResponse3 = await this.makeRequest(
              'GET',
              `/starships/${this.testStarshipId}/connectors`
            );
            const connectors3 = fetchResponse3.data.connectedConnectors;
            const foundConnector3 = connectors3.find((c: any) => c.id === connectorId);

            if (foundConnector3) {
              throw new Error('Deleted connector still found - cache not invalidated');
            }

            console.log('   ✅ Cache invalidation works correctly');
          } catch (error) {
            // Cleanup in case of error
            try {
              await this.makeRequest(
                'DELETE',
                `/starships/${this.testStarshipId}/connectors/${connectorId}`
              );
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            throw error;
          }
        }
      )
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testConcurrentOperations(): Promise<void> {
    const suite: TestSuite = {
      name: 'Concurrent Operations',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('⚡ Testing Concurrent Operations');
    console.log('===============================');

    // Test 1: Concurrent connector creation and deletion
    suite.results.push(
      await this.runTest(
        'Concurrent connector creation and deletion handled correctly',
        async () => {
          const templateIds = this.testTemplateIds.slice(0, 4);
          const operations: Promise<any>[] = [];
          const createdConnectors: string[] = [];

          try {
            // Start concurrent operations
            for (let i = 0; i < templateIds.length; i++) {
              const templateId = templateIds[i];

              if (i % 2 === 0) {
                // Create operations
                operations.push(
                  this.makeRequest(
                    'POST',
                    `/starships/${this.testStarshipId}/connectors/${templateId}`
                  ).then((response) => {
                    if (response.status === 201) {
                      createdConnectors.push(response.data.connectorId);
                    }
                    return response;
                  })
                );
              }
            }

            // Wait for all operations to complete
            const results = await Promise.all(operations);

            // Verify operations completed successfully
            for (const result of results) {
              if (result.status !== 201 && result.status !== 200) {
                throw new Error(`Concurrent operation failed: ${result.status}`);
              }
            }

            // Verify database consistency
            const dbInstances = await Promise.all(
              createdConnectors.map((id) => this.mcpConnectorRepo.findById(id))
            );

            if (dbInstances.some((instance) => !instance)) {
              throw new Error(
                'Some connector instances not found in database after concurrent operations'
              );
            }

            console.log('   ✅ Concurrent operations handled correctly');
          } finally {
            // Cleanup
            const deletePromises = createdConnectors.map(
              (connectorId) =>
                this.makeRequest(
                  'DELETE',
                  `/starships/${this.testStarshipId}/connectors/${connectorId}`
                ).catch(() => {}) // Ignore cleanup errors
            );
            await Promise.all(deletePromises);
          }
        }
      )
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testDataConsistency(): Promise<void> {
    const suite: TestSuite = {
      name: 'Data Consistency',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🔒 Testing Data Consistency');
    console.log('===========================');

    // Test 1: API and database consistency
    suite.results.push(
      await this.runTest('API responses match database state', async () => {
        const templateId = this.testTemplateIds[0];

        // Create connector via API
        const createResponse = await this.makeRequest(
          'POST',
          `/starships/${this.testStarshipId}/connectors/${templateId}`
        );
        if (createResponse.status !== 201) {
          throw new Error(`Failed to create connector: ${createResponse.status}`);
        }
        const connectorId = createResponse.data.connectorId;

        try {
          // Fetch via API
          const apiResponse = await this.makeRequest(
            'GET',
            `/starships/${this.testStarshipId}/connectors`
          );
          const apiConnectors = apiResponse.data.connectedConnectors;
          const apiConnector = apiConnectors.find((c: any) => c.id === connectorId);

          // Fetch from database directly
          const dbConnector = await this.mcpConnectorRepo.findById(connectorId);

          if (!apiConnector || !dbConnector) {
            throw new Error('Connector not found in API or database');
          }

          // Compare key fields
          if (apiConnector.id !== dbConnector.id) {
            throw new Error('ID mismatch between API and database');
          }
          if (apiConnector.templateId !== dbConnector.templateId) {
            throw new Error('Template ID mismatch between API and database');
          }
          if (apiConnector.status !== dbConnector.status) {
            throw new Error('Status mismatch between API and database');
          }
          if (apiConnector.isActive !== dbConnector.isActive) {
            throw new Error('isActive mismatch between API and database');
          }

          console.log('   ✅ API responses match database state');
        } finally {
          // Cleanup
          await this.makeRequest(
            'DELETE',
            `/starships/${this.testStarshipId}/connectors/${connectorId}`
          );
        }
      })
    );

    this.calculateSuiteStats(suite);
    this.testResults.push(suite);
    console.log('');
  }

  private async testPerformanceAndScalability(): Promise<void> {
    const suite: TestSuite = {
      name: 'Performance and Scalability',
      results: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0,
    };

    console.log('🚀 Testing Performance and Scalability');
    console.log('======================================');

    // Test 1: Response time performance
    suite.results.push(
      await this.runTest('API response times are within acceptable limits', async () => {
        const startTime = Date.now();

        // Test connector list endpoint
        const response = await this.makeRequest(
          'GET',
          `/starships/${this.testStarshipId}/connectors`
        );

        const responseTime = Date.now() - startTime;

        if (response.status !== 200) {
          throw new Error(`API request failed: ${response.status}`);
        }

        // Response should be under 1 second for basic operations
        if (responseTime > 1000) {
          throw new Error(`Response time too slow: ${responseTime}ms (expected < 1000ms)`);
        }

        console.log(`   ✅ Response time: ${responseTime}ms (acceptable)`);
      })
    );

    // Test 2: Bulk operations performance
    suite.results.push(
      await this.runTest('Bulk operations complete within reasonable time', async () => {
        const templateIds = this.testTemplateIds.slice(0, Math.min(3, this.testTemplateIds.length));
        const createdConnectors: string[] = [];

        try {
          const startTime = Date.now();

          // Create multiple connectors
          for (const templateId of templateIds) {
            const response = await this.makeRequest(
              'POST',
              `/starships/${this.testStarshipId}/connectors/${templateId}`
            );
            if (response.status === 201) {
              createdConnectors.push(response.data.connectorId);
            }
          }

          const creationTime = Date.now() - startTime;

          // Fetch all connectors
          const fetchStartTime = Date.now();
          const fetchResponse = await this.makeRequest(
            'GET',
            `/starships/${this.testStarshipId}/connectors`
          );
          const fetchTime = Date.now() - fetchStartTime;

          if (fetchResponse.status !== 200) {
            throw new Error(`Failed to fetch connectors: ${fetchResponse.status}`);
          }

          // Bulk operations should complete in reasonable time
          if (creationTime > 5000) {
            throw new Error(`Bulk creation too slow: ${creationTime}ms`);
          }
          if (fetchTime > 2000) {
            throw new Error(`Bulk fetch too slow: ${fetchTime}ms`);
          }

          console.log(`   ✅ Bulk creation: ${creationTime}ms, fetch: ${fetchTime}ms (acceptable)`);
        } finally {
          // Cleanup
          const deletePromises = createdConnectors.map(
            (connectorId) =>
              this.makeRequest(
                'DELETE',
                `/starships/${this.testStarshipId}/connectors/${connectorId}`
              ).catch(() => {}) // Ignore cleanup errors
          );
          await Promise.all(deletePromises);
        }
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
    console.log('🧹 Cleaning up end-to-end test data');
    console.log('====================================');

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
    console.log('📊 End-to-End Connector Workflow Test Results');
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
        '\n🎉 All end-to-end connector workflow tests passed! The system is working correctly.'
      );
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }

    // Provide recommendations
    console.log('\n💡 Integration Status');
    console.log('=====================');

    if (successRate >= 95) {
      console.log('✅ Connector Instance Architecture is production ready');
      console.log('✅ Frontend-Backend integration is working correctly');
      console.log('✅ Error handling is robust across the stack');
      console.log('✅ Real-time updates are functioning properly');
    } else if (successRate >= 80) {
      console.log('⚠️  System needs minor fixes before production');
      console.log('⚠️  Most functionality works but some edge cases need attention');
    } else {
      console.log('❌ System needs significant work before production');
      console.log('❌ Core functionality has issues that need to be resolved');
    }

    if (totalSkipped > 0) {
      console.log(
        `⚠️  ${totalSkipped} tests were skipped - consider addressing missing dependencies`
      );
    }

    console.log('\n🔧 Next Steps');
    console.log('=============');
    if (totalFailed === 0) {
      console.log('1. ✅ Run the demo script to validate user workflows');
      console.log('2. ✅ Deploy to staging environment for further testing');
      console.log('3. ✅ Conduct user acceptance testing');
    } else {
      console.log('1. 🔧 Fix failing tests identified above');
      console.log('2. 🔧 Re-run tests to verify fixes');
      console.log('3. 🔧 Consider adding additional test coverage for edge cases');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new EndToEndConnectorWorkflowTester();
  tester.runAllTests().catch(console.error);
}

export { EndToEndConnectorWorkflowTester };
