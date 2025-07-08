/// <reference types="jest" />
import { Neo4jTestContainer } from './helpers/neo4j-testcontainer';
import { createConnection } from '../src/connection';

let testConnection: any;

beforeAll(async () => {
  const config = await Neo4jTestContainer.start();
  testConnection = createConnection(config);
  await testConnection.connect();
  await testConnection.initializeSchema();
});

afterAll(async () => {
  await testConnection?.disconnect();
  await Neo4jTestContainer.stop();
});

afterEach(async () => {
  // Clean slate for each test
  await testConnection.executeWrite('MATCH (n) DETACH DELETE n');
});