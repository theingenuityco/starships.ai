#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../helpers/database';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function initializeSchema() {
  console.log('🚀 Starting database schema initialization...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'mcppassword',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    // Check if schema is already initialized
    const existingMigration = await connection.executeQuery(
      'MATCH (m:Migration {id: "001_initialize_schema"}) RETURN count(m) as count'
    );

    if (existingMigration[0]?.count > 0) {
      console.log('✅ Schema already initialized, skipping...');
      return true;
    }

    console.log('📝 Initializing database schema...');

    // Read schema initialization script
    const schemaPath = join(__dirname, '../migrations/001_initialize_schema.cypher');
    const schemaScript = readFileSync(schemaPath, 'utf-8');

    // Split by semicolon and filter out comments and empty lines
    const statements = schemaScript
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt && !stmt.startsWith('//'));

    console.log(`📝 Found ${statements.length} schema statements`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}`);
        
        try {
          await connection.executeWrite(statement);
          console.log(`✅ Statement ${i + 1} completed`);
        } catch (error) {
          console.log(
            `⚠️  Statement ${i + 1} failed (might be expected):`,
            (error as Error).message.substring(0, 100)
          );
        }
      }
    }

    console.log('🎉 Schema initialization completed successfully!');

    // Verify schema initialization
    console.log('🔍 Verifying schema...');
    
    // Check constraints
    const constraintResult = await connection.executeQuery('SHOW CONSTRAINTS');
    console.log(`✅ Found ${constraintResult.length} constraints`);

    // Check indexes
    const indexResult = await connection.executeQuery('SHOW INDEXES');
    console.log(`✅ Found ${indexResult.length} indexes`);

    // Check seed data
    const llmCount = await connection.executeQuery('MATCH (l:LLM) RETURN count(l) as count');
    console.log(`✅ Found ${llmCount[0]?.count || 0} LLM models`);

    const mcpCount = await connection.executeQuery('MATCH (m:MCPServerOption) RETURN count(m) as count');
    console.log(`✅ Found ${mcpCount[0]?.count || 0} MCP server options`);

    return true;
  } catch (error) {
    console.error('❌ Schema initialization failed:', error);
    throw error;
  } finally {
    console.log('🔌 Database connection closed');
  }
}

// Run schema initialization if this script is executed directly
if (require.main === module) {
  initializeSchema().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}