#!/usr/bin/env node
/**
 * Test script to verify HTTP bridge configuration
 */

import { getTemplateForDeployment, isHttpBridgeTemplate, getHttpBridgeEnabled } from '../services/mcp/DockerServiceTemplate';

function testHttpBridgeConfig() {
  console.log('🧪 Testing HTTP Bridge Configuration...\n');

  // Test 1: Check if HTTP bridge is enabled by default
  const httpBridgeEnabled = getHttpBridgeEnabled();
  console.log(`📊 HTTP Bridge Enabled: ${httpBridgeEnabled}`);
  console.log(`📊 Environment Variable: ${process.env.MCP_HTTP_BRIDGE_ENABLED || 'not set'}\n`);

  // Test 2: Check template selection for Brave
  const braveTemplate = getTemplateForDeployment('brave');
  console.log(`🔍 Brave Template Selected:`);
  console.log(`   Template Found: ${braveTemplate ? 'Yes' : 'No'}`);
  if (braveTemplate) {
    console.log(`   Image: ${braveTemplate.image}`);
    console.log(`   Slug: ${braveTemplate.slug}`);
    console.log(`   Is HTTP Bridge: ${isHttpBridgeTemplate(braveTemplate)}`);
    console.log(`   Ports: ${braveTemplate.ports?.join(', ') || 'None'}`);
    console.log(`   Health Check: ${braveTemplate.healthcheck ? 'Configured' : 'None'}`);
  }
  console.log('');

  // Test 3: Check template selection with force HTTP bridge
  const braveTemplateForced = getTemplateForDeployment('brave', true);
  console.log(`🔍 Brave Template (Forced HTTP Bridge):`);
  console.log(`   Template Found: ${braveTemplateForced ? 'Yes' : 'No'}`);
  if (braveTemplateForced) {
    console.log(`   Image: ${braveTemplateForced.image}`);
    console.log(`   Is HTTP Bridge: ${isHttpBridgeTemplate(braveTemplateForced)}`);
  }
  console.log('');

  // Test 4: Check template selection with force legacy
  const braveTemplateLegacy = getTemplateForDeployment('brave', false);
  console.log(`🔍 Brave Template (Forced Legacy):`);
  console.log(`   Template Found: ${braveTemplateLegacy ? 'Yes' : 'No'}`);
  if (braveTemplateLegacy) {
    console.log(`   Image: ${braveTemplateLegacy.image}`);
    console.log(`   Is HTTP Bridge: ${isHttpBridgeTemplate(braveTemplateLegacy)}`);
  }
  console.log('');

  // Test 5: Summary
  console.log('📋 Configuration Summary:');
  if (httpBridgeEnabled && braveTemplate && isHttpBridgeTemplate(braveTemplate)) {
    console.log('   ✅ HTTP Bridge is properly configured');
    console.log('   ✅ Brave template will use HTTP bridge');
    console.log('   ✅ New deployments will use HTTP bridge architecture');
  } else {
    console.log('   ⚠️  HTTP Bridge configuration issues detected:');
    if (!httpBridgeEnabled) {
      console.log('      - HTTP Bridge feature flag is disabled');
    }
    if (!braveTemplate) {
      console.log('      - Brave template not found');
    } else if (!isHttpBridgeTemplate(braveTemplate)) {
      console.log('      - Brave template is not configured for HTTP bridge');
    }
  }
}

if (require.main === module) {
  testHttpBridgeConfig();
}

export { testHttpBridgeConfig };