import { Neo4jTestContainer } from './neo4j-testcontainer';

export default async function globalSetup() {
  // Start Neo4j container for integration tests
  const config = await Neo4jTestContainer.start();
  
  // Store config for tests to use
  process.env.NEO4J_TEST_URI = config.uri;
  process.env.NEO4J_TEST_USERNAME = config.username;
  process.env.NEO4J_TEST_PASSWORD = config.[DEFAULT-PASSWORD];
  process.env.NEO4J_TEST_DATABASE = config.database;
}