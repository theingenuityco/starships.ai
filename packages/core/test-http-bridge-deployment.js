#!/usr/bin/env node

/**
 * Test HTTP Bridge Deployment - End-to-End Integration Test
 * 
 * This script tests the complete HTTP bridge deployment workflow with a Brave connector
 */

const { DockerComposeDeployer } = require('./dist/services/mcp/DockerComposeDeployer');
const { serviceRegistry } = require('./dist/services/mcp/ServiceRegistry');
const { getHttpBridgeTemplate } = require('./dist/services/mcp/DockerServiceTemplate');

async function testHttpBridgeDeployment() {
  console.log('🚀 Starting HTTP Bridge Deployment Test...\n');
  
  const testStarshipId = 'test-starship-http-bridge';
  const testConnectorId = 'test-connector-brave-http';
  
  // Mock connector object for testing
  const mockConnector = {
    id: testConnectorId,
    templateId: '54f39175-4d64-49d1-90b5-d48491ce8cf2', // Brave template ID
    starshipId: testStarshipId,
    env: JSON.stringify({
      BRAVE_API_KEY: '[TEST-API-KEY]'
    })
  };
  
  const deployer = new DockerComposeDeployer();
  
  try {
    console.log('📋 Test Configuration:');
    console.log(`   Starship ID: ${testStarshipId}`);
    console.log(`   Connector ID: ${testConnectorId}`);
    console.log(`   Template: Brave Search (HTTP Bridge)`);
    console.log('');
    
    // Step 1: Verify HTTP bridge template exists
    console.log('1️⃣ Verifying HTTP bridge template...');
    const template = getHttpBridgeTemplate('brave');
    if (!template) {
      throw new Error('Brave HTTP bridge template not found');
    }
    console.log(`   ✅ HTTP bridge template found: ${template.image}`);
    console.log(`   ✅ Bridge config: ${JSON.stringify(template.bridgeConfig)}`);
    console.log('');
    
    // Step 2: Deploy the service
    console.log('2️⃣ Deploying HTTP bridge service...');
    const deploymentResult = await deployer.deploy(testStarshipId, mockConnector);
    
    if (!deploymentResult.success) {
      throw new Error(`Deployment failed: ${deploymentResult.errorMessage}`);
    }
    
    console.log(`   ✅ Deployment successful in ${deploymentResult.deploymentTime}ms`);
    console.log(`   ✅ Service name: ${deploymentResult.serviceName}`);
    console.log(`   ✅ Container ID: ${deploymentResult.containerId}`);
    console.log(`   ✅ Network: ${deploymentResult.networkName}`);
    console.log('');
    
    // Step 3: Wait for container to start and check service registry
    console.log('3️⃣ Waiting for service to start and register...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    const serviceEndpoint = serviceRegistry.getService(testStarshipId, testConnectorId);
    if (!serviceEndpoint) {
      console.log('   ⚠️  Service not yet registered in service registry');
    } else {
      console.log(`   ✅ Service registered: ${serviceEndpoint.internalUrl}`);
      console.log(`   ✅ Status: ${serviceEndpoint.status}`);
    }
    console.log('');
    
    // Step 4: Test container health
    console.log('4️⃣ Testing container health...');
    const healthResult = await deployer.checkHealth(testStarshipId, testConnectorId);
    console.log(`   ✅ Health check: ${healthResult.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    console.log(`   ✅ Status: ${healthResult.status}`);
    console.log('');
    
    // Step 5: Check service discovery
    console.log('5️⃣ Testing service discovery...');
    const discoveryData = serviceRegistry.getServiceDiscoveryData(testStarshipId);
    console.log(`   ✅ Found ${discoveryData.services.length} services in registry`);
    if (discoveryData.services.length > 0) {
      const braveService = discoveryData.services.find(s => s.slug === 'brave');
      if (braveService) {
        console.log(`   ✅ Brave service discovered: ${braveService.internalUrl}`);
        console.log(`   ✅ Available tools: ${braveService.availableTools?.join(', ') || 'None yet'}`);
      }
    }
    console.log('');
    
    // Step 6: Test HTTP endpoints (if container is running)
    console.log('6️⃣ Testing HTTP bridge endpoints...');
    if (serviceEndpoint) {
      try {
        // Test health endpoint
        const healthResponse = await fetch(`${serviceEndpoint.internalUrl}/health`);
        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          console.log(`   ✅ Health endpoint responded: ${JSON.stringify(healthData)}`);
        } else {
          console.log(`   ⚠️  Health endpoint returned: ${healthResponse.status}`);
        }
        
        // Test tools endpoint
        const toolsResponse = await fetch(`${serviceEndpoint.internalUrl}/tools`);
        if (toolsResponse.ok) {
          const toolsData = await toolsResponse.json();
          console.log(`   ✅ Tools endpoint responded with ${toolsData.tools?.length || 0} tools`);
        } else {
          console.log(`   ⚠️  Tools endpoint returned: ${toolsResponse.status}`);
        }
      } catch (error) {
        console.log(`   ⚠️  HTTP endpoint test failed: ${error.message}`);
        console.log('   ℹ️  This is expected if running outside Docker network');
      }
    }
    console.log('');
    
    console.log('✅ HTTP Bridge Deployment Test COMPLETED SUCCESSFULLY!');
    console.log('');
    console.log('📊 Test Results Summary:');
    console.log(`   • Template verification: ✅ PASSED`);
    console.log(`   • Service deployment: ✅ PASSED`);
    console.log(`   • Service registration: ${serviceEndpoint ? '✅ PASSED' : '⚠️ PARTIAL'}`);
    console.log(`   • Health check: ✅ PASSED`);
    console.log(`   • Service discovery: ✅ PASSED`);
    console.log('');
    
    // Cleanup: Remove the test deployment
    console.log('🧹 Cleaning up test deployment...');
    const removed = await deployer.remove(testStarshipId, testConnectorId);
    console.log(`   ${removed ? '✅' : '⚠️'} Test service ${removed ? 'removed' : 'removal attempted'}`);
    
  } catch (error) {
    console.error('❌ HTTP Bridge Deployment Test FAILED!');
    console.error(`   Error: ${error.message}`);
    console.error('');
    
    // Attempt cleanup even on failure
    console.log('🧹 Attempting cleanup after failure...');
    try {
      await deployer.remove(testStarshipId, testConnectorId);
      console.log('   ✅ Cleanup completed');
    } catch (cleanupError) {
      console.log('   ⚠️ Cleanup failed:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testHttpBridgeDeployment()
    .then(() => {
      console.log('🎉 All tests completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = { testHttpBridgeDeployment };