#!/usr/bin/env tsx

import { createConnection, Neo4jConfig } from '../connection';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runStripeWebhookIdempotencyMigrations() {
  console.log('🚀 Starting Stripe webhook idempotency migrations...');

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

    // List of migration files to run
    const migrations = [
      '012_add_stripe_customer_to_starship.cypher',
      '013_stripe_event_idempotency.cypher'
    ];

    for (const migrationFile of migrations) {
      console.log(`\n📝 Running migration: ${migrationFile}`);
      
      const migrationPath = join(__dirname, '../migrations', migrationFile);
      const migrationScript = readFileSync(migrationPath, 'utf-8');

      // Split by semicolon (or double newline for statements without semicolons)
      // and filter out comments and empty lines
      const rawStatements = migrationScript
        .split(/;|\n\n/)
        .map((stmt) => stmt.trim())
        .filter((stmt) => {
          // Remove comment lines
          const lines = stmt.split('\n').filter(line => !line.trim().startsWith('//'));
          const cleanedStmt = lines.join('\n').trim();
          return cleanedStmt.length > 0;
        });

      // Further clean up the statements
      const statements = rawStatements.map(stmt => {
        // Remove inline comments
        const lines = stmt.split('\n').filter(line => !line.trim().startsWith('//'));
        return lines.join('\n').trim();
      }).filter(stmt => stmt.length > 0);

      console.log(`   Found ${statements.length} statements`);

      // Execute each statement
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement) {
          try {
            await connection.executeWrite(statement);
            console.log(`   ✅ Statement ${i + 1} completed`);
          } catch (error) {
            // Check if it's an "already exists" error
            const errorMsg = (error as Error).message;
            if (errorMsg.includes('already exists') || errorMsg.includes('An equivalent')) {
              console.log(`   ⚠️  Statement ${i + 1} skipped (already exists)`);
            } else {
              console.error(`   ❌ Statement ${i + 1} failed:`, errorMsg);
              throw error;
            }
          }
        }
      }
      
      console.log(`✅ Migration ${migrationFile} completed`);
    }

    console.log('\n🎉 All Stripe webhook idempotency migrations completed successfully!');

    // Verify migrations
    console.log('\n🔍 Verifying migrations...');
    
    // Check for StripeEvent constraint
    const constraints = await connection.executeQuery('SHOW CONSTRAINTS');
    const stripeEventConstraint = constraints.find(
      (c: any) => c.name === 'stripe_event_unique'
    );
    console.log(stripeEventConstraint 
      ? '✅ StripeEvent constraint exists' 
      : '❌ StripeEvent constraint missing');

    // Check for indexes
    const indexes = await connection.executeQuery('SHOW INDEXES');
    const requiredIndexes = [
      'starship_stripe_customer',
      'stripe_event_processed',
      'stripe_event_type'
    ];
    
    requiredIndexes.forEach(indexName => {
      const indexExists = indexes.some((idx: any) => idx.name === indexName);
      console.log(indexExists 
        ? `✅ Index ${indexName} exists` 
        : `❌ Index ${indexName} missing`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    console.log('\n🔌 Database connection closed');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runStripeWebhookIdempotencyMigrations().catch(console.error);
}

export { runStripeWebhookIdempotencyMigrations };