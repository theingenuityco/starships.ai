const { migrationRunner } = require('./dist/scripts/migration-runner.js');
const { createConnection } = require('./dist/helpers/database');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '../../.env' });

async function runMigration() {
  try {
    console.log('🚀 Initializing database connection...');

    // Create database connection with environment variables
    const config = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      database: process.env.POSTGRES_DATABASE || 'starships',
      ssl: process.env.POSTGRES_SSL === 'true',
    };

    console.log(`Connecting to database: ${config.user}@${config.host}:${config.port}/${config.database}`);

    const connection = createConnection(config);
    await connection.connect();

    console.log('✅ Database connection established');

    console.log('🚀 Running migration...');
    const result = await migrationRunner.initializeSchema();

    if (result.success) {
      console.log('✅ Migration completed successfully!');
      console.log(`Execution time: ${result.executionTime}ms`);
      if (result.warnings && result.warnings.length > 0) {
        console.log('⚠️ Warnings:', result.warnings);
      }
    } else {
      console.error('❌ Migration failed!');
      console.error('Errors:', result.errors);
    }

    await connection.disconnect();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Migration runner failed:', error);
    process.exit(1);
  }
}

runMigration();
