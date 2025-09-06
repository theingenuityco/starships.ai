/**
 * Global test utilities type declarations
 */

import { StarshipModel } from '@starships/protocol/domains/starship';
import { UserModel } from '@starships/protocol/domains/user';

declare global {
  var createMockDriver: () => any;
  var createMockUser: (overrides?: Partial<UserModel>) => UserModel;
  var createMockStarship: (overrides?: Partial<StarshipModel>) => StarshipModel;
  var createMockAgent: (overrides?: any) => any;
  var createMockConversation: (overrides?: any) => any;
  var createMockMessage: (overrides?: any) => any;
  var createMockBlueprint: (overrides?: any) => any;
  var createMockExecution: (overrides?: any) => any;
  var createMockMission: (overrides?: any) => any;
  var createMockDatabaseSession: () => any;
  var createValidationError: (message?: string, field?: string) => any;
  var createNotFoundError: (entityType?: string, entityId?: string) => any;
  var createDatabaseError: (message?: string, operation?: string) => any;
  var createConflictError: (message?: string, conflictType?: string) => any;
  var mockRepositoryError: (session: any, errorType: string) => void;
  var mockRepositorySuccess: (session: any, data: any) => void;
}

export {};
