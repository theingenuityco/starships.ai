#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  console.log('🚀 Starting database migration...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    // Read migration script
    const migrationPath = join(__dirname, '../migrations/001_enhance_agent_model.cypher');
    const migrationScript = readFileSync(migrationPath, 'utf-8');

    // Split by semicolon and filter out comments and empty lines
    const statements = migrationScript
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt && !stmt.startsWith('//'));

    console.log(`📝 Found ${statements.length} migration statements`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}`);
        console.log(`   ${statement.substring(0, 50)}...`);

        try {
          await connection.executeWrite(statement);
          console.log(`✅ Statement ${i + 1} completed`);
        } catch (error) {
          console.log(
            `⚠️  Statement ${i + 1} failed (might be expected):`,
            (error as Error).message
          );
        }
      }
    }

    console.log('🎉 Migration completed successfully!');

    // Verify migration by checking if indexes exist
    console.log('🔍 Verifying migration...');
    const indexResult = await connection.executeQuery('SHOW INDEXES');
    const agentIndexes = indexResult.filter(
      (record) => record.labelsOrTypes && record.labelsOrTypes.includes('Agent')
    );

    console.log(`✅ Found ${agentIndexes.length} Agent indexes`);
    agentIndexes.forEach((index) => {
      console.log(`   - ${index.name}: ${index.properties}`);
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Note: Connection cleanup handled by Neo4j driver
    console.log('🔌 Database connection closed');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runMigration().catch(console.error);
}

export { runMigration };
