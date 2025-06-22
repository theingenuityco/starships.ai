import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@starships/agent-engine$": "<rootDir>/tests/mocks/@starships/agent-engine.ts",
    "^@starships/neo4j-models$": "<rootDir>/tests/mocks/@starships/neo4j-models.ts",
    "^@starships/protocol$": "<rootDir>/tests/mocks/@starships/protocol.ts",
  },
  clearMocks: true,
  coverageDirectory: "coverage",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"]
};

export default config; 