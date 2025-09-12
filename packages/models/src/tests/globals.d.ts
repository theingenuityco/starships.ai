/**
 * Global test utilities type declarations
 */

import { StarshipModel } from '@starships/protocol/domains/starship';
import { UserModel } from '@starships/protocol/domains/user';

declare global {
  var createMockDriver: () => Record<string, unknown>;
  var createMockUser: (overrides?: Partial<UserModel>) => UserModel;
  var createMockStarship: (overrides?: Partial<StarshipModel>) => StarshipModel;
  var createMockAgent: (overrides?: Record<string, unknown>) => Record<string, unknown>;
  var createMockConversation: (overrides?: Record<string, unknown>) => Record<string, unknown>;
  var createMockMessage: (overrides?: Record<string, unknown>) => Record<string, unknown>;
  var createMockBlueprint: (overrides?: Record<string, unknown>) => Record<string, unknown>;
  var createMockExecution: (overrides?: Record<string, unknown>) => Record<string, unknown>;
  var createMockMission: (overrides?: Record<string, unknown>) => Record<string, unknown>;
  var createMockDatabaseSession: () => Record<string, unknown>;
  var createValidationError: (message?: string, field?: string) => Error;
  var createNotFoundError: (entityType?: string, entityId?: string) => Error;
  var createDatabaseError: (message?: string, operation?: string) => Error;
  var createConflictError: (message?: string, conflictType?: string) => Error;
  var mockRepositoryError: (session: Record<string, unknown>, errorType: string) => void;
  var mockRepositorySuccess: (session: Record<string, unknown>, data: unknown) => void;
}

export {};
