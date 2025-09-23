#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { createConnection, Neo4jConfig } from '../helpers/database';
import { wikipediaTool } from '../seeders/tools/wikipedia';

async function fixWikipediaTool() {
  console.log('🔧 Fixing Wikipedia tool blueprint...\n');
  
  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI!,
    username: process.env.NEO4J_USERNAME!,
    password: process.env.NEO4J_PASSWORD!,
    database: process.env.NEO4J_DATABASE,
  };

  const conn = createConnection(config);
  await conn.connect();
  
  try {
    // Update Wikipedia tool template
    console.log('📚 Updating Wikipedia tool template...');
    
    const templateQuery = `
      MATCH (tt:ToolTemplate {slug: 'wikipedia-search'})
      SET tt.blueprint = $blueprint
      SET tt.parameters = $parameters
      SET tt.updatedAt = $updatedAt
      RETURN COUNT(tt) as updated
    `;
    
    const templateResult = await conn.executeWrite<{ updated: number }>(templateQuery, {
      blueprint: JSON.stringify(wikipediaTool.blueprint),
      parameters: JSON.stringify(wikipediaTool.parameters),
      updatedAt: new Date().toISOString()
    });
    
    console.log(`✅ Updated ${templateResult[0]?.updated || 0} tool template(s)`);
    
    // Update all Wikipedia tool instances
    console.log('📚 Updating Wikipedia tool instances...');
    
    const instanceQuery = `
      MATCH (t:Tool {slug: 'wikipedia-search'})
      SET t.blueprint = $blueprint
      SET t.parameters = $parameters
      SET t.updatedAt = $updatedAt
      RETURN COUNT(t) as updated
    `;
    
    const instanceResult = await conn.executeWrite<{ updated: number }>(instanceQuery, {
      blueprint: JSON.stringify(wikipediaTool.blueprint),
      parameters: JSON.stringify(wikipediaTool.parameters),
      updatedAt: new Date().toISOString()
    });
    
    console.log(`✅ Updated ${instanceResult[0]?.updated || 0} tool instance(s)`);
    
    // Also update any agent-tool relationships that might cache the tool definition
    console.log('📚 Clearing any cached tool data in agent relationships...');
    
    const relationQuery = `
      MATCH (a:Agent)-[r:HAS_TOOL]->(t:Tool {slug: 'wikipedia-search'})
      REMOVE r.cachedBlueprint, r.cachedParameters
      RETURN COUNT(r) as cleared
    `;
    
    const relationResult = await conn.executeWrite<{ cleared: number }>(relationQuery, {});
    console.log(`✅ Cleared ${relationResult[0]?.cleared || 0} relationship cache(s)`);
    
  } catch (error) {
    console.error('❌ Error updating Wikipedia tool:', error);
  } finally {
    await conn.disconnect();
  }
}

fixWikipediaTool().catch(console.error);