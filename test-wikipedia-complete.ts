#!/usr/bin/env npx tsx
import { Tool } from './packages/autopilot/src/nodes/Tool';
import { wikipediaTool } from './packages/models/src/seeders/tools/wikipedia';
import { ExecutionItemUtils } from './packages/autopilot/src/utils/ExecutionItemUtils';
import { LocalRunner } from './packages/autopilot/src/runner/LocalRunner';

async function testWikipediaTool() {
  console.log('🧪 Testing Wikipedia tool execution flow...\n');
  
  // Test 1: Direct blueprint execution
  console.log('=== TEST 1: Direct Blueprint Execution ===');
  try {
    const runner = new LocalRunner();
    const execution = ExecutionItemUtils.createExecution(
      ExecutionItemUtils.wrapSingle({
        query: "Mario",
        action: "search"
      })
    );
    
    const result = await runner.run(wikipediaTool.blueprint!, execution);
    console.log('✅ Direct execution result:', JSON.stringify(result[0]?.json, null, 2).substring(0, 500));
  } catch (error) {
    console.error('❌ Direct execution failed:', error);
  }
  
  // Test 2: Tool node execution (simulating Agent calling tool)
  console.log('\n=== TEST 2: Tool Node Execution ===');
  try {
    const toolParams = {
      ...wikipediaTool,
      arguments: JSON.stringify({
        query: "Mario",
        action: "search"
      })
    };
    
    const tool = new Tool(toolParams);
    
    // Simulate the input from Agent (Conditional node output)
    const input = ExecutionItemUtils.wrapSingle({
      result: true,
      edgeCondition: "true"
    });
    
    const result = await tool.execute(input);
    console.log('✅ Tool node result:', JSON.stringify(result[0]?.json, null, 2).substring(0, 500));
  } catch (error) {
    console.error('❌ Tool node execution failed:', error);
  }
  
  // Test 3: Check what the combine_data node actually receives
  console.log('\n=== TEST 3: Testing Metadata Flow ===');
  try {
    // Create a simplified version to test just the prepare_request -> combine_data flow
    const testBlueprint = {
      nodes: [
        { ref: 'start', type: 'start', name: 'Start', parameters: {} },
        wikipediaTool.blueprint!.nodes.find(n => n.ref === 'prepare_request')!,
        {
          ref: 'test_combine',
          type: 'code',
          name: 'Test Combine',
          parameters: {
            code: `
              console.log('[TEST] Raw input:', JSON.stringify(input));
              console.log('[TEST] Type of input:', typeof input);
              console.log('[TEST] Keys:', Object.keys(input || {}));
              
              // Try to access prepare_request output
              try {
                const prepOutput = $lastOutputOf('prepare_request');
                console.log('[TEST] $lastOutputOf success:', JSON.stringify(prepOutput));
              } catch (e) {
                console.log('[TEST] $lastOutputOf failed:', e.message);
              }
              
              return { test: 'complete', input: input };
            `
          }
        },
        { ref: 'end', type: 'end', name: 'End', parameters: {} }
      ],
      edges: [
        { ref: 'e1', from: 'start', to: 'prepare_request' },
        { ref: 'e2', from: 'prepare_request', to: 'test_combine' },
        { ref: 'e3', from: 'test_combine', to: 'end' }
      ]
    };
    
    const runner = new LocalRunner();
    const execution = ExecutionItemUtils.createExecution(
      ExecutionItemUtils.wrapSingle({
        query: "Mario",
        action: "search"
      })
    );
    
    const result = await runner.run(testBlueprint, execution);
    console.log('✅ Metadata test result:', JSON.stringify(result[0]?.json, null, 2));
  } catch (error) {
    console.error('❌ Metadata test failed:', error);
  }
}

testWikipediaTool().catch(console.error);