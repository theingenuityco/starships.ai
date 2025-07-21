import { Neo4jContainer, StartedNeo4jContainer } from '@testcontainers/neo4j';

export class Neo4jTestContainer {
  private static container: StartedNeo4jContainer | null = null;

  static async start(): Promise<{
    uri: string;
    username: string;
    [DEFAULT-PASSWORD]: string;
    database: string;
  }> {
    if (this.container) {
      return this.getConfig();
    }

    console.log('[NEO4J-TESTCONTAINER] Starting Neo4j test container...');
    
    this.container = await new Neo4jContainer('neo4j:5.28')
      .withAdminPassword('test[DEFAULT-PASSWORD]')
      .withApoc()
      .withStartupTimeout(120000)
      .start();

    console.log('[NEO4J-TESTCONTAINER] Neo4j test container started successfully');
    
    return this.getConfig();
  }

  static async stop(): Promise<void> {
    if (this.container) {
      console.log('[NEO4J-TESTCONTAINER] Stopping Neo4j test container...');
      await this.container.stop();
      this.container = null;
      console.log('[NEO4J-TESTCONTAINER] Neo4j test container stopped');
    }
  }

  private static getConfig() {
    if (!this.container) {
      throw new Error('Neo4j test container is not started');
    }

    return {
      uri: this.container.getBoltUri(),
      username: 'neo4j',
      [DEFAULT-PASSWORD]: 'test[DEFAULT-PASSWORD]',
      database: 'neo4j'
    };
  }

  static getContainer(): StartedNeo4jContainer | null {
    return this.container;
  }
}