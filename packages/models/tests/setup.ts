/// <reference types="jest" />
import { v4 } from 'uuid';

// Mock UUID for predictable IDs
jest.mock('uuid');

beforeEach(() => {
  // Reset UUID counter for each test
  let idCounter = 1;
  (v4 as jest.Mock).mockImplementation(() => `test-uuid-${idCounter++}`);
  
  // Reset repository factory state
  jest.resetModules();
});

afterEach(() => {
  jest.clearAllMocks();
});