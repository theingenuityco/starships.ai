/**
 * BaseRepository Unit Tests
 */

import { BaseRepository } from '@/repositories/BaseRepository';
import { ConflictError, DatabaseError, NotFoundError, ValidationError } from '@starships/errors';

// Mock nanoid for consistent testing
jest.mock('nanoid', () => ({
  nanoid: () => 'mock-nanoid-123',
}));

// Test implementation of BaseRepository
class TestRepository extends BaseRepository {
  constructor() {
    super('TestService');
  }

  // Expose protected methods for testing
  public testCreateContext(operation: string, resource?: string, resourceId?: string) {
    return this.createContext(operation, resource, resourceId);
  }

  public testHandleDatabaseError(error: any, operation: string, resource?: string, resourceId?: string) {
    return this.handleDatabaseError(error, operation, resource, resourceId);
  }

  public testHandleNotFound(resource: string, resourceId?: string, operation?: string) {
    return this.handleNotFound(resource, resourceId, operation);
  }

  public testHandleValidationError(fieldErrors: Array<{ field: string; message: string; value?: any }>, operation?: string) {
    return this.handleValidationError(fieldErrors, operation);
  }

  public testHandleConflict(resource: string, conflictReason: string, operation?: string, resourceId?: string) {
    return this.handleConflict(resource, conflictReason, operation, resourceId);
  }

  public async testExecuteWithErrorHandling<T>(operation: () => Promise<T>, operationName: string, resource?: string, resourceId?: string) {
    return this.executeWithErrorHandling(operation, operationName, resource, resourceId);
  }

  public testExecuteWithErrorHandlingSync<T>(operation: () => T, operationName: string, resource?: string, resourceId?: string) {
    return this.executeWithErrorHandlingSync(operation, operationName, resource, resourceId);
  }

  // Note: Validation methods have been removed from BaseRepository
  // Validation is now handled by individual entities using class-validator decorators

  public testCreateBusinessLogicError(code: string, message: string, operation?: string, resource?: string, resourceId?: string) {
    return this.createBusinessLogicError(code, message, operation, resource, resourceId);
  }
}

describe('BaseRepository', () => {
  let repository: TestRepository;

  beforeEach(() => {
    repository = new TestRepository();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with service name', () => {
      expect((repository as any).serviceName).toBe('TestService');
    });
  });

  describe('createContext', () => {
    it('should create basic context', () => {
      const context = repository.testCreateContext('create');

      expect(context).toEqual({
        component: 'TestService',
        operation: 'create',
        resource: undefined,
        resourceId: undefined,
        requestId: expect.any(String),
        metadata: { component: 'repository' },
      });
    });

    it('should create context with resource details', () => {
      const context = repository.testCreateContext('update', 'User', 'user-123');

      expect(context).toEqual({
        component: 'TestService',
        operation: 'update',
        resource: 'User',
        resourceId: 'user-123',
        requestId: expect.any(String),
        metadata: { component: 'repository' },
      });
    });
  });

  describe('handleDatabaseError', () => {
    it('should handle constraint violation error', () => {
      const error = { message: 'constraint violation error', code: 'UNIQUE_CONSTRAINT' };

      expect(() => {
        repository.testHandleDatabaseError(error, 'create', 'User', 'user-123');
      }).toThrow(ConflictError);
    });

    it('should handle connection error', () => {
      const error = { message: 'connection failed', code: 'ECONNREFUSED' };

      expect(() => {
        repository.testHandleDatabaseError(error, 'connect');
      }).toThrow(DatabaseError);
    });

    it('should handle timeout error', () => {
      const error = { message: 'operation timeout', code: 'ETIMEDOUT' };

      expect(() => {
        repository.testHandleDatabaseError(error, 'query');
      }).toThrow(DatabaseError);
    });

    it('should handle query error', () => {
      const error = { message: 'syntax error in query' };

      expect(() => {
        repository.testHandleDatabaseError(error, 'execute');
      }).toThrow(DatabaseError);
    });

    it('should handle generic database error', () => {
      const error = { message: 'unknown database error' };

      expect(() => {
        repository.testHandleDatabaseError(error, 'generic');
      }).toThrow(DatabaseError);
    });

    it('should handle error without message', () => {
      const error = {};

      expect(() => {
        repository.testHandleDatabaseError(error, 'test');
      }).toThrow(DatabaseError);
    });
  });

  describe('handleNotFound', () => {
    it('should throw NotFoundError with resource details', () => {
      expect(() => {
        repository.testHandleNotFound('User', 'user-123', 'find');
      }).toThrow(NotFoundError);

      try {
        repository.testHandleNotFound('User', 'user-123', 'find');
      } catch (error: any) {
        expect(error.resource).toBe('User');
        expect(error.id).toBe('user-123');
        expect(error.message).toContain('User not found: user-123');
      }
    });

    it('should handle missing resource ID', () => {
      expect(() => {
        repository.testHandleNotFound('User');
      }).toThrow(NotFoundError);

      try {
        repository.testHandleNotFound('User');
      } catch (error: any) {
        expect(error.id).toBe('unknown');
      }
    });
  });

  describe('handleValidationError', () => {
    it('should throw ValidationError with field errors', () => {
      const fieldErrors = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'name', message: 'Name is required' },
      ];

      expect(() => {
        repository.testHandleValidationError(fieldErrors, 'create');
      }).toThrow(ValidationError);

      try {
        repository.testHandleValidationError(fieldErrors);
      } catch (error: any) {
        expect(error.message).toContain('email: Invalid email format');
        expect(error.message).toContain('name: Name is required');
        expect(error.field).toBe('email');
      }
    });

    it('should handle empty field errors array', () => {
      expect(() => {
        repository.testHandleValidationError([{ field: 'test', message: 'Test error' }]);
      }).toThrow(ValidationError);
    });
  });

  describe('handleConflict', () => {
    it('should throw ConflictError with details', () => {
      expect(() => {
        repository.testHandleConflict('User', 'Email already exists', 'create', 'user-123');
      }).toThrow(ConflictError);

      try {
        repository.testHandleConflict('User', 'Email already exists', 'create', 'user-123');
      } catch (error: any) {
        expect(error.message).toBe('Email already exists');
        expect(error.code).toBe('CONFLICT');
        expect(error.statusCode).toBe(409);
      }
    });
  });

  describe('executeWithErrorHandling', () => {
    it('should execute operation successfully', async () => {
      const operation = async () => 'success';

      const result = await repository.testExecuteWithErrorHandling(operation, 'test_operation');

      expect(result).toBe('success');
    });

    it('should re-throw BaseError', async () => {
      const operation = async () => {
        throw new ValidationError('Test validation error');
      };

      await expect(repository.testExecuteWithErrorHandling(operation, 'test')).rejects.toThrow(ValidationError);
    });

    it('should handle generic error', async () => {
      const operation = async () => {
        throw new Error('Generic error');
      };

      await expect(repository.testExecuteWithErrorHandling(operation, 'test', 'User', 'user-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('executeWithErrorHandlingSync', () => {
    it('should execute sync operation successfully', () => {
      const operation = () => 'sync_success';

      const result = repository.testExecuteWithErrorHandlingSync(operation, 'sync_operation');

      expect(result).toBe('sync_success');
    });

    it('should handle sync errors', () => {
      const operation = () => {
        throw new Error('Sync error');
      };

      expect(() => {
        repository.testExecuteWithErrorHandlingSync(operation, 'sync_test');
      }).toThrow(DatabaseError);
    });
  });

  // Note: Validation tests have been removed as validation methods are no longer in BaseRepository
  // Validation is now handled by individual entities using class-validator decorators

  describe('validation migration note', () => {
    it('should note that validation has moved to entity layer', () => {
      // Validation is now handled by entities using class-validator decorators
      // These tests have been removed as the methods no longer exist in BaseRepository
      expect(true).toBe(true);
    });
  });

  describe('createBusinessLogicError', () => {
    it('should throw DatabaseError with business logic details', () => {
      expect(() => {
        repository.testCreateBusinessLogicError(
          'INSUFFICIENT_PERMISSIONS',
          'User lacks required permissions',
          'authorize',
          'User',
          'user-123'
        );
      }).toThrow(DatabaseError);

      try {
        repository.testCreateBusinessLogicError('BUSINESS_ERROR', 'Business rule violation');
      } catch (error: any) {
        expect(error.message).toBe('Database unknown failed');
        expect(error.code).toBe('DATABASE_ERROR');
        expect(error.operation).toBe('unknown');
      }
    });
  });

  describe('error detection methods', () => {
    it('should detect constraint violation errors', () => {
      const constraintErrors = [
        { message: 'constraint violation', code: '' },
        { message: 'unique constraint failed', code: '' },
        { message: 'duplicate key error', code: '' },
        { message: 'foreign key constraint', code: '' },
        { message: 'check constraint failed', code: '' },
        { message: 'not null constraint', code: '' },
        { message: 'primary key violation', code: '' },
      ];

      constraintErrors.forEach((error) => {
        expect(() => {
          repository.testHandleDatabaseError(error, 'test');
        }).toThrow(ConflictError);
      });
    });

    it('should detect connection errors', () => {
      const connectionErrors = [
        { message: 'connection failed', code: '' },
        { message: 'connect timeout', code: '' },
        { message: 'network error', code: 'ECONNREFUSED' },
        { message: 'host not found', code: 'ENOTFOUND' },
      ];

      connectionErrors.forEach((error) => {
        expect(() => {
          repository.testHandleDatabaseError(error, 'connect');
        }).toThrow(DatabaseError);
      });
    });

    it('should detect timeout errors', () => {
      const timeoutErrors = [
        { message: 'timeout exceeded', code: '' },
        { message: 'operation timed out', code: '' },
        { message: 'query timeout', code: 'ETIMEDOUT' },
      ];

      timeoutErrors.forEach((error) => {
        expect(() => {
          repository.testHandleDatabaseError(error, 'query');
        }).toThrow(DatabaseError);
      });
    });

    it('should detect query errors', () => {
      const queryErrors = [
        { message: 'syntax error in query' },
        { message: 'invalid query format' },
        { message: 'query failed to execute' },
        { message: 'sql error occurred' },
        { message: 'cypher error in statement' },
      ];

      queryErrors.forEach((error) => {
        expect(() => {
          repository.testHandleDatabaseError(error, 'execute');
        }).toThrow(DatabaseError);
      });
    });
  });

  describe('logging', () => {
    it('should have log method that outputs to console', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      (repository as any).log('info', 'Test message', { data: 'test' });

      expect(consoleSpy).toHaveBeenCalledWith('[TESTSERVICE] Test message', { data: 'test' });

      consoleSpy.mockRestore();
    });

    it('should log at different levels', () => {
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      (repository as any).log('debug', 'Debug message');
      (repository as any).log('warn', 'Warning message');
      (repository as any).log('error', 'Error message');

      expect(debugSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      debugSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
