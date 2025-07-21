"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = globalSetup;
const neo4j_testcontainer_1 = require("./neo4j-testcontainer");
async function globalSetup() {
    // Start Neo4j container for integration tests
    const config = await neo4j_testcontainer_1.Neo4jTestContainer.start();
    // Store config for tests to use
    process.env.NEO4J_TEST_URI = config.uri;
    process.env.NEO4J_TEST_USERNAME = config.username;
    process.env.NEO4J_TEST_PASSWORD = config.[DEFAULT-PASSWORD];
    process.env.NEO4J_TEST_DATABASE = config.database;
}
//# sourceMappingURL=neo4j-setup.js.map