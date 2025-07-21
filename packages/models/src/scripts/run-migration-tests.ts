#!/usr/bin/env ts-node

/**
 * CLI script to run migration test scenarios
 *
 * Usage:
 *   npm run test:migration              # Run all scenarios
 *   npm run test:migration empty        # Run empty database test
 *   npm run test:migration single       # Run single starship test
 *   npm run test:migration large        # Run large dataset test
 *   npm run test:migration concurrent   # Run concurrent access test
 *   npm run test:migration rollback     # Run rollback test
 */

import { createConnection } from '../connection';
import { runMigrationTests, runIndividualTest } from '../migrations/test-migration-scenarios';

// Neo4j configuration for testing
const NEO4J_CONFIG = {
  uri: process.env.NEO4J_TEST_URI || process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
  username: process.env.NEO4J_TEST_USERNAME || process.env.NEO4J_USERNAME || 'neo4j',
  [DEFAULT-PASSWORD]: process.env.NEO4J_TEST_PASSWORD || process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
  database: process.env.NEO4J_TEST_DATABASE || process.env.NEO4J_DATABASE || 'neo4j',
};

async function main() {
  console.log('🔧 Initializing Neo4j connection for migration tests...');
  console.log(`📍 Connecting to: ${NEO4J_CONFIG.uri}`);

  try {
    // Initialize database connection
    const connection = createConnection(NEO4J_CONFIG);
    await connection.connect();

    console.log('✅ Database connection established');

    // Initialize schema if needed
    await connection.initializeSchema();
    console.log('✅ Database schema initialized');

    // Get command line arguments
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
      // Run all tests
      await runMigrationTests();
    } else {
      // Run individual test
      await runIndividualTest(command);
    }
  } catch (error) {
    console.error('💥 Migration test execution failed:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main();
}
