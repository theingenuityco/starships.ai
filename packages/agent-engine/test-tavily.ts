/**
 * Test Tavily Integration
 * 
 * Usage:
 * 1. Get free API key from https://tavily.com
 * 2. Set TAVILY_API_KEY environment variable
 * 3. Run: pnpm tsx test-tavily.ts
 */

import { DynamicTool } from '@langchain/core/tools';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../.env' });
dotenv.config({ path: '../../.env.tavily' });

// Test with your API key for a specific starship
const TEST_STARSHIP_ID = 'starship-test-123';
process.env[`TAVILY_API_KEY_${TEST_STARSHIP_ID}`] = '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';

async function testTavilyDirect() {
  console.log('🧪 Testing Tavily Direct Integration\n');
  console.log(`🚀 Testing with starship: ${TEST_STARSHIP_ID}\n`);
  
  // Use the starship-specific key
  const apiKey = process.env[`TAVILY_API_KEY_${TEST_STARSHIP_ID}`];
  
  if (!apiKey) {
    console.error('❌ TAVILY_API_KEY not set!');
    console.log('Get your free key at: https://tavily.com');
    process.exit(1);
  }
  
  try {
    // Create Tavily tool with the starship-specific API key
    const tavilyTool = new TavilySearchResults({
      apiKey: apiKey,
      maxResults: 3
    });
    
    // Test search
    console.log('🔍 Searching for: "latest AI news 2024"');
    const result = await tavilyTool.invoke('latest AI news 2024');
    
    console.log('\n✅ Search Results:');
    console.log(JSON.stringify(result, null, 2));
    
    // Simulate multi-user scenario
    console.log('\n🧪 Testing Multi-User Scenario:');
    
    const user1Key = process.env.TAVILY_API_KEY_user1 || process.env.TAVILY_API_KEY;
    const user2Key = process.env.TAVILY_API_KEY_user2 || process.env.TAVILY_API_KEY;
    
    // User 1's tool
    const user1Tool = new DynamicTool({
      name: 'web_search_user1',
      description: 'User 1 search',
      func: async (input: string) => {
        const tool = new TavilySearchResults({ apiKey: user1Key });
        return tool.invoke(input);
      }
    });
    
    // User 2's tool
    const user2Tool = new DynamicTool({
      name: 'web_search_user2',
      description: 'User 2 search',
      func: async (input: string) => {
        const tool = new TavilySearchResults({ apiKey: user2Key });
        return tool.invoke(input);
      }
    });
    
    console.log('User 1 searching...');
    await user1Tool.invoke('SpaceX news');
    console.log('✅ User 1 search completed');
    
    console.log('User 2 searching...');
    await user2Tool.invoke('OpenAI updates');
    console.log('✅ User 2 search completed');
    
    console.log('\n🎉 All tests passed! Tavily integration works.');
    console.log('\nNext steps:');
    console.log('1. Add UI for users to enter their Tavily API keys');
    console.log('2. Store encrypted keys in database');
    console.log('3. Load keys dynamically per starship');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
testTavilyDirect();