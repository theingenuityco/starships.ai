#!/usr/bin/env ts-node

/**
 * Run Parameter Pattern Migration
 * 
 * Creates Neo4j schema for Smart Parameter Adapter pattern storage
 */

import { createConnection, Neo4jConfig } from '../connection';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  console.log('🚀 Running Parameter Pattern Migration...');
  
  try {
    // Create Neo4j connection
    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
      database: process.env.NEO4J_DATABASE || 'neo4j'
    };
    
    const connection = createConnection(config);
    
    // Ensure connection is established
    await connection.connect();
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/004-parameter-patterns.cypher');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by lines and filter out comments and empty lines
    const statements = migrationContent
      .split('\n')
      .filter(line => line.trim() && !line.trim().startsWith('//'))
      .join(' ')
      .split(';')
      .filter(stmt => stmt.trim())
      .map(stmt => stmt.trim() + ';');
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.includes('CREATE INDEX') || statement.includes('CREATE CONSTRAINT')) {
        console.log(`  ✓ Executing: ${statement.substring(0, 50)}...`);
        try {
          await connection.executeWrite(statement);
          console.log('    Success!');
        } catch (error: any) {
          if (error.message.includes('already exists')) {
            console.log('    Already exists, skipping...');
          } else {
            throw error;
          }
        }
      }
    }
    
    // Verify indexes were created
    const indexResult = await connection.executeQuery(`
      SHOW INDEXES
      WHERE labelsOrTypes = ['ParameterPattern'] OR labelsOrTypes = ['PatternFailure']
    `);
    
    console.log('\n📊 Created Indexes:');
    indexResult.forEach((record: any) => {
      const name = record.name;
      const labels = record.labelsOrTypes;
      const properties = record.properties;
      console.log(`  - ${name}: ${labels} on ${properties}`);
    });
    
    // Create sample pattern for testing
    console.log('\n🧪 Creating sample pattern for testing...');
    await connection.executeWrite(`
      MERGE (p:ParameterPattern {
        toolId: 'test_sample',
        inputHash: 'test_hash_123456'
      })
      ON CREATE SET
        p.id = randomUUID(),
        p.inputStructure = '{"test":"string"}',
        p.transformation = '{"test":"transformed"}',
        p.successCount = 1,
        p.createdAt = timestamp(),
        p.lastUsed = timestamp()
      ON MATCH SET
        p.successCount = p.successCount + 1,
        p.lastUsed = timestamp()
    `);
    
    // Verify sample was created
    const sampleResult = await connection.executeQuery(`
      MATCH (p:ParameterPattern {toolId: 'test_sample'})
      RETURN p.id as id, p.successCount as count
    `);
    
    if (sampleResult.length > 0) {
      const id = sampleResult[0].id;
      const count = sampleResult[0].count;
      console.log(`  ✓ Sample pattern created: ${id} (success count: ${count})`);
    }
    
    console.log('\n✅ Migration completed successfully!');
    
    // Close connection
    await connection.disconnect();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runMigration();
}

export { runMigration };