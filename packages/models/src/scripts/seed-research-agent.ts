#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { createConnection, Neo4jConfig } from '../helpers/database';
import { AgentTemplateRepository } from '../repositories/AgentTemplateRepository';
import { ToolTemplateRepository } from '../repositories/ToolTemplateRepository';
import { researchTemplate } from '../seeders/agents/research';
import { wikipediaToolTemplate } from '../seeders/tools/wikipedia';

/**
 * Seed Research Agent and Wikipedia Tool to database
 */
async function seedResearchAgent() {
  console.log('🔬 Seeding Research Agent and Wikipedia Tool...\n');
  
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
    // Seed Wikipedia Tool
    console.log('📚 Creating Wikipedia tool template...');
    const existingTool = await toolRepo.findBySlug('wikipedia-search');
    
    if (existingTool) {
      console.log('  ✓ Wikipedia tool already exists');
    } else {
      const tool = await toolRepo.create(wikipediaToolTemplate);
      console.log('  ✓ Wikipedia tool created:', tool.id);
    }
    
    // Seed Research Agent
    console.log('\n🔬 Creating Research agent template...');
    const existingAgent = await agentRepo.findBySlug('research-assistant');
    
    if (existingAgent) {
      console.log('  ✓ Research agent already exists');
    } else {
      const agent = await agentRepo.create(researchTemplate);
      console.log('  ✓ Research agent created:', agent.id);
    }
    
    console.log('\n✅ Seeding completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  } finally {
    await conn.disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  seedResearchAgent()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedResearchAgent };