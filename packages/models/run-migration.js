#!/usr/bin/env node

/**
 * Run Database Migration Script
 *
 * This script runs the agent slug migration to add the slug column
 * and unique constraint to the agents table.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🔄 Running agent slug migration...');

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '001_add_agent_slug.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration using psql
    // Note: This assumes you have psql installed and configured
    // You may need to adjust the connection parameters
    const command = `psql -d starships_dev -f "${migrationPath}"`;

    console.log('📝 Executing migration:', migrationPath);
    execSync(command, { stdio: 'inherit' });

    console.log('✅ Migration completed successfully!');
    console.log('🎯 Agent slugs are now globally unique');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
runMigration();
