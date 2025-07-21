"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="jest" />
const neo4j_testcontainer_1 = require("./helpers/neo4j-testcontainer");
const connection_1 = require("../src/connection");
let testConnection;
beforeAll(async () => {
    const config = await neo4j_testcontainer_1.Neo4jTestContainer.start();
    testConnection = (0, connection_1.createConnection)(config);
    await testConnection.connect();
    await testConnection.initializeSchema();
});
afterAll(async () => {
    await testConnection?.disconnect();
    await neo4j_testcontainer_1.Neo4jTestContainer.stop();
});
afterEach(async () => {
    // Clean slate for each test
    await testConnection.executeWrite('MATCH (n) DETACH DELETE n');
});
//# sourceMappingURL=integration-setup.js.map