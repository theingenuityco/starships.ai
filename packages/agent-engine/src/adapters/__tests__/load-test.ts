#!/usr/bin/env ts-node

/**
 * Load Testing Script for Smart Parameter Adapter
 * 
 * Tests performance under high concurrency and validates caching behavior
 */

import { SmartParameterAdapter } from '../SmartParameterAdapter';
import { createConnection, Neo4jConfig } from '@starships/models';
import { MCPTool } from '@starships/core';

// Test configuration
const CONCURRENT_REQUESTS = 100;
const ITERATIONS_PER_REQUEST = 10;
const TARGET_RESPONSE_TIME_MS = 10; // Target <10ms for cached patterns

// Sample tools for testing
const testTools: MCPTool[] = [
  {
    name: 'API-post-page',
    templateSlug: 'notion',
    connectorId: 'notion-test',
    description: 'Create Notion page',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'object' },
        properties: { type: 'object' },
        children: { type: 'array' }
      }
    }
  },
  {
    name: 'create-issue',
    templateSlug: 'github',
    connectorId: 'github-test',
    description: 'Create GitHub issue',
    inputSchema: {
      type: 'object',
      properties: {
        issue: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' }
          }
        }
      }
    }
  },
  {
    name: 'search',
    templateSlug: 'brave',
    connectorId: 'brave-test',
    description: 'Search the web',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    }
  }
];

// Sample inputs for testing
const testInputs = [
  // Notion patterns
  { paragraph: { text: 'Test content' } },
  { properties: { title: 'Test Page' } },
  { children: [{ paragraph: { text: 'Child content' } }] },
  
  // GitHub patterns
  { title: 'Bug Report', body: 'Description' },
  { subject: 'Feature Request', content: 'Details' },
  
  // Search patterns
  'What is TypeScript?',
  { input: 'How to use React?' },
  { query: 'Node.js tutorial' }
];

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  cacheHitRate: number;
  heuristicHitRate: number;
  throughput: number;
}

async function runLoadTest(): Promise<LoadTestResult> {
  console.log('🚀 Starting Smart Parameter Adapter Load Test');
  console.log(`   Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`   Iterations per Request: ${ITERATIONS_PER_REQUEST}`);
  console.log(`   Total Operations: ${CONCURRENT_REQUESTS * ITERATIONS_PER_REQUEST}\n`);

  // Initialize connection
  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'mcppassword',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  };

  const connection = createConnection(config);
  await connection.connect();

  // Initialize adapter
  const adapter = new SmartParameterAdapter(connection);

  // Warm up the adapter with a few requests
  console.log('⏳ Warming up adapter...');
  for (let i = 0; i < 5; i++) {
    const tool = testTools[i % testTools.length];
    const input = testInputs[i % testInputs.length];
    await adapter.adapt(input, tool);
  }

  // Metrics collection
  const responseTimes: number[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Function to run a single test iteration
  const runTestIteration = async (workerId: number): Promise<void> => {
    for (let i = 0; i < ITERATIONS_PER_REQUEST; i++) {
      const tool = testTools[Math.floor(Math.random() * testTools.length)];
      const input = testInputs[Math.floor(Math.random() * testInputs.length)];
      
      const startTime = Date.now();
      
      try {
        const result = await adapter.adapt(input, tool);
        const responseTime = Date.now() - startTime;
        
        responseTimes.push(responseTime);
        successCount++;
        
        if (responseTime > TARGET_RESPONSE_TIME_MS && i > 0) {
          console.warn(`⚠️  Worker ${workerId}: Slow response ${responseTime}ms for ${tool.name}`);
        }
      } catch (error) {
        failureCount++;
        console.error(`❌ Worker ${workerId}: Failed - ${error}`);
      }
    }
  };

  // Run concurrent load test
  console.log('\n📊 Running load test...');
  const testStartTime = Date.now();
  
  const workers = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    workers.push(runTestIteration(i));
  }
  
  await Promise.all(workers);
  
  const totalTestTime = Date.now() - testStartTime;

  // Calculate statistics
  responseTimes.sort((a, b) => a - b);
  
  const stats = adapter.getStats();
  
  const result: LoadTestResult = {
    totalRequests: successCount + failureCount,
    successfulRequests: successCount,
    failedRequests: failureCount,
    averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
    minResponseTime: responseTimes[0],
    maxResponseTime: responseTimes[responseTimes.length - 1],
    p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)],
    p99ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.99)],
    cacheHitRate: parseFloat(stats.cacheHitRate),
    heuristicHitRate: parseFloat(stats.heuristicHitRate),
    throughput: (successCount / totalTestTime) * 1000 // requests per second
  };

  // Clean up
  await connection.disconnect();

  return result;
}

async function printResults(results: LoadTestResult) {
  console.log('\n📈 Load Test Results:');
  console.log('═══════════════════════════════════════════════════');
  
  console.log('\n📊 Request Statistics:');
  console.log(`   Total Requests: ${results.totalRequests}`);
  console.log(`   Successful: ${results.successfulRequests} (${((results.successfulRequests / results.totalRequests) * 100).toFixed(2)}%)`);
  console.log(`   Failed: ${results.failedRequests}`);
  
  console.log('\n⏱️  Response Times:');
  console.log(`   Average: ${results.averageResponseTime.toFixed(2)}ms`);
  console.log(`   Min: ${results.minResponseTime}ms`);
  console.log(`   Max: ${results.maxResponseTime}ms`);
  console.log(`   P95: ${results.p95ResponseTime}ms`);
  console.log(`   P99: ${results.p99ResponseTime}ms`);
  
  console.log('\n💾 Cache Performance:');
  console.log(`   Cache Hit Rate: ${results.cacheHitRate}%`);
  console.log(`   Heuristic Hit Rate: ${results.heuristicHitRate}%`);
  
  console.log('\n🚀 Throughput:');
  console.log(`   ${results.throughput.toFixed(2)} requests/second`);
  
  console.log('\n✅ Performance Targets:');
  const meetsTarget = results.p95ResponseTime <= TARGET_RESPONSE_TIME_MS;
  console.log(`   P95 < ${TARGET_RESPONSE_TIME_MS}ms: ${meetsTarget ? '✅ PASS' : '❌ FAIL'}`);
  
  if (results.averageResponseTime <= TARGET_RESPONSE_TIME_MS) {
    console.log(`   Average < ${TARGET_RESPONSE_TIME_MS}ms: ✅ PASS`);
  } else {
    console.log(`   Average < ${TARGET_RESPONSE_TIME_MS}ms: ❌ FAIL`);
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  
  // Overall assessment
  if (results.failedRequests === 0 && meetsTarget) {
    console.log('\n🎉 Load test PASSED! The adapter meets all performance requirements.');
  } else if (results.failedRequests > 0) {
    console.log('\n⚠️  Load test completed with failures. Investigation needed.');
  } else {
    console.log('\n⚠️  Load test completed but performance targets not met.');
  }
}

// Main execution
if (require.main === module) {
  runLoadTest()
    .then(printResults)
    .catch(error => {
      console.error('❌ Load test failed:', error);
      process.exit(1);
    });
}

export { runLoadTest, LoadTestResult };