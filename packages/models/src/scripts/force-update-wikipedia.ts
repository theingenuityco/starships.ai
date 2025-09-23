#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { createConnection, Neo4jConfig } from '../helpers/database';
import { wikipediaTool } from '../seeders/tools/wikipedia';

async function forceUpdateWikipedia() {
  console.log('🔧 Force updating Wikipedia tool in database...\n');
  
  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI!,
    username: process.env.NEO4J_USERNAME!,
    password: process.env.NEO4J_PASSWORD!,
    database: process.env.NEO4J_DATABASE,
  };

  const conn = createConnection(config);
  await conn.connect();
  
  try {
    // First, delete existing Wikipedia tool template and instances
    console.log('🗑️ Deleting existing Wikipedia tools...');
    
    const deleteQuery = `
      MATCH (tt:ToolTemplate {slug: 'wikipedia-search'})
      DETACH DELETE tt
      RETURN COUNT(tt) as deleted
    `;
    
    const deleteResult = await conn.executeWrite<{ deleted: number }>(deleteQuery, {});
    console.log(`Deleted ${deleteResult[0]?.deleted || 0} tool template(s)`);
    
    // Delete tool instances too
    const deleteInstancesQuery = `
      MATCH (t:Tool {slug: 'wikipedia-search'})
      DETACH DELETE t
      RETURN COUNT(t) as deleted
    `;
    
    const deleteInstancesResult = await conn.executeWrite<{ deleted: number }>(deleteInstancesQuery, {});
    console.log(`Deleted ${deleteInstancesResult[0]?.deleted || 0} tool instance(s)`);
    
    // Now create fresh Wikipedia tool template
    console.log('\n📚 Creating fresh Wikipedia tool template...');
    
    const createQuery = `
      CREATE (tt:ToolTemplate {
        id: randomUUID(),
        slug: 'wikipedia-search',
        name: $name,
        description: $description,
        blueprint: $blueprint,
        parameters: $parameters,
        category: 'data',
        requiresApiKey: false,
        createdAt: $timestamp,
        updatedAt: $timestamp
      })
      RETURN tt.id as id
    `;
    
    const createResult = await conn.executeWrite<{ id: string }>(createQuery, {
      name: wikipediaTool.name,
      description: wikipediaTool.description,
      blueprint: JSON.stringify(wikipediaTool.blueprint),
      parameters: JSON.stringify(wikipediaTool.parameters),
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Created new tool template with ID: ${createResult[0]?.id}`);
    
    // Now update the Research Agent template to ensure it has the tool assigned
    console.log('\n🔬 Updating Research Agent template with tool assignment...');
    
    const updateAgentQuery = `
      MATCH (at:AgentTemplate {slug: 'research-assistant'})
      SET at.assignedToolSlugs = ['wikipedia-search']
      RETURN at.name as name
    `;
    
    const updateAgentResult = await conn.executeWrite<{ name: string }>(updateAgentQuery, {});
    console.log(`✅ Updated agent template: ${updateAgentResult[0]?.name || 'Research Assistant'}`);
    
    console.log('\n🎉 Complete! Please:');
    console.log('1. Remove the existing Research Agent from your crew');
    console.log('2. Add a new Research Agent from templates');
    console.log('3. Test with a Wikipedia query');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await conn.disconnect();
  }
}

forceUpdateWikipedia().catch(console.error);