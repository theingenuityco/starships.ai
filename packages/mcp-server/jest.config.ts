import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@starships/agent-engine$": "<rootDir>/tests/mocks/@starships/agent-engine.ts",
  },
  clearMocks: true,
  coverageDirectory: "coverage",
};

export default config; 