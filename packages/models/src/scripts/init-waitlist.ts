import { createConnection } from '../connection';
import { WaitlistRepository } from '../repositories/WaitlistRepository';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function initWaitlist() {
  console.log('Starting waitlist initialization...');

  const config = {
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  };

  console.log('Connecting with config:', {
    uri: config.uri,
    username: config.username,
    [DEFAULT-PASSWORD]: '***',
    database: config.database
  });

  const connection = createConnection(config);

  try {
    await connection.connect();
    console.log('Connected to Neo4j');

    const waitlistRepo = new WaitlistRepository(connection);

    // Initialize schema (indexes and constraints)
    console.log('Initializing waitlist schema...');
    await waitlistRepo.initializeSchema();

    // Seed initial approved emails
    console.log('Seeding initial approved emails...');
    await waitlistRepo.seedInitialEmails();

    // Verify the setup
    const count = await waitlistRepo.getApprovedCount();
    console.log(`Total approved emails: ${count}`);

    const approvedList = await waitlistRepo.getAllApproved();
    console.log('Current approved emails:');
    approvedList.forEach(entry => {
      console.log(`  - ${entry.email} (${entry.notes || 'No notes'})`);
    });

    console.log('✅ Waitlist initialization completed successfully!');
  } catch (error) {
    console.error('❌ Error initializing waitlist:', error);
    process.exit(1);
  } finally {
    await connection.disconnect();
    console.log('Disconnected from Neo4j');
  }
}

// Run the initialization
initWaitlist().catch(console.error);