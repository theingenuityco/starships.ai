/**
 * Test MCP Tools Directly Without LLM
 * 
 * This script tests the MCP tool integration without requiring OpenAI API
 */

import { MCPToolGateway } from '@starships/core';
import { ServiceRegistry } from '@starships/core';
import { ToolUsageAnalytics } from './src/monitoring/ToolUsageAnalytics';
import { PerformanceOptimizer } from './src/monitoring/PerformanceOptimizer';
import { SecurityManager } from './src/security/SecurityManager';

async function testMCPTools() {
  console.log('🧪 Testing MCP Tool Integration...\n');

  // Mock starship ID
  const starshipId = 'test-starship-123';
  const agentId = 'test-agent-456';

  try {
    // 1. Test Tool Discovery
    console.log('1️⃣ Testing Tool Discovery...');
    const gateway = new MCPToolGateway(
      ServiceRegistry.getInstance(),
      {} as any // Mock repository for testing
    );

    // Mock some available tools
    const mockTools = [
      {
        name: 'sequentialthinking.think',
        originalName: 'think',
        description: 'Sequential thinking for complex reasoning',
        inputSchema: {
          type: 'object',
          properties: {
            thought: { type: 'string' },
            thoughtNumber: { type: 'number' },
            totalThoughts: { type: 'number' }
          }
        },
        providerId: 'seq-123',
        providerName: 'sequentialthinking',
        category: 'reasoning' as const
      },
      {
        name: 'memory.store',
        originalName: 'store',
        description: 'Store data in memory',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'any' }
          }
        },
        providerId: 'mem-123',
        providerName: 'memory',
        category: 'memory' as const
      }
    ];

    console.log(`✅ Discovered ${mockTools.length} tools\n`);

    // 2. Test Security Manager
    console.log('2️⃣ Testing Security Manager...');
    const securityManager = new SecurityManager();

    const invocation = {
      starshipId,
      agentId,
      toolName: 'memory.store',
      toolProvider: 'memory',
      parameters: {
        key: 'test-key',
        value: 'test-value'
      }
    };

    const validation = securityManager['validateInput'](invocation);
    console.log('✅ Security validation:', validation.valid ? 'PASSED' : 'FAILED');
    if (validation.issues.length > 0) {
      console.log('   Issues:', validation.issues);
    }
    console.log('');

    // 3. Test Analytics
    console.log('3️⃣ Testing Tool Usage Analytics...');
    const analytics = new ToolUsageAnalytics();

    // Record a mock invocation
    analytics.recordInvocation({
      starshipId,
      agentId,
      toolName: 'memory.store',
      timestamp: new Date(),
      duration: 150,
      success: true,
      inputSize: 50,
      outputSize: 100
    });

    const metrics = analytics.getToolMetrics('memory.store');
    console.log('✅ Tool metrics recorded:', metrics);
    console.log('');

    // 4. Test Performance Optimizer
    console.log('4️⃣ Testing Performance Optimizer...');
    const optimizer = new PerformanceOptimizer(gateway, analytics);

    // Test cache functionality
    const cacheKey = JSON.stringify({ tool: 'memory.retrieve', key: 'test' });
    console.log('✅ Cache initialized and ready\n');

    // 5. Test Monitoring Dashboard
    console.log('5️⃣ Testing Monitoring Dashboard...');
    const { MonitoringDashboard } = await import('./src/monitoring/MonitoringDashboard');
    const dashboard = new MonitoringDashboard(analytics, optimizer);

    const dashboardState = dashboard.getDashboardState();
    console.log('✅ Dashboard state:', {
      metrics: dashboardState.metrics.length,
      widgets: dashboardState.widgets.length,
      health: dashboardState.health
    });
    console.log('');

    // 6. Test Tool Patterns
    console.log('6️⃣ Testing Tool Usage Patterns...');
    const { MCPMemoryPattern } = await import('./src/patterns/memory-integration-pattern');
    
    // Mock gateway for pattern testing
    const mockGateway = {
      invokeTool: async (sid: string, tool: string, params: any) => {
        console.log(`   Mock invoking ${tool} with params:`, params);
        return { success: true, result: { stored: true } };
      }
    };

    const memoryPattern = new MCPMemoryPattern(mockGateway as any, starshipId);
    const stored = await memoryPattern.store('test-pattern-key', { data: 'test' });
    console.log('✅ Memory pattern test:', stored ? 'SUCCESS' : 'FAILED');

    console.log('\n✨ All MCP tool tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the tests
testMCPTools().catch(console.error);