/**
 * Common database mocking helper for repository tests
 */

import { getConnection } from '../helpers/database';

export function createDatabaseMock() {
  const mockConnection = {
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  };

  (getConnection as jest.Mock).mockReturnValue(mockConnection);

  return mockConnection;
}

export function mockRepositorySuccess(mockConnection: any, data: any) {
  // Mock successful create operation using createEntityWithAutoId pattern
  mockConnection.executeWrite.mockResolvedValue([{ n: data }]);
}

export function mockRepositoryQuery(mockConnection: any, data: any) {
  // Mock successful query operations
  if (Array.isArray(data)) {
    mockConnection.executeQuery.mockResolvedValue(
      data.map((item) => ({
        n: item,
        // Also provide common field mappings
        u: item, // for User queries
        s: item, // for Starship queries
        a: item, // for Agent queries
        m: item, // for Message queries
        session: item, // for Session queries
        blueprint: item, // for Blueprint queries
        mc: item, // for MissionClarity queries
      }))
    );
  } else if (data) {
    mockConnection.executeQuery.mockResolvedValue([
      {
        n: data,
        u: data,
        s: data,
        a: data,
        m: data,
        session: data,
        blueprint: data,
        mc: data,
      },
    ]);
  } else {
    mockConnection.executeQuery.mockResolvedValue([]);
  }
}

export function mockRepositoryError(mockConnection: any, errorMessage: string = 'Database error') {
  mockConnection.executeQuery.mockRejectedValue(new Error(errorMessage));
  mockConnection.executeWrite.mockRejectedValue(new Error(errorMessage));
}
