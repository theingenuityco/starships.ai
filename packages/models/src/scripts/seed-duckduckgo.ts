#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { createConnection, Neo4jConfig } from '../helpers/database';
import { AgentTemplateRepository } from '../repositories/AgentTemplateRepository';
import { ToolTemplateRepository } from '../repositories/ToolTemplateRepository';
import { researchTemplate } from '../seeders/agents/research';
import { duckduckgoToolTemplate } from '../seeders/tools/duckduckgo';

/**
 * Seed DuckDuckGo Tool and update Research Agent
 */
async function seedDuckDuckGo() {
  console.log('🦆 Seeding DuckDuckGo Tool and updating Research Agent...\n');
  
  // Validate required environment variables
  if (!process.env.NEO4J_URI || !process.env.NEO4J_USERNAME || !process.env.NEO4J_PASSWORD) {
    console.error('❌ Missing required Neo4j environment variables');
    console.error('Please set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD');
    process.exit(1);
  }

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD,
    database: process.env.NEO4J_DATABASE,
  };

  const conn = createConnection(config);
  await conn.connect();
  const agentRepo = new AgentTemplateRepository(conn);
  const toolRepo = new ToolTemplateRepository(conn);
  
  try {
    // Seed DuckDuckGo Tool
    console.log('🔍 Creating DuckDuckGo tool template...');
    const existingTool = await toolRepo.findBySlug('duckduckgo-instant');
    
    let toolId;
    if (existingTool) {
      console.log('  ✓ DuckDuckGo tool already exists, updating...');
      await toolRepo.update(existingTool.id, duckduckgoToolTemplate);
      toolId = existingTool.id;
    } else {
      const tool = await toolRepo.create(duckduckgoToolTemplate);
      toolId = tool.id;
      console.log('  ✓ DuckDuckGo tool created:', toolId);
    }
    
    // Update Research Agent to include both tools
    console.log('\n🔬 Updating Research agent with dual-tool capability...');
    const existingAgent = await agentRepo.findBySlug('research-assistant');
    
    if (existingAgent) {
      await agentRepo.update(existingAgent.id, {
        ...researchTemplate,
        assignedToolSlugs: ['wikipedia-search', 'duckduckgo-instant']
      });
      console.log('  ✓ Research agent updated with DuckDuckGo tool');
    } else {
      console.log('  ⚠️ Research agent not found - please run seed:research first');
    }
    
    console.log('\n✅ DuckDuckGo integration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  } finally {
    await conn.disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  seedDuckDuckGo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedDuckDuckGo };