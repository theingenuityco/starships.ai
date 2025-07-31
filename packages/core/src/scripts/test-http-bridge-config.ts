#!/usr/bin/env node
/**
 * Test script to verify HTTP bridge configuration
 */

import { getTemplateForDeployment, isHttpBridgeTemplate, isHttpBridgeEnabled } from '../services/mcp/DockerServiceTemplate';

function testHttpBridgeConfig() {
  console.log('🧪 Testing HTTP Bridge Configuration...\n');

  // Test 1: Check if HTTP bridge is enabled by default
  const httpBridgeEnabled = isHttpBridgeEnabled();
  console.log(`📊 HTTP Bridge Enabled: ${httpBridgeEnabled}`);
  console.log(`📊 Environment Variable: ${process.env.MCP_HTTP_BRIDGE_ENABLED || 'not set'}\n`);

  // Test 2: Check template selection for Memory
  const memoryTemplate = getTemplateForDeployment('memory');
  console.log(`🔍 Memory Template Selected:`);
  console.log(`   Template Found: ${memoryTemplate ? 'Yes' : 'No'}`);
  if (memoryTemplate) {
    console.log(`   Image: ${memoryTemplate.image}`);
    console.log(`   Slug: ${memoryTemplate.slug}`);
    console.log(`   Is HTTP Bridge: ${isHttpBridgeTemplate(memoryTemplate)}`);
    console.log(`   Ports: ${memoryTemplate.ports?.join(', ') || 'None'}`);
    console.log(`   Health Check: ${memoryTemplate.healthcheck ? 'Configured' : 'None'}`);
  }
  console.log('');

  // Test 3: Check template selection with force HTTP bridge
  const memoryTemplateForced = getTemplateForDeployment('memory', true);
  console.log(`🔍 Memory Template (Forced HTTP Bridge):`);
  console.log(`   Template Found: ${memoryTemplateForced ? 'Yes' : 'No'}`);
  if (memoryTemplateForced) {
    console.log(`   Image: ${memoryTemplateForced.image}`);
    console.log(`   Is HTTP Bridge: ${isHttpBridgeTemplate(memoryTemplateForced)}`);
  }
  console.log('');

  // Test 4: Check template selection with force legacy
  const memoryTemplateLegacy = getTemplateForDeployment('memory', false);
  console.log(`🔍 Memory Template (Forced Legacy):`);
  console.log(`   Template Found: ${memoryTemplateLegacy ? 'Yes' : 'No'}`);
  if (memoryTemplateLegacy) {
    console.log(`   Image: ${memoryTemplateLegacy.image}`);
    console.log(`   Is HTTP Bridge: ${isHttpBridgeTemplate(memoryTemplateLegacy)}`);
  }
  console.log('');

  // Test 5: Summary
  console.log('📋 Configuration Summary:');
  if (httpBridgeEnabled && memoryTemplate && isHttpBridgeTemplate(memoryTemplate)) {
    console.log('   ✅ HTTP Bridge is properly configured');
    console.log('   ✅ Memory template will use HTTP bridge');
    console.log('   ✅ New deployments will use HTTP bridge architecture');
  } else {
    console.log('   ⚠️  HTTP Bridge configuration issues detected:');
    if (!httpBridgeEnabled) {
      console.log('      - HTTP Bridge feature flag is disabled');
    }
    if (!memoryTemplate) {
      console.log('      - Memory template not found');
    } else if (!isHttpBridgeTemplate(memoryTemplate)) {
      console.log('      - Memory template is not configured for HTTP bridge');
    }
  }
}

if (require.main === module) {
  testHttpBridgeConfig();
}

export { testHttpBridgeConfig };