#!/usr/bin/env tsx

import { spawn } from 'child_process';

async function testSequentialThinkingBridge() {
  console.log('🧪 Testing Sequential Thinking MCP Bridge...\n');

  // Test the HTTP bridge with sequential thinking MCP server
  console.log('🚀 Starting HTTP bridge with Sequential Thinking MCP server...');
  
  const bridgeProcess = spawn('docker', [
    'run', '--rm', '-p', '8080:8080',
    '-e', 'MCP_SERVER_CMD=npx',
    '-e', 'MCP_SERVER_ARGS=-y @modelcontextprotocol/server-sequential-thinking',
    '-e', 'LOG_LEVEL=info',
    'starships/mcp-http-bridge:latest'
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  bridgeProcess.stdout.on('data', (data) => {
    const output = data.toString();
    stdout += output;
    console.log(`[STDOUT] ${output.trim()}`);
  });

  bridgeProcess.stderr.on('data', (data) => {
    const output = data.toString();
    stderr += output;
    console.log(`[STDERR] ${output.trim()}`);
  });

  // Wait for the bridge to start up
  console.log('⏳ Waiting for bridge to initialize...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Test health endpoint
  console.log('\n🔍 Testing health endpoint...');
  try {
    const { spawn: curlSpawn } = await import('child_process');
    const curlProcess = curlSpawn('curl', ['-f', 'http://localhost:8080/health'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let curlOutput = '';
    curlProcess.stdout.on('data', (data) => {
      curlOutput += data.toString();
    });

    const curlResult = await new Promise<boolean>((resolve) => {
      curlProcess.on('exit', (code) => {
        if (code === 0) {
          console.log('✅ Health check passed!');
          console.log(`   Response: ${curlOutput.trim()}`);
          resolve(true);
        } else {
          console.log('❌ Health check failed!');
          resolve(false);
        }
      });
    });

    if (curlResult) {
      // Test tools endpoint
      console.log('\n🔧 Testing tools endpoint...');
      const toolsProcess = curlSpawn('curl', ['-f', 'http://localhost:8080/tools'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let toolsOutput = '';
      toolsProcess.stdout.on('data', (data) => {
        toolsOutput += data.toString();
      });

      await new Promise<void>((resolve) => {
        toolsProcess.on('exit', (code) => {
          if (code === 0) {
            console.log('✅ Tools endpoint responded successfully!');
            try {
              const toolsData = JSON.parse(toolsOutput);
              console.log(`   Found ${toolsData.tools ? toolsData.tools.length : 0} tools`);
              if (toolsData.tools && toolsData.tools.length > 0) {
                console.log(`   Available tools: ${toolsData.tools.map((t: any) => t.name).join(', ')}`);
              }
            } catch (e) {
              console.log(`   Raw response: ${toolsOutput.trim()}`);
            }
          } else {
            console.log('❌ Tools endpoint failed!');
          }
          resolve();
        });
      });
    }

  } catch (error) {
    console.log('❌ Failed to test endpoints:', error);
  }

  // Clean up
  console.log('\n🧹 Cleaning up...');
  bridgeProcess.kill('SIGTERM');
  
  await new Promise<void>((resolve) => {
    bridgeProcess.on('exit', () => {
      console.log('✅ Bridge process terminated');
      resolve();
    });
    
    // Force kill after 5 seconds
    setTimeout(() => {
      bridgeProcess.kill('SIGKILL');
      resolve();
    }, 5000);
  });

  console.log('\n📊 Test Summary:');
  console.log('   Docker image: starships/mcp-http-bridge:latest');
  console.log('   MCP Server: @modelcontextprotocol/server-sequential-thinking');
  console.log('   Protocol: HTTP Bridge');
  console.log('   Status: Test completed');
  
  return true;
}

if (require.main === module) {
  testSequentialThinkingBridge().catch(console.error);
}

export { testSequentialThinkingBridge };