import { MCPToolGatewayDB } from '@starships/core';
import { RepositoryFactory } from '@starships/models';

async function testSequentialThinking() {
  console.log('🧪 Testing Sequential Thinking MCP Integration...\n');
  
  // Initialize repositories
  const agentRepo = RepositoryFactory.getAgentRepository();
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  
  // Find a starship with sequential thinking MCP
  const starships = await starshipRepo.findAll();
  const starshipWithMCP = starships.find(s => s.name.includes('MCP'));
  
  if (!starshipWithMCP) {
    console.error('❌ No starship with MCP found');
    return;
  }
  
  console.log(`✅ Found starship: ${starshipWithMCP.name} (${starshipWithMCP.id})`);
  
  // Get agents for this starship
  const agents = await agentRepo.findByStarship(starshipWithMCP.id);
  const firstAgent = agents[0];
  
  if (!firstAgent) {
    console.error('❌ No agent found for starship');
    return;
  }
  
  console.log(`✅ Found agent: ${firstAgent.name} (${firstAgent.id})`);
  
  // Test MCP tools availability
  const gateway = new MCPToolGatewayDB();
  const tools = await gateway.getToolsForStarship(starshipWithMCP.id);
  
  console.log(`\n📋 Available MCP tools:`);
  tools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });
  
  // Test sequential thinking tool
  const seqThinkingTool = tools.find(t => t.name.includes('sequential'));
  if (seqThinkingTool) {
    console.log(`\n🧠 Testing Sequential Thinking tool...`);
    
    try {
      const result = await gateway.invokeTool(
        starshipWithMCP.id,
        seqThinkingTool.name,
        {
          thought: "First, I need to understand the problem",
          thoughtNumber: 1,
          totalThoughts: 3,
          nextThoughtNeeded: true
        }
      );
      
      console.log('✅ Tool execution result:', result);
    } catch (error) {
      console.error('❌ Tool execution failed:', error);
    }
  } else {
    console.log('⚠️ No sequential thinking tool found');
  }
}

// Run the test
testSequentialThinking().catch(console.error);