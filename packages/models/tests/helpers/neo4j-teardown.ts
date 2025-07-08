import { Neo4jTestContainer } from './neo4j-testcontainer';

export default async function globalTeardown() {
  // Stop Neo4j container after all tests
  await Neo4jTestContainer.stop();
}