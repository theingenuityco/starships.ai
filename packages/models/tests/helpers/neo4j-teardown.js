"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = globalTeardown;
const neo4j_testcontainer_1 = require("./neo4j-testcontainer");
async function globalTeardown() {
    // Stop Neo4j container after all tests
    await neo4j_testcontainer_1.Neo4jTestContainer.stop();
}
//# sourceMappingURL=neo4j-teardown.js.map