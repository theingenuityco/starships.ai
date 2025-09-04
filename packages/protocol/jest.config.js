// Simple config using shared preset
const baseConfig = require('../../jest.preset.js');

module.exports = {
  ...baseConfig,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
};