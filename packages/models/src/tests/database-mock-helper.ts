/**
 * Common database mocking helper for repository tests
 */

import { getConnection } from '@/helpers/database';

export function createDatabaseMock() {
  const mockConnection = {
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  };

  (getConnection as jest.Mock).mockReturnValue(mockConnection);

  return mockConnection;
}

export function mockRepositorySuccess(mockConnection: Record<string, unknown>, data: unknown) {
  // Mock successful create operation using createEntityWithAutoId pattern
  (mockConnection.executeWrite as jest.MockedFunction<() => Promise<unknown>>).mockResolvedValue([{ n: data }]);
}

export function mockRepositoryQuery(mockConnection: Record<string, unknown>, data: unknown) {
  // Mock successful query operations
  const mockQuery = mockConnection.executeQuery as jest.MockedFunction<() => Promise<unknown>>;
  if (Array.isArray(data)) {
    mockQuery.mockResolvedValue(
      data.map((item) => ({
        n: item,
        // Also provide common field mappings
        u: item, // for User queries
        s: item, // for Starship queries
        a: item, // for Agent queries
        m: item, // for Message queries
        c: item, // for Conversation queries
        blueprint: item, // for Blueprint queries
        mc: item, // for MissionClarity queries
        user: item, // for User queries with 'user' alias
      }))
    );
  } else if (data) {
    mockQuery.mockResolvedValue([
      {
        n: data,
        u: data,
        s: data,
        a: data,
        m: data,
        c: data,
        blueprint: data,
        mc: data,
        user: data,
      },
    ]);
  } else {
    mockQuery.mockResolvedValue([]);
  }
}

export function mockRepositoryError(mockConnection: Record<string, unknown>, errorMessage: string = 'Database error') {
  (mockConnection.executeQuery as jest.MockedFunction<() => Promise<unknown>>).mockRejectedValue(new Error(errorMessage));
  (mockConnection.executeWrite as jest.MockedFunction<() => Promise<unknown>>).mockRejectedValue(new Error(errorMessage));
}

export function mockConstraintViolationError(mockConnection: Record<string, unknown>) {
  const constraintError = new Error('Neo.ClientError.Schema.ConstraintValidationFailed: constraint violation');
  (mockConnection.executeWrite as jest.MockedFunction<() => Promise<unknown>>).mockRejectedValue(constraintError);
}

export function mockMergeEntityWithAutoId(mockConnection: Record<string, unknown>, data: unknown) {
  // Mock the mergeEntityWithAutoId pattern
  (mockConnection.executeWrite as jest.MockedFunction<() => Promise<unknown>>).mockResolvedValue([{ n: data }]);
}

export function mockUpdateEntity(mockConnection: Record<string, unknown>, data: unknown) {
  // Mock update operations
  if (data) {
    (mockConnection.executeWrite as jest.MockedFunction<() => Promise<unknown>>).mockResolvedValue([{ u: data }]);
  } else {
    (mockConnection.executeWrite as jest.MockedFunction<() => Promise<unknown>>).mockResolvedValue([]);
  }
}

export function mockDeleteEntity(mockConnection: Record<string, unknown>, deleted: boolean = true) {
  // Mock delete operations
  (mockConnection.executeWrite as jest.MockedFunction<() => Promise<unknown>>).mockResolvedValue([{ deletedCount: deleted ? 1 : 0 }]);
}
