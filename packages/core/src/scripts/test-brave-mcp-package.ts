#!/usr/bin/env node
/**
 * Test script to verify Brave MCP package works
 */

import { spawn } from 'child_process';

async function testBraveMcpPackage() {
  console.log('🧪 Testing Brave MCP Package...\n');

  // Test 1: Check if the package can be installed and run
  console.log('📦 Testing package installation and basic functionality...');
  
  const testProcess = spawn('npx', ['-y', 'brave-search-mcp'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BRAVE_API_KEY: 'test-key-for-validation'
    }
  });

  let stdout = '';
  let stderr = '';

  testProcess.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  testProcess.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  // Send an initialize request to test the MCP protocol
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  testProcess.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for response or timeout
  const result = await new Promise<{ success: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
    const timeout = setTimeout(() => {
      testProcess.kill();
      resolve({
        success: false,
        stdout,
        stderr,
        error: 'Process timeout after 10 seconds'
      });
    }, 10000);

    testProcess.on('exit', (code) => {
      clearTimeout(timeout);
      resolve({
        success: code === 0,
        stdout,
        stderr,
        error: code !== 0 ? `Process exited with code ${code}` : undefined
      });
    });

    // Check for specific response patterns
    testProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('"result"') && output.includes('"capabilities"')) {
        clearTimeout(timeout);
        testProcess.kill();
        resolve({
          success: true,
          stdout,
          stderr
        });
      }
    });
  });

  console.log('\n📊 Test Results:');
  console.log(`   Success: ${result.success ? '✅' : '❌'}`);
  
  if (result.success) {
    console.log('   ✅ Package can be installed and executed');
    console.log('   ✅ MCP protocol initialization works');
    console.log('   ✅ Process responds to JSON-RPC requests');
  } else {
    console.log(`   ❌ Error: ${result.error || 'Unknown error'}`);
  }

  if (result.stdout) {
    console.log('\n📤 STDOUT Output:');
    console.log(result.stdout.split('\n').slice(0, 5).join('\n')); // First 5 lines
    if (result.stdout.split('\n').length > 5) {
      console.log('   ... (truncated)');
    }
  }

  if (result.stderr) {
    console.log('\n📥 STDERR Output:');
    console.log(result.stderr.split('\n').slice(0, 5).join('\n')); // First 5 lines
    if (result.stderr.split('\n').length > 5) {
      console.log('   ... (truncated)');
    }
  }

  console.log('\n🔍 Analysis:');
  if (result.success) {
    console.log('   ✅ The new brave-search-mcp package is working correctly');
    console.log('   ✅ It should resolve the deprecated package issue');
    console.log('   ✅ HTTP bridge should be able to initialize this MCP server');
  } else {
    console.log('   ⚠️  The package may have issues or require specific configuration');
    console.log('   ⚠️  Check if BRAVE_API_KEY is properly set in production');
    if (result.stderr.includes('API') || result.stderr.includes('key')) {
      console.log('   💡 This might be an API key validation issue (expected in test)');
    }
  }

  return result.success;
}

if (require.main === module) {
  testBraveMcpPackage().catch(console.error);
}

export { testBraveMcpPackage };