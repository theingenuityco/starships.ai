#!/usr/bin/env tsx

import { createConnection } from '../helpers/database/postgres-connection';
import { getEnvConfig } from '@starships/env';
import fs from 'fs';
import path from 'path';

async function runOAuthMigration() {
  console.log('🔄 Running OAuth migration...');
  
  const env = getEnvConfig();
  
  // Initialize database connection
  const connection = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });

  try {
    await connection.connect();
    console.log('✅ Connected to PostgreSQL');

    // Read migration file
    const migrationPath = path.join(__dirname, '../../migrations/001_oauth_accounts.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Executing OAuth migration...');
    
    // Split migration into statements and execute
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await connection.query(statement + ';');
      }
    }

    console.log('✅ OAuth migration completed successfully!');
    
    // Verify tables exist
    const result = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'oauth_accounts'
    `);
    
    if (result.length > 0) {
      console.log('✅ oauth_accounts table verified');
    } else {
      console.log('❌ oauth_accounts table not found');
    }

  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('⚠️  Tables already exist, migration may have been run before');
    } else {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  } finally {
    await connection.disconnect();
    console.log('👋 Database connection closed');
  }
}

// Run migration
runOAuthMigration().catch(console.error);