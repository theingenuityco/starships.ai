/**
 * Comprehensive repository test helper for PostgreSQL repositories
 */

import { getConnection } from '@/helpers/database';

export class RepositoryTestHelper {
  public mockConnection: {
    query: jest.Mock;
    queryOne: jest.Mock;
    queryCount: jest.Mock;
  };

  constructor() {
    this.mockConnection = {
      query: jest.fn(),
      queryOne: jest.fn(),
      queryCount: jest.fn(),
    };

    // Mock getConnection to always return our mock
    (getConnection as jest.Mock).mockReturnValue(this.mockConnection);
  }

  reset() {
    this.mockConnection.query.mockClear();
    this.mockConnection.queryOne.mockClear();
    this.mockConnection.queryCount.mockClear();
    this.mockConnection.query.mockResolvedValue([]);
    this.mockConnection.queryOne.mockResolvedValue(null);
    this.mockConnection.queryCount.mockResolvedValue(0);
  }

  // Mock patterns for different repository operations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mockFindQuery(data: unknown, _alias?: string) {
    if (Array.isArray(data)) {
      this.mockConnection.query.mockResolvedValue(data);
    } else if (data) {
      this.mockConnection.query.mockResolvedValue([data]);
      this.mockConnection.queryOne.mockResolvedValue(data);
    } else {
      this.mockConnection.query.mockResolvedValue([]);
      this.mockConnection.queryOne.mockResolvedValue(null);
    }
  }

  mockCreateWrite(data: unknown) {
    // Mock for PostgreSQL INSERT ... RETURNING pattern
    this.mockConnection.query.mockResolvedValue([data]);
  }

  mockMergeWrite(data: unknown) {
    // Mock for PostgreSQL INSERT ... ON CONFLICT pattern
    this.mockConnection.query.mockResolvedValue([data]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mockUpdateWrite(data: unknown, _alias?: string) {
    if (data) {
      this.mockConnection.query.mockResolvedValue([data]);
    } else {
      this.mockConnection.query.mockResolvedValue([]);
    }
  }

  mockDeleteWrite(deleted: boolean = true) {
    this.mockConnection.query.mockResolvedValue({ rowCount: deleted ? 1 : 0 });
  }

  mockConstraintError() {
    const constraintError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505', // PostgreSQL unique_violation error code
    });
    this.mockConnection.query.mockRejectedValue(constraintError);
  }

  mockDatabaseError() {
    this.mockConnection.query.mockRejectedValue(new Error('Database error'));
    this.mockConnection.queryOne.mockRejectedValue(new Error('Database error'));
    this.mockConnection.queryCount.mockRejectedValue(new Error('Database error'));
  }
}
