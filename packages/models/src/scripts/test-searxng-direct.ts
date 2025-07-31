#!/usr/bin/env tsx

import fetch from 'node-fetch';

async function testSearxngDirect() {
  console.log('🔍 Testing Searxng MCP server directly...\n');
  
  const bridgeUrl = 'http://localhost:8080';
  
  try {
    // Test health endpoint
    console.log('🏥 Checking health...');
    const healthResponse = await fetch(`${bridgeUrl}/health`);
    const healthData = await healthResponse.json();
    console.log('Health status:', healthData);
    
    // Test tools endpoint
    console.log('\n📋 Getting available tools...');
    const toolsResponse = await fetch(`${bridgeUrl}/tools`);
    const toolsData = await toolsResponse.json() as any;
    console.log(`Found ${toolsData.tools?.length || 0} tools:\n`);
    
    if (toolsData.tools) {
      toolsData.tools.forEach((tool: any) => {
        console.log(`Tool: ${tool.name}`);
        console.log(`  Description: ${tool.description}`);
        console.log(`  Parameters:`, tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties) : 'None');
        console.log('');
      });
    }
    
    // Test search functionality
    console.log('🔍 Testing search functionality...');
    const searchPayload = {
      name: 'searxng_web_search',
      arguments: {
        query: 'The Ingenuity Co.',
        pageno: 1
      }
    };
    
    const searchResponse = await fetch(`${bridgeUrl}/tools/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchPayload)
    });
    
    const searchResult = await searchResponse.json();
    console.log('Search result:', JSON.stringify(searchResult, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSearxngDirect().catch(console.error);