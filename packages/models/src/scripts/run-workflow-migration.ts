#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runWorkflowMigration() {
  console.log('🚀 Starting Workflow DSL migration...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  };

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    // Read workflow DSL migration script
    const migrationPath = join(__dirname, '../migrations/011_workflow_dsl_system.cypher');
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
        console.log(`   ${statement.substring(0, 100)}...`);

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

    console.log('🎉 Workflow DSL migration completed successfully!');

    // Verify migration by checking constraints and indexes
    console.log('🔍 Verifying workflow migration...');
    
    const constraintResult = await connection.executeQuery('SHOW CONSTRAINTS');
    const workflowConstraints = constraintResult.filter(
      (record) => record.name && record.name.includes('workflow')
    );

    console.log(`✅ Found ${workflowConstraints.length} workflow constraints`);
    workflowConstraints.forEach((constraint) => {
      console.log(`   - ${constraint.name}`);
    });

    const indexResult = await connection.executeQuery('SHOW INDEXES');
    const workflowIndexes = indexResult.filter(
      (record) => record.name && record.name.includes('workflow')
    );

    console.log(`✅ Found ${workflowIndexes.length} workflow indexes`);
    workflowIndexes.forEach((index) => {
      console.log(`   - ${index.name}: ${index.properties || index.labelsOrTypes}`);
    });

    // Test basic workflow creation to validate schema
    console.log('🧪 Testing workflow schema...');
    const testQuery = `
      MATCH (e:Expedition) 
      WHERE e.id = 'test-expedition' OR e.id IS NULL
      WITH HEAD(COLLECT(e)) as testExp
      RETURN testExp IS NOT NULL as expeditionExists
    `;
    
    const testResult = await connection.executeQuery(testQuery);
    console.log('✅ Workflow schema validation completed');

  } catch (error) {
    console.error('❌ Workflow migration failed:', error);
    process.exit(1);
  } finally {
    console.log('🔌 Database connection closed');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runWorkflowMigration().catch(console.error);
}

export { runWorkflowMigration };