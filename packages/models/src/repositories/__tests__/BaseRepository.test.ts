/**
 * BaseRepository Unit Tests
 */

import { BaseRepository } from '@/repositories/BaseRepository';
import {
  BaseError,
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
} from '@starships/errors';

// Test implementation of BaseRepository
class TestRepository extends BaseRepository {
  constructor() {
    super('TestService');
  }

  // Expose protected methods for testing
  public testCreateContext(operation: string, resource?: string, resourceId?: string) {
    return this.createContext(operation, resource, resourceId);
  }

  public testHandleDatabaseError(
    error: any,
    operation: string,
    resource?: string,
    resourceId?: string
  ) {
    return this.handleDatabaseError(error, operation, resource, resourceId);
  }

  public testHandleNotFound(resource: string, resourceId?: string, operation?: string) {
    return this.handleNotFound(resource, resourceId, operation);
  }

  public testHandleValidationError(
    fieldErrors: Array<{ field: string; message: string; value?: any }>,
    operation?: string
  ) {
    return this.handleValidationError(fieldErrors, operation);
  }

  public testHandleConflict(
    resource: string,
    conflictReason: string,
    operation?: string,
    resourceId?: string
  ) {
    return this.handleConflict(resource, conflictReason, operation, resourceId);
  }

  public async testExecuteWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    resource?: string,
    resourceId?: string
  ) {
    return this.executeWithErrorHandling(operation, operationName, resource, resourceId);
  }

  public testExecuteWithErrorHandlingSync<T>(
    operation: () => T,
    operationName: string,
    resource?: string,
    resourceId?: string
  ) {
    return this.executeWithErrorHandlingSync(operation, operationName, resource, resourceId);
  }

  public testValidateRequired(data: any, requiredFields: string[], operation?: string) {
    return this.validateRequired(data, requiredFields, operation);
  }

  public testValidateTypes(data: any, fieldTypes: Record<string, string>, operation?: string) {
    return this.validateTypes(data, fieldTypes, operation);
  }

  public testValidateStringLengths(
    data: any,
    lengthConstraints: Record<string, { min?: number; max?: number }>,
    operation?: string
  ) {
    return this.validateStringLengths(data, lengthConstraints, operation);
  }

  public testValidateEnums(
    data: any,
    enumConstraints: Record<string, string[]>,
    operation?: string
  ) {
    return this.validateEnums(data, enumConstraints, operation);
  }

  public testCreateBusinessLogicError(
    code: string,
    message: string,
    operation?: string,
    resource?: string,
    resourceId?: string
  ) {
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
        layer: 'repository',
        operation: 'create',
        resource: undefined,
        resourceId: undefined,
        requestId: undefined,
        timestamp: expect.any(Date),
        userAgent: undefined,
        userId: undefined,
        metadata: { component: 'repository' },
      });
    });

    it('should create context with resource details', () => {
      const context = repository.testCreateContext('update', 'User', 'user-123');

      expect(context).toEqual({
        component: 'TestService',
        layer: 'repository',
        operation: 'update',
        resource: 'User',
        resourceId: 'user-123',
        requestId: undefined,
        timestamp: expect.any(Date),
        userAgent: undefined,
        userId: undefined,
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
        expect(error.entityType).toBe('User');
        expect(error.entityId).toBe('user-123');
        expect(error.message).toContain('User with ID user-123 not found');
      }
    });

    it('should handle missing resource ID', () => {
      expect(() => {
        repository.testHandleNotFound('User');
      }).toThrow(NotFoundError);

      try {
        repository.testHandleNotFound('User');
      } catch (error: any) {
        expect(error.entityId).toBe('unknown');
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
        expect(error.conflictType).toBe('resource_conflict');
        expect(error.details).toMatchObject({
          resource: 'User',
          resourceId: 'user-123',
        });
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

      await expect(repository.testExecuteWithErrorHandling(operation, 'test')).rejects.toThrow(
        ValidationError
      );
    });

    it('should handle generic error', async () => {
      const operation = async () => {
        throw new Error('Generic error');
      };

      await expect(
        repository.testExecuteWithErrorHandling(operation, 'test', 'User', 'user-123')
      ).rejects.toThrow(DatabaseError);
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

  describe('validateRequired', () => {
    it('should pass validation for valid data', () => {
      const data = { name: 'John', email: 'john@example.com' };

      expect(() => {
        repository.testValidateRequired(data, ['name', 'email']);
      }).not.toThrow();
    });

    it('should throw ValidationError for missing fields', () => {
      const data = { name: 'John' };

      expect(() => {
        repository.testValidateRequired(data, ['name', 'email'], 'create');
      }).toThrow(ValidationError);

      try {
        repository.testValidateRequired(data, ['name', 'email']);
      } catch (error: any) {
        expect(error.message).toContain('email is required');
      }
    });

    it('should validate against null, undefined, and empty string', () => {
      const data = { name: null, email: undefined, phone: '' };

      expect(() => {
        repository.testValidateRequired(data, ['name', 'email', 'phone']);
      }).toThrow(ValidationError);
    });
  });

  describe('validateTypes', () => {
    it('should pass validation for correct types', () => {
      const data = { name: 'John', age: 30, active: true };

      expect(() => {
        repository.testValidateTypes(data, {
          name: 'string',
          age: 'number',
          active: 'boolean',
        });
      }).not.toThrow();
    });

    it('should throw ValidationError for incorrect types', () => {
      const data = { name: 'John', age: '30' };

      expect(() => {
        repository.testValidateTypes(data, { age: 'number' });
      }).toThrow(ValidationError);

      try {
        repository.testValidateTypes(data, { age: 'number' });
      } catch (error: any) {
        expect(error.message).toContain('age must be of type number');
      }
    });

    it('should skip validation for undefined fields', () => {
      const data = { name: 'John' };

      expect(() => {
        repository.testValidateTypes(data, { age: 'number' });
      }).not.toThrow();
    });
  });

  describe('validateStringLengths', () => {
    it('should pass validation for valid string lengths', () => {
      const data = { name: 'John', description: 'A test description' };

      expect(() => {
        repository.testValidateStringLengths(data, {
          name: { min: 2, max: 10 },
          description: { min: 5, max: 100 },
        });
      }).not.toThrow();
    });

    it('should throw ValidationError for strings too short', () => {
      const data = { name: 'J' };

      expect(() => {
        repository.testValidateStringLengths(data, { name: { min: 2 } });
      }).toThrow(ValidationError);

      try {
        repository.testValidateStringLengths(data, { name: { min: 2 } });
      } catch (error: any) {
        expect(error.message).toContain('name must be at least 2 characters long');
      }
    });

    it('should throw ValidationError for strings too long', () => {
      const data = { name: 'Very long name' };

      expect(() => {
        repository.testValidateStringLengths(data, { name: { max: 5 } });
      }).toThrow(ValidationError);

      try {
        repository.testValidateStringLengths(data, { name: { max: 5 } });
      } catch (error: any) {
        expect(error.message).toContain('name must be no more than 5 characters long');
      }
    });

    it('should skip validation for non-string values', () => {
      const data = { age: 30 };

      expect(() => {
        repository.testValidateStringLengths(data, { age: { min: 2 } });
      }).not.toThrow();
    });
  });

  describe('validateEnums', () => {
    it('should pass validation for valid enum values', () => {
      const data = { status: 'active', role: 'admin' };

      expect(() => {
        repository.testValidateEnums(data, {
          status: ['active', 'inactive', 'pending'],
          role: ['admin', 'user', 'guest'],
        });
      }).not.toThrow();
    });

    it('should throw ValidationError for invalid enum values', () => {
      const data = { status: 'invalid_status' };

      expect(() => {
        repository.testValidateEnums(data, {
          status: ['active', 'inactive'],
        });
      }).toThrow(ValidationError);

      try {
        repository.testValidateEnums(data, {
          status: ['active', 'inactive'],
        });
      } catch (error: any) {
        expect(error.message).toContain('status must be one of: active, inactive');
      }
    });

    it('should skip validation for undefined values', () => {
      const data = { name: 'John' };

      expect(() => {
        repository.testValidateEnums(data, {
          status: ['active', 'inactive'],
        });
      }).not.toThrow();
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
        expect(error.message).toBe('Business rule violation');
        expect(error.details).toMatchObject({
          code: 'BUSINESS_ERROR',
        });
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
