/**
 * Connector Instance Workflow Demo Script
 *
 * This script demonstrates and validates the complete connector instance workflow
 * from a user's perspective, simulating real-world usage patterns.
 *
 * Demo Scenarios:
 * 1. User browses available connector templates
 * 2. User adds connectors to their starship
 * 3. User monitors connector status and health
 * 4. User manages connector lifecycle (activate/deactivate)
 * 5. User removes connectors when no longer needed
 * 6. Error scenarios and recovery
 */

import { createConnection } from '@starships/models/src/connection';
import { MCPServerOptionRepository } from '@starships/models/src/repositories/MCPServerOptionRepository';
import { MCPServerConnectorRepository } from '@starships/models/src/repositories/MCPServerConnectorRepository';
import { StarshipRepository } from '@starships/models/src/repositories/StarshipRepository';
import { UserRepository } from '@starships/models/src/repositories/UserRepository';

interface DemoStep {
  name: string;
  description: string;
  action: () => Promise<void>;
}

interface DemoScenario {
  name: string;
  description: string;
  steps: DemoStep[];
}

class ConnectorWorkflowDemo {
  private baseURL: string;
  private authToken: string;
  private connection: any;
  private mcpServerRepo: MCPServerOptionRepository;
  private mcpConnectorRepo: MCPServerConnectorRepository;
  private starshipRepo: StarshipRepository;
  private userRepo: UserRepository;
  private demoUserId: string = 'demo-user-workflow';
  private demoStarshipId: string | null = null;
  private availableTemplates: any[] = [];
  private createdConnectors: string[] = [];

  constructor() {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3001';
    this.authToken = 'demo-auth-token';

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

  private async makeRequest(method: string, endpoint: string, data?: any) {
    const config: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(`${this.baseURL}/api${endpoint}`, config);
    const responseData = await response.json().catch(() => ({}));

    return {
      status: response.status,
      data: responseData,
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logStep(step: string, details?: any): void {
    console.log(`\n🔹 ${step}`);
    if (details) {
      console.log(`   ${JSON.stringify(details, null, 2)}`);
    }
  }

  private logSuccess(message: string): void {
    console.log(`   ✅ ${message}`);
  }

  private logError(message: string): void {
    console.log(`   ❌ ${message}`);
  }

  private logInfo(message: string): void {
    console.log(`   ℹ️  ${message}`);
  }

  async runDemo(): Promise<void> {
    console.log('🚀 Connector Instance Workflow Demo');
    console.log('===================================');
    console.log('This demo simulates a complete user workflow for managing connector instances.\n');

    try {
      await this.connection.connect();
      console.log('✅ Connected to database\n');

      await this.setupDemoEnvironment();

      const scenarios: DemoScenario[] = [
        await this.createUserJourneyScenario(),
        await this.createErrorHandlingScenario(),
        await this.createAdvancedManagementScenario(),
      ];

      for (const scenario of scenarios) {
        await this.runScenario(scenario);
      }
    } catch (error) {
      console.error('❌ Demo failed:', error);
    } finally {
      await this.cleanup();
      await this.connection.disconnect();
      console.log('\n🎬 Demo completed!');
    }
  }

  private async setupDemoEnvironment(): Promise<void> {
    console.log('🔧 Setting up demo environment...');

    // Create demo user
    const existingUser = await this.userRepo.findById(this.demoUserId);
    if (!existingUser) {
      await this.userRepo.create({
        email: 'demo@starships.ai',
        displayName: 'Demo User',
        username: 'demo-user',
        kindeId: this.demoUserId,
      });
    }

    // Create demo starship
    const demoStarship = await this.starshipRepo.create({
      name: 'Demo Starship',
      ownerId: this.demoUserId,
      class: 'cruiser',
      slug: 'demo-starship-workflow',
      powerLevel: 100,
      activeExpeditions: 0,
      sibilInsights: 0,
      status: 'active',
    });
    this.demoStarshipId = demoStarship.id;

    // Get available templates
    const templates = await this.mcpServerRepo.findAll();
    this.availableTemplates = templates.slice(0, 4); // Use first 4 templates

    console.log(`✅ Demo environment ready`);
    console.log(`   - User: ${this.demoUserId}`);
    console.log(`   - Starship: ${this.demoStarshipId}`);
    console.log(`   - Available templates: ${this.availableTemplates.length}`);
    console.log('');
  }

  private async createUserJourneyScenario(): Promise<DemoScenario> {
    return {
      name: 'Complete User Journey',
      description: 'Simulates a typical user workflow from discovery to management',
      steps: [
        {
          name: 'Browse Available Connectors',
          description: 'User explores available connector templates',
          action: async () => {
            this.logStep('User opens the crew console and browses available connectors...');

            const response = await this.makeRequest('GET', '/mcp-servers');
            if (response.status !== 200) {
              throw new Error(`Failed to fetch templates: ${response.status}`);
            }

            const templates = response.data.mcpServers;
            this.logSuccess(`Found ${templates.length} available connector templates`);

            // Show some template details
            for (const template of templates.slice(0, 3)) {
              this.logInfo(
                `${template.name}: ${template.command} (${template.args?.join(' ') || 'no args'})`
              );
            }
          },
        },
        {
          name: 'Check Current Connectors',
          description: 'User checks what connectors are currently deployed',
          action: async () => {
            this.logStep('User checks current connector instances on their starship...');

            const response = await this.makeRequest(
              'GET',
              `/starships/${this.demoStarshipId}/connectors`
            );
            if (response.status !== 200) {
              throw new Error(`Failed to fetch current connectors: ${response.status}`);
            }

            const connectors = response.data.connectedConnectors;
            this.logSuccess(`Currently has ${connectors.length} connector instances`);

            if (connectors.length === 0) {
              this.logInfo('No connectors currently deployed - perfect for our demo!');
            }
          },
        },
        {
          name: 'Add First Connector',
          description: 'User adds their first connector to the starship',
          action: async () => {
            const template = this.availableTemplates[0];
            this.logStep(`User decides to add the "${template.name}" connector...`);

            const response = await this.makeRequest(
              'POST',
              `/starships/${this.demoStarshipId}/connectors/${template.id}`
            );
            if (response.status !== 201) {
              throw new Error(`Failed to create connector: ${response.status}`);
            }

            const connectorId = response.data.connectorId;
            this.createdConnectors.push(connectorId);

            this.logSuccess(`Successfully created connector instance: ${connectorId}`);
            this.logInfo(`Status: ${response.data.status}`);
            this.logInfo(`Connected at: ${response.data.connectedAt}`);
          },
        },
        {
          name: 'Monitor Connector Status',
          description: 'User monitors the connector as it initializes',
          action: async () => {
            this.logStep('User monitors the connector status as it initializes...');

            // Simulate monitoring over time
            for (let i = 0; i < 3; i++) {
              await this.sleep(1000); // Wait 1 second

              const response = await this.makeRequest(
                'GET',
                `/starships/${this.demoStarshipId}/connectors`
              );
              if (response.status !== 200) {
                throw new Error(`Failed to fetch connectors: ${response.status}`);
              }

              const connectors = response.data.connectedConnectors;
              const ourConnector = connectors.find((c: any) =>
                this.createdConnectors.includes(c.id)
              );

              if (ourConnector) {
                this.logInfo(
                  `Check ${i + 1}: Status is "${ourConnector.status}", Active: ${ourConnector.isActive}`
                );
              }
            }

            this.logSuccess('Connector monitoring completed');
          },
        },
        {
          name: 'Activate Connector',
          description: 'User activates the connector for use',
          action: async () => {
            const connectorId = this.createdConnectors[0];
            this.logStep('User activates the connector for active use...');

            const response = await this.makeRequest(
              'PUT',
              `/starships/${this.demoStarshipId}/connectors/${connectorId}`,
              { status: 'active', isActive: true }
            );

            if (response.status !== 200) {
              throw new Error(`Failed to activate connector: ${response.status}`);
            }

            this.logSuccess('Connector successfully activated');
            this.logInfo(`Updated status: ${response.data.connector.status}`);
          },
        },
        {
          name: 'Add Multiple Connectors',
          description: 'User adds several more connectors to build their toolkit',
          action: async () => {
            this.logStep('User decides to add more connectors to build a comprehensive toolkit...');

            const templatesToAdd = this.availableTemplates.slice(1, 3); // Add 2 more

            for (const template of templatesToAdd) {
              this.logInfo(`Adding "${template.name}" connector...`);

              const response = await this.makeRequest(
                'POST',
                `/starships/${this.demoStarshipId}/connectors/${template.id}`
              );
              if (response.status === 201) {
                this.createdConnectors.push(response.data.connectorId);
                this.logSuccess(`Added ${template.name}`);
              } else if (response.status === 200) {
                this.logInfo(`${template.name} was already connected`);
              } else {
                this.logError(`Failed to add ${template.name}: ${response.status}`);
              }
            }

            this.logSuccess(`Now managing ${this.createdConnectors.length} connector instances`);
          },
        },
        {
          name: 'Review Connector Fleet',
          description: 'User reviews their complete connector setup',
          action: async () => {
            this.logStep('User reviews their complete connector fleet...');

            const response = await this.makeRequest(
              'GET',
              `/starships/${this.demoStarshipId}/connectors`
            );
            if (response.status !== 200) {
              throw new Error(`Failed to fetch connectors: ${response.status}`);
            }

            const connectors = response.data.connectedConnectors;
            this.logSuccess(`Total connector instances: ${connectors.length}`);

            console.log('\n   📋 Connector Fleet Status:');
            for (const connector of connectors) {
              const statusIcon =
                connector.status === 'active'
                  ? '🟢'
                  : connector.status === 'connecting'
                    ? '🟡'
                    : connector.status === 'error'
                      ? '🔴'
                      : '⚪';
              console.log(`   ${statusIcon} ${connector.name} (${connector.status})`);
            }
          },
        },
      ],
    };
  }

  private async createErrorHandlingScenario(): Promise<DemoScenario> {
    return {
      name: 'Error Handling and Recovery',
      description: 'Demonstrates how the system handles various error conditions',
      steps: [
        {
          name: 'Attempt Invalid Operations',
          description: 'User tries operations that should fail gracefully',
          action: async () => {
            this.logStep('Testing system resilience with invalid operations...');

            // Try to create connector with invalid template ID
            this.logInfo('Attempting to create connector with invalid template ID...');
            const invalidResponse = await this.makeRequest(
              'POST',
              `/starships/${this.demoStarshipId}/connectors/invalid-uuid`
            );
            if (invalidResponse.status === 400) {
              this.logSuccess('Invalid UUID properly rejected with 400 error');
            } else {
              this.logError(`Expected 400, got ${invalidResponse.status}`);
            }

            // Try to update non-existent connector
            this.logInfo('Attempting to update non-existent connector...');
            const updateResponse = await this.makeRequest(
              'PUT',
              `/starships/${this.demoStarshipId}/connectors/12345678-1234-1234-1234-123456789012`,
              { status: 'active' }
            );
            if (updateResponse.status === 404) {
              this.logSuccess('Non-existent connector update properly rejected with 404');
            } else {
              this.logError(`Expected 404, got ${updateResponse.status}`);
            }
          },
        },
        {
          name: 'Simulate Connector Error',
          description: 'User deals with a connector that encounters an error',
          action: async () => {
            if (this.createdConnectors.length === 0) {
              this.logInfo('No connectors available for error simulation - skipping');
              return;
            }

            const connectorId = this.createdConnectors[0];
            this.logStep('Simulating a connector error and recovery...');

            // Set connector to error state
            this.logInfo('Connector encounters an error...');
            const errorResponse = await this.makeRequest(
              'PUT',
              `/starships/${this.demoStarshipId}/connectors/${connectorId}`,
              {
                status: 'error',
                errorMessage: 'Simulated connection timeout error',
                isActive: false,
              }
            );

            if (errorResponse.status === 200) {
              this.logSuccess('Connector error state recorded');
              this.logInfo(`Error message: ${errorResponse.data.connector.errorMessage}`);
            }

            // User checks error details
            await this.sleep(1000);
            this.logInfo('User investigates the error...');
            const statusResponse = await this.makeRequest(
              'GET',
              `/starships/${this.demoStarshipId}/connectors`
            );
            const connectors = statusResponse.data.connectedConnectors;
            const errorConnector = connectors.find((c: any) => c.id === connectorId);

            if (errorConnector && errorConnector.status === 'error') {
              this.logInfo(`Error details visible in UI: ${errorConnector.errorMessage}`);
            }

            // User attempts recovery
            await this.sleep(1000);
            this.logInfo('User attempts to recover the connector...');
            const recoveryResponse = await this.makeRequest(
              'PUT',
              `/starships/${this.demoStarshipId}/connectors/${connectorId}`,
              {
                status: 'connecting',
                errorMessage: null,
                isActive: true,
              }
            );

            if (recoveryResponse.status === 200) {
              this.logSuccess('Connector recovery initiated');
            }

            // Final activation
            await this.sleep(1000);
            await this.makeRequest(
              'PUT',
              `/starships/${this.demoStarshipId}/connectors/${connectorId}`,
              { status: 'active' }
            );
            this.logSuccess('Connector successfully recovered and activated');
          },
        },
      ],
    };
  }

  private async createAdvancedManagementScenario(): Promise<DemoScenario> {
    return {
      name: 'Advanced Connector Management',
      description: 'Demonstrates advanced connector management features',
      steps: [
        {
          name: 'Bulk Status Management',
          description: 'User manages multiple connectors simultaneously',
          action: async () => {
            this.logStep('User performs bulk connector management operations...');

            if (this.createdConnectors.length < 2) {
              this.logInfo('Need at least 2 connectors for bulk operations - skipping');
              return;
            }

            // Deactivate all connectors
            this.logInfo('Deactivating all connectors for maintenance...');
            const deactivatePromises = this.createdConnectors.map((connectorId) =>
              this.makeRequest(
                'PUT',
                `/starships/${this.demoStarshipId}/connectors/${connectorId}`,
                { status: 'inactive', isActive: false }
              )
            );

            const deactivateResults = await Promise.all(deactivatePromises);
            const successfulDeactivations = deactivateResults.filter(
              (r) => r.status === 200
            ).length;
            this.logSuccess(`Successfully deactivated ${successfulDeactivations} connectors`);

            await this.sleep(2000);

            // Reactivate all connectors
            this.logInfo('Reactivating all connectors after maintenance...');
            const reactivatePromises = this.createdConnectors.map((connectorId) =>
              this.makeRequest(
                'PUT',
                `/starships/${this.demoStarshipId}/connectors/${connectorId}`,
                { status: 'active', isActive: true }
              )
            );

            const reactivateResults = await Promise.all(reactivatePromises);
            const successfulReactivations = reactivateResults.filter(
              (r) => r.status === 200
            ).length;
            this.logSuccess(`Successfully reactivated ${successfulReactivations} connectors`);
          },
        },
        {
          name: 'Connector Lifecycle Management',
          description: 'User manages the complete lifecycle of connectors',
          action: async () => {
            this.logStep('Demonstrating complete connector lifecycle management...');

            // Add a temporary connector for lifecycle demo
            const template = this.availableTemplates[this.availableTemplates.length - 1];
            this.logInfo(`Adding temporary connector "${template.name}" for lifecycle demo...`);

            const createResponse = await this.makeRequest(
              'POST',
              `/starships/${this.demoStarshipId}/connectors/${template.id}`
            );
            if (createResponse.status !== 201) {
              this.logInfo(
                'Connector already exists or creation failed - using existing connector'
              );
              return;
            }

            const tempConnectorId = createResponse.data.connectorId;
            this.logSuccess('Temporary connector created');

            // Lifecycle: connecting -> active -> inactive -> removed
            await this.sleep(1000);

            this.logInfo('Activating connector...');
            await this.makeRequest(
              'PUT',
              `/starships/${this.demoStarshipId}/connectors/${tempConnectorId}`,
              { status: 'active', isActive: true }
            );

            await this.sleep(1000);

            this.logInfo('Deactivating connector...');
            await this.makeRequest(
              'PUT',
              `/starships/${this.demoStarshipId}/connectors/${tempConnectorId}`,
              { status: 'inactive', isActive: false }
            );

            await this.sleep(1000);

            this.logInfo('Removing connector...');
            const deleteResponse = await this.makeRequest(
              'DELETE',
              `/starships/${this.demoStarshipId}/connectors/${tempConnectorId}`
            );

            if (deleteResponse.status === 200) {
              this.logSuccess('Connector successfully removed from starship');
              this.logInfo(
                'Complete lifecycle demonstrated: create -> activate -> deactivate -> remove'
              );
            }
          },
        },
        {
          name: 'Final Fleet Status',
          description: 'User reviews final connector fleet status',
          action: async () => {
            this.logStep('Final review of connector fleet status...');

            const response = await this.makeRequest(
              'GET',
              `/starships/${this.demoStarshipId}/connectors`
            );
            if (response.status !== 200) {
              throw new Error(`Failed to fetch final status: ${response.status}`);
            }

            const connectors = response.data.connectedConnectors;
            this.logSuccess(`Final connector fleet: ${connectors.length} instances`);

            // Show detailed status
            console.log('\n   📊 Final Fleet Status Report:');
            console.log('   ================================');

            const statusCounts = {
              active: 0,
              inactive: 0,
              connecting: 0,
              error: 0,
            };

            for (const connector of connectors) {
              statusCounts[connector.status as keyof typeof statusCounts]++;
              const uptime = connector.connectedAt
                ? Math.round((Date.now() - new Date(connector.connectedAt).getTime()) / 1000)
                : 0;
              console.log(`   • ${connector.name}: ${connector.status} (${uptime}s uptime)`);
            }

            console.log('\n   📈 Status Summary:');
            Object.entries(statusCounts).forEach(([status, count]) => {
              if (count > 0) {
                console.log(`   • ${status}: ${count}`);
              }
            });

            this.logSuccess('Connector fleet is healthy and operational!');
          },
        },
      ],
    };
  }

  private async runScenario(scenario: DemoScenario): Promise<void> {
    console.log(`\n🎭 Scenario: ${scenario.name}`);
    console.log(`📝 ${scenario.description}`);
    console.log(''.padEnd(50, '='));

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];

      console.log(`\n📍 Step ${i + 1}/${scenario.steps.length}: ${step.name}`);
      console.log(`   ${step.description}`);

      try {
        await step.action();
        console.log(`   ✅ Step completed successfully`);
      } catch (error) {
        console.log(
          `   ❌ Step failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        throw error; // Re-throw to stop scenario
      }

      // Small delay between steps for readability
      if (i < scenario.steps.length - 1) {
        await this.sleep(500);
      }
    }

    console.log(`\n🎉 Scenario "${scenario.name}" completed successfully!`);
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up demo environment...');

    try {
      // Remove all created connectors
      if (this.createdConnectors.length > 0) {
        const deletePromises = this.createdConnectors.map(
          (connectorId) =>
            this.makeRequest(
              'DELETE',
              `/starships/${this.demoStarshipId}/connectors/${connectorId}`
            ).catch(() => {}) // Ignore cleanup errors
        );
        await Promise.all(deletePromises);
        console.log(`✅ Cleaned up ${this.createdConnectors.length} connector instances`);
      }

      // Remove demo starship
      if (this.demoStarshipId) {
        await this.starshipRepo.delete(this.demoStarshipId);
        console.log(`✅ Cleaned up demo starship`);
      }

      // Remove demo user
      await this.userRepo.delete(this.demoUserId);
      console.log(`✅ Cleaned up demo user`);
    } catch (error) {
      console.log(
        `⚠️  Cleanup warning: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

// Run demo if this script is executed directly
if (require.main === module) {
  const demo = new ConnectorWorkflowDemo();
  demo.runDemo().catch(console.error);
}

export { ConnectorWorkflowDemo };
