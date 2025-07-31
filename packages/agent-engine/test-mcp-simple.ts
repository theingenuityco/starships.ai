/**
 * Simple MCP Integration Test
 * Tests the components without requiring external services
 */

import { ToolUsageAnalytics } from './src/monitoring/ToolUsageAnalytics';
import { AuditLogger } from './src/security/AuditLogger';
import { MCPPolicyEnforcer } from './src/security/MCPPolicyEnforcer';

async function runSimpleTests() {
  console.log('🧪 Testing MCP Integration Components...\n');

  // Test 1: Analytics
  console.log('1️⃣ Testing Tool Usage Analytics...');
  const analytics = new ToolUsageAnalytics();
  
  // Record some test invocations
  for (let i = 0; i < 5; i++) {
    analytics.recordInvocation({
      starshipId: 'test-ship',
      agentId: 'test-agent',
      toolName: 'memory.store',
      timestamp: new Date(),
      duration: Math.random() * 1000,
      success: Math.random() > 0.2,
      error: Math.random() > 0.8 ? 'Random error' : undefined,
      inputSize: 100,
      outputSize: 200
    });
  }

  const metrics = analytics.getToolMetrics('memory.store');
  console.log('✅ Metrics:', {
    invocations: metrics?.invocationCount,
    successRate: metrics ? (metrics.successCount / metrics.invocationCount * 100).toFixed(1) + '%' : 'N/A',
    avgLatency: metrics?.averageLatency.toFixed(0) + 'ms'
  });

  // Test 2: Audit Logging
  console.log('\n2️⃣ Testing Audit Logger...');
  const auditLogger = new AuditLogger({ enableConsole: false, enableFile: false, enableRemote: false });
  
  auditLogger.logToolInvocation(
    {
      type: 'agent',
      id: 'test-agent',
      starshipId: 'test-ship'
    },
    'sequentialthinking',
    'thinking-provider',
    { thought: 'Test thought' },
    { success: true, duration: 250 },
    {}
  );

  const events = await auditLogger.query({
    starshipId: 'test-ship'
  });
  console.log('✅ Audit events recorded:', events.length);

  // Test 3: Policy Enforcement
  console.log('\n3️⃣ Testing Policy Enforcer...');
  const policyEnforcer = new MCPPolicyEnforcer(auditLogger);
  
  await policyEnforcer.loadPolicies('test-ship');
  
  const decision = await policyEnforcer.checkAccess({
    starshipId: 'test-ship',
    agentId: 'test-agent',
    toolName: 'memory.store',
    toolProvider: 'memory',
    toolCategory: 'memory',
    parameters: { key: 'test', value: 'data' },
    environment: 'test',
    timestamp: new Date()
  });
  
  console.log('✅ Policy decision:', decision.allowed ? 'ALLOWED' : 'DENIED');

  // Test 4: Usage Patterns
  console.log('\n4️⃣ Testing Usage Pattern Analysis...');
  const patterns = analytics.getUsagePatterns();
  console.log('✅ Patterns found:', patterns.length);

  // Test 5: Performance Report
  console.log('\n5️⃣ Testing Performance Reporting...');
  const report = analytics.getPerformanceReport();
  console.log('✅ Performance report:', {
    totalInvocations: report.totalInvocations,
    successRate: (report.successRate * 100).toFixed(1) + '%',
    avgLatency: report.averageLatency.toFixed(0) + 'ms'
  });

  console.log('\n✨ All tests completed successfully!');
}

// Run tests
runSimpleTests().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});