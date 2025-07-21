"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="jest" />
const uuid_1 = require("uuid");
// Mock UUID for predictable IDs
jest.mock('uuid');
beforeEach(() => {
    // Reset UUID counter for each test
    let idCounter = 1;
    uuid_1.v4.mockImplementation(() => `test-uuid-${idCounter++}`);
    // Reset repository factory state
    jest.resetModules();
});
afterEach(() => {
    jest.clearAllMocks();
});
//# sourceMappingURL=setup.js.map