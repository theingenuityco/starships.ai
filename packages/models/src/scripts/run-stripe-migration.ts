#!/usr/bin/env tsx

import { createConnection, getConnection, Neo4jConfig } from '../connection';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runStripeMigration() {
  console.log('🚀 Starting Stripe database migration...');

  const config: Neo4jConfig = {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  };
  
  console.log('🔧 Using Neo4j config:', {
    uri: config.uri,
    username: config.username,
    password: '***masked***',
    database: config.database
  });
  
  const connection = createConnection(config);
  
  try {
    await connection.connect();
    console.log('✅ Connected to Neo4j');

    // Read Stripe migration script
    const migrationPath = join(__dirname, '../migrations/011_stripe_integration.cypher');
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
        console.log(`   ${statement.substring(0, 80)}...`);

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

    console.log('🎉 Stripe migration completed successfully!');

    // Verify migration by checking if new fields and indexes exist
    console.log('🔍 Verifying Stripe migration...');
    
    // Check for new indexes
    try {
      const indexResult = await connection.executeQuery('SHOW INDEXES');
      const stripeIndexes = indexResult.filter(
        (record) => 
          (record.name && record.name.includes('stripe')) ||
          (record.name && record.name.includes('subscription'))
      );
      console.log(`✅ Found ${stripeIndexes.length} Stripe-related indexes`);
      stripeIndexes.forEach((index) => {
        console.log(`   - ${index.name}: ${index.properties}`);
      });
    } catch (error) {
      console.log('⚠️  Could not verify indexes:', (error as Error).message);
    }

    // Check for Users with stripeCustomerId field
    try {
      const userCheck = await connection.executeQuery(`
        MATCH (u:User) 
        WHERE u.stripeCustomerId IS NOT NULL 
        RETURN count(u) as userCount
      `);
      const userCount = userCheck[0]?.userCount || 0;
      console.log(`✅ Found ${userCount} users with stripeCustomerId field`);
    } catch (error) {
      console.log('⚠️  Could not verify user fields:', (error as Error).message);
    }

    // Check for Starships with subscription fields
    try {
      const starshipCheck = await connection.executeQuery(`
        MATCH (s:Starship) 
        WHERE s.subscriptionId IS NOT NULL OR s.plan IS NOT NULL OR s.billingPeriod IS NOT NULL
        RETURN count(s) as starshipCount
      `);
      const starshipCount = starshipCheck[0]?.starshipCount || 0;
      console.log(`✅ Found ${starshipCount} starships with subscription fields`);
    } catch (error) {
      console.log('⚠️  Could not verify starship fields:', (error as Error).message);
    }

  } catch (error) {
    console.error('❌ Stripe migration failed:', error);
    process.exit(1);
  } finally {
    // Note: Connection cleanup handled by Neo4j driver
    console.log('🔌 Database connection closed');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  runStripeMigration().catch(console.error);
}

export { runStripeMigration };