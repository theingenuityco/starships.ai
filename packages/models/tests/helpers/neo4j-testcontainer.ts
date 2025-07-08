import { Neo4jContainer } from '@testcontainers/neo4j';

export class Neo4jTestContainer {
  private static container: Neo4jContainer;
  private static startedContainer: any;
  
  static async start() {
    this.container = new Neo4jContainer('neo4j:latest')
      .withPassword('testpassword')
      .withExposedPorts(7687);
    
    this.startedContainer = await this.container.start();
    
    return {
      uri: this.startedContainer.getBoltUri(),
      username: 'neo4j',
      password: 'testpassword',
      database: 'neo4j'
    };
  }
  
  static async stop() {
    if (this.startedContainer) {
      await this.startedContainer.stop();
    }
  }
}