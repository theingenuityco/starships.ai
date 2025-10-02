const { createConnection } = require('./dist/helpers/database');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '../../.env' });

async function verifyMigration() {
  try {
    console.log('🔍 Verifying migration results...');

    // Create database connection
    const config = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      database: process.env.POSTGRES_DATABASE || 'starships',
      ssl: process.env.POSTGRES_SSL === 'true',
    };

    const connection = createConnection(config);
    await connection.connect();

    console.log('✅ Connected to database');

    // Check tables
    const tables = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log(`📊 Found ${tables.length} tables:`);
    tables.forEach((table, index) => {
      console.log(`  ${index + 1}. ${table.table_name}`);
    });

    // Check indexes
    const indexes = await connection.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      ORDER BY tablename, indexname
    `);

    console.log(`🔍 Found ${indexes.length} indexes`);

    // Check migration history
    const migrations = await connection.query(`
      SELECT migration_id, name, applied_at 
      FROM migration_history 
      ORDER BY applied_at
    `);

    console.log(`📝 Migration history (${migrations.length} records):`);
    migrations.forEach((migration) => {
      console.log(`  - ${migration.migration_id}: ${migration.name} (${migration.applied_at})`);
    });

    console.log('✅ Migration verification completed successfully!');

    await connection.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration verification failed:', error);
    process.exit(1);
  }
}

verifyMigration();
