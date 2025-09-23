#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { createConnection, Neo4jConfig } from '../helpers/database';

/**
 * Update existing tool instances with latest template blueprints
 */
async function updateToolInstances() {
  console.log('🔧 Updating tool instances with latest template blueprints...\n');
  
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
  
  try {
    // Update all Wikipedia tool instances with the latest template blueprint
    console.log('📚 Updating Wikipedia tool instances...');
    
    const query = `
      MATCH (t:Tool {slug: 'wikipedia-search'})
      MATCH (tt:ToolTemplate {slug: 'wikipedia-search'})
      SET t.blueprint = tt.blueprint
      SET t.parameters = tt.parameters
      SET t.updatedAt = $updatedAt
      RETURN COUNT(t) as updated_tools
    `;
    
    const result = await conn.executeWrite<{ updated_tools: number }>(query, {
      updatedAt: new Date().toISOString()
    });
    const updatedCount = result[0]?.updated_tools || 0;
    
    if (updatedCount > 0) {
      console.log(`  ✓ Updated ${updatedCount} Wikipedia tool instance(s) with latest template blueprint`);
    } else {
      console.log('  ℹ No Wikipedia tool instances found to update');
    }
    
    console.log('\n✅ Tool instance update completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Update failed:', error);
    throw error;
  } finally {
    await conn.disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  updateToolInstances()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { updateToolInstances };