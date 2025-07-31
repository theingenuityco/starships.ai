#!/usr/bin/env tsx

import { RepositoryFactory, MCPServerConnectorRepository } from '../repositories';
import { createConnection } from '../connection';

async function clearErrorMessage() {
  const connection = createConnection({
    uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });

  await connection.connect();
  await RepositoryFactory.initialize();

  const repo = new MCPServerConnectorRepository();
  await repo.update('9c3510a5-014e-41e2-83ef-12d9721535f6', { errorMessage: undefined });
  console.log('✅ Cleared error message');

  await connection.disconnect();
}

clearErrorMessage().catch(console.error);