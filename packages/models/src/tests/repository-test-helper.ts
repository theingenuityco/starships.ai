/**
 * Comprehensive repository test helper for all repositories
 */

import { getConnection } from '@/helpers/database';

export class RepositoryTestHelper {
  public mockConnection: {
    executeQuery: jest.Mock;
    executeWrite: jest.Mock;
  };

  constructor() {
    this.mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };

    // Mock getConnection to always return our mock
    (getConnection as jest.Mock).mockReturnValue(this.mockConnection);
  }

  reset() {
    this.mockConnection.executeQuery.mockClear();
    this.mockConnection.executeWrite.mockClear();
    this.mockConnection.executeQuery.mockResolvedValue([]);
    this.mockConnection.executeWrite.mockResolvedValue([]);
  }

  // Mock patterns for different repository operations
  mockFindQuery(data: unknown, alias: string = 'n') {
    if (Array.isArray(data)) {
      this.mockConnection.executeQuery.mockResolvedValue(data.map((item) => ({ [alias]: item })));
    } else if (data) {
      this.mockConnection.executeQuery.mockResolvedValue([{ [alias]: data }]);
    } else {
      this.mockConnection.executeQuery.mockResolvedValue([]);
    }
  }

  mockCreateWrite(data: unknown) {
    // Mock for createEntityWithAutoId pattern
    this.mockConnection.executeWrite.mockResolvedValue([{ n: data }]);
  }

  mockMergeWrite(data: unknown) {
    // Mock for mergeEntityWithAutoId pattern
    this.mockConnection.executeWrite.mockResolvedValue([{ n: data }]);
  }

  mockUpdateWrite(data: unknown, alias: string = 'u') {
    if (data) {
      this.mockConnection.executeWrite.mockResolvedValue([{ [alias]: data }]);
    } else {
      this.mockConnection.executeWrite.mockResolvedValue([]);
    }
  }

  mockDeleteWrite(deleted: boolean = true) {
    this.mockConnection.executeWrite.mockResolvedValue([{ deletedCount: deleted ? 1 : 0 }]);
  }

  mockConstraintError() {
    const constraintError = new Error('Neo.ClientError.Schema.ConstraintValidationFailed: constraint violation');
    this.mockConnection.executeWrite.mockRejectedValue(constraintError);
  }

  mockDatabaseError() {
    this.mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));
    this.mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));
  }
}
