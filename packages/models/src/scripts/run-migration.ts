#!/usr/bin/env node

/**
 * Simple script to run a specific migration
 * Usage: tsx src/scripts/run-migration.ts <migration-id>
 */

import { createConnection } from '@/helpers/database';
import { getEnvConfig } from '@starships/env';
import { migrationRunner } from './migration-runner';

async function main() {
  const migrationId = process.argv[2];

  if (!migrationId) {
    console.error('❌ Migration ID required');
    console.log('Usage: tsx src/scripts/run-migration.ts <migration-id>');
    process.exit(1);
  }

  try {
    // Get database config from environment
    const config = getEnvConfig();
    
    // Create and connect to database
    const dbConnection = createConnection({
      host: config.POSTGRES_HOST,
      port: config.POSTGRES_PORT,
      user: config.POSTGRES_USER,
      password: config.POSTGRES_PASSWORD,
      database: config.POSTGRES_DATABASE,
      ssl: config.POSTGRES_SSL,
    });

    await dbConnection.connect();
    console.log('✅ Database connected');

    // Run the migration
    console.log(`🔄 Running migration: ${migrationId}...`);
    const result = await migrationRunner.runMigration(migrationId);

    if (result.success) {
      console.log(`✅ Migration ${migrationId} completed successfully in ${result.executionTime}ms`);
      if (result.warnings && result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach((w) => console.log(`  ${w}`));
      }
    } else {
      console.error(`❌ Migration ${migrationId} failed`);
      if (result.errors && result.errors.length > 0) {
        console.error('\n❌ Errors:');
        result.errors.forEach((e) => console.error(`  ${e}`));
      }
      process.exit(1);
    }

    // Disconnect
    await dbConnection.disconnect();
    console.log('✅ Database disconnected');
  } catch (error) {
    console.error('❌ Failed to run migration:', error);
    process.exit(1);
  }
}

main();

