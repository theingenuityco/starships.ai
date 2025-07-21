"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Neo4jTestContainer = void 0;
const neo4j_1 = require("@testcontainers/neo4j");
class Neo4jTestContainer {
    static async start() {
        this.container = new neo4j_1.Neo4jContainer('neo4j:latest')
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
exports.Neo4jTestContainer = Neo4jTestContainer;
//# sourceMappingURL=neo4j-testcontainer.js.map