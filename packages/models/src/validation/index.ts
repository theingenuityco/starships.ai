/**
 * Validation Utilities and Schema Registry
 * 
 * This module provides validation utilities and a central schema registry
 * for all domain validation schemas. It integrates with the BaseRepository
 * patterns and provides standardized error handling across the application.
 */

import { z } from 'zod';
import { ValidationUtils } from '../types/shared';

// Import all validation schemas from domain-specific files
import { 
  UserSchema, 
  CreateUserSchema, 
  UpdateUserSchema,
  UserUtils
} from '../types/user';

import {
  StarshipSchema,
  CreateStarshipSchema,
  UpdateStarshipSchema,
  StarshipUtils
} from '../types/starship';

import {
  AgentSchema,
  AgentTemplateSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  CreateAgentTemplateSchema,
  UpdateAgentTemplateSchema,
  AgentUtils
} from '../types/agent';

import {
  MCPServerOptionSchema,
  MCPServerConnectorSchema,
  ConnectorConfigTemplateSchema,
  ConnectorConfigHistorySchema,
  ConnectorInstanceConfigSchema,
  ConnectorUtils
} from '../types/connector';

import {
  VisionSchema,
  CreateVisionSchema,
  UpdateVisionSchema,
  VisionUtils
} from '../types/vision';

import {
  OwnsRelationshipSchema,
  DeployedOnRelationshipSchema,
  CreatedFromRelationshipSchema,
  RatedRelationshipSchema,
  RelationshipUtils
} from '../types/relationships';

/**
 * Central Schema Registry
 * 
 * Provides access to all validation schemas by entity name.
 * This enables dynamic validation and consistent schema access across the application.
 */
const _schemaRegistry: Record<string, z.ZodSchema<any>> = {
  // Entity Schemas
  User: UserSchema,
  Starship: StarshipSchema,
  Agent: AgentSchema,
  AgentTemplate: AgentTemplateSchema,
  MCPServerOption: MCPServerOptionSchema,
  MCPServerConnector: MCPServerConnectorSchema,
  ConnectorConfigTemplate: ConnectorConfigTemplateSchema,
  ConnectorConfigHistory: ConnectorConfigHistorySchema,
  ConnectorInstanceConfig: ConnectorInstanceConfigSchema,
  Vision: VisionSchema,

  // Creation Schemas
  CreateUser: CreateUserSchema,
  CreateStarship: CreateStarshipSchema,
  CreateAgent: CreateAgentSchema,
  CreateAgentTemplate: CreateAgentTemplateSchema,
  CreateVision: CreateVisionSchema,

  // Update Schemas
  UpdateUser: UpdateUserSchema,
  UpdateStarship: UpdateStarshipSchema,
  UpdateAgent: UpdateAgentSchema,
  UpdateAgentTemplate: UpdateAgentTemplateSchema,
  UpdateVision: UpdateVisionSchema,

  // Relationship Schemas
  OwnsRelationship: OwnsRelationshipSchema,
  DeployedOnRelationship: DeployedOnRelationshipSchema,
  CreatedFromRelationship: CreatedFromRelationshipSchema,
  RatedRelationship: RatedRelationshipSchema,
};

export const SchemaRegistry = {
  ..._schemaRegistry,

  /**
   * Get a schema by name with type safety
   */
  getSchema(name: string): z.ZodSchema<any> | undefined {
    return _schemaRegistry[name];
  },

  /**
   * Check if a schema exists in the registry
   */
  hasSchema(name: string): boolean {
    return name in _schemaRegistry;
  },

  /**
   * Get all available schema names
   */
  getSchemaNames(): string[] {
    return Object.keys(_schemaRegistry);
  }
};

/**
 * Validation Error Types
 */

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}

export interface ValidationErrorDetail {
  path: string;
  message: string;
  code: string;
  received?: any;
  expected?: any;
}

/**
 * Enhanced Validation Error Class
 * 
 * Provides detailed validation error information compatible with BaseRepository patterns.
 */
export class ValidationError extends Error {
  public readonly errors: ValidationErrorDetail[];
  public readonly code: string = 'VALIDATION_ERROR';

  constructor(errors: ValidationErrorDetail[], message?: string) {
    const errorMessage = message || `Validation failed: ${errors.map(e => e.message).join(', ')}`;
    super(errorMessage);
    this.name = 'ValidationError';
    this.errors = errors;
  }

  /**
   * Create ValidationError from Zod error
   */
  static fromZodError(zodError: z.ZodError, context?: string): ValidationError {
    const errors: ValidationErrorDetail[] = zodError.issues.map((issue: any) => ({
      path: issue.path.join('.') || 'root',
      message: issue.message,
      code: issue.code,
      received: 'received' in issue ? issue.received : undefined,
      expected: 'expected' in issue ? issue.expected : undefined
    }));

    const message = context 
      ? `Validation failed for ${context}: ${errors.map(e => e.message).join(', ')}`
      : undefined;

    return new ValidationError(errors, message);
  }

  /**
   * Get errors for a specific field path
   */
  getErrorsForPath(path: string): ValidationErrorDetail[] {
    return this.errors.filter(error => error.path === path || error.path.startsWith(`${path}.`));
  }

  /**
   * Check if a specific field has validation errors
   */
  hasErrorsForPath(path: string): boolean {
    return this.getErrorsForPath(path).length > 0;
  }

  /**
   * Convert to a JSON-serializable format
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      errors: this.errors
    };
  }
}

/**
 * Generic Validation Functions
 */

/**
 * Validates an entity against its schema
 */
export function validateEntity<T>(
  entityName: string,
  data: unknown
): ValidationResult<T> {
  try {
    const schema = SchemaRegistry.getSchema(entityName);
    if (!schema) {
      return {
        success: false,
        errors: [{
          path: 'root',
          message: `Schema not found for entity: ${entityName}`,
          code: 'SCHEMA_NOT_FOUND'
        }]
      };
    }
    
    const result = schema.safeParse(data);

    if (result.success) {
      return {
        success: true,
        data: result.data as T
      };
    } else {
      const validationError = ValidationError.fromZodError(result.error, entityName);
      return {
        success: false,
        errors: validationError.errors
      };
    }
  } catch (error) {
    return {
      success: false,
      errors: [{
        path: 'root',
        message: error instanceof Error ? error.message : 'Unknown validation error',
        code: 'SCHEMA_ERROR'
      }]
    };
  }
}

/**
 * Validates and throws on validation failure
 */
export function validateEntityStrict<T>(
  entityName: string,
  data: unknown
): T {
  const result = validateEntity<T>(entityName, data);
  
  if (!result.success) {
    throw new ValidationError(result.errors!, `Validation failed for ${entityName}`);
  }
  
  return result.data!;
}

/**
 * Validates multiple entities in batch
 */
export function validateEntities<T>(
  entityName: string,
  dataArray: unknown[]
): ValidationResult<T[]> {
  const results = dataArray.map(data => validateEntity<T>(entityName, data));
  const failures = results.filter(result => !result.success);
  
  if (failures.length > 0) {
    const allErrors = failures.flatMap(failure => failure.errors!);
    return {
      success: false,
      errors: allErrors
    };
  }
  
  return {
    success: true,
    data: results.map(result => result.data!)
  };
}

/**
 * Domain-Specific Validation Utilities
 * 
 * Re-export domain utilities for easy access.
 */
export const DomainValidators = {
  User: UserUtils,
  Starship: StarshipUtils,
  Agent: AgentUtils,
  Connector: ConnectorUtils,
  Vision: VisionUtils,
  Relationship: RelationshipUtils,
  Shared: ValidationUtils
};

/**
 * Validation Middleware for BaseRepository
 * 
 * These functions can be used by repositories to validate data before operations.
 */

/**
 * Create validation middleware for repository operations
 */
export function createValidationMiddleware<T>(entityName: string) {
  return {
    /**
     * Validate data before create operations
     */
    validateCreate(data: unknown): T {
      const createSchemaName = `Create${entityName}`;
      if (SchemaRegistry.hasSchema(createSchemaName)) {
        return validateEntityStrict<T>(createSchemaName, data);
      }
      return validateEntityStrict<T>(entityName, data);
    },

    /**
     * Validate data before update operations
     */
    validateUpdate(data: unknown): Partial<T> {
      const updateSchemaName = `Update${entityName}`;
      if (SchemaRegistry.hasSchema(updateSchemaName)) {
        return validateEntityStrict<Partial<T>>(updateSchemaName, data);
      }
      // Fallback to partial validation of main schema
      const schema = SchemaRegistry.getSchema(entityName);
      if (!schema) {
        throw new ValidationError([{
          path: 'root',
          message: `Schema not found for entity: ${entityName}`,
          code: 'SCHEMA_NOT_FOUND'
        }]);
      }
      
      const partialSchema = schema.partial();
      const result = partialSchema.safeParse(data);
      
      if (!result.success) {
        throw ValidationError.fromZodError(result.error, `Update${entityName}`);
      }
      
      return result.data as Partial<T>;
    },

    /**
     * Validate complete entity after operations
     */
    validateEntity(data: unknown): T {
      return validateEntityStrict<T>(entityName, data);
    }
  };
}

/**
 * Repository Validation Mixins
 * 
 * Pre-configured validation for each domain entity.
 */
export const RepositoryValidators = {
  User: createValidationMiddleware<any>('User'),
  Starship: createValidationMiddleware<any>('Starship'),
  Agent: createValidationMiddleware<any>('Agent'),
  AgentTemplate: createValidationMiddleware<any>('AgentTemplate'),
  MCPServerOption: createValidationMiddleware<any>('MCPServerOption'),
  MCPServerConnector: createValidationMiddleware<any>('MCPServerConnector'),
  ConnectorConfigTemplate: createValidationMiddleware<any>('ConnectorConfigTemplate'),
  ConnectorConfigHistory: createValidationMiddleware<any>('ConnectorConfigHistory'),
  Vision: createValidationMiddleware<any>('Vision')
};

/**
 * Custom Validation Rules
 * 
 * Business-specific validation rules that go beyond schema validation.
 */

export const CustomValidationRules = {
  /**
   * Validates that an agent can be deployed to a specific starship class
   */
  validateAgentStarshipCompatibility(agent: any, starshipClass: string): boolean {
    if (!agent.allowedStarshipClasses) {
      return true; // No restrictions
    }
    return agent.allowedStarshipClasses.includes(starshipClass);
  },

  /**
   * Validates that a starship has capacity for additional agents
   */
  validateStarshipCapacity(starship: any, currentAgentCount: number): boolean {
    return currentAgentCount < starship.maxAgents;
  },

  /**
   * Validates that a vision statement meets quality requirements
   */
  validateVisionQuality(vision: any): boolean {
    return vision.statement.length >= 10 && vision.confidence >= 0.5;
  },

  /**
   * Validates that a connector configuration is properly formatted
   */
  validateConnectorConfig(config: any): boolean {
    if (config.environmentVariables) {
      try {
        JSON.parse(config.environmentVariables);
      } catch {
        return false;
      }
    }
    return true;
  },

  /**
   * Validates email uniqueness (for use in repositories)
   */
  validateEmailUniqueness: async (email: string, excludeUserId?: string): Promise<boolean> => {
    // This would be implemented by the repository layer
    // Return true for now as a placeholder
    return true;
  },

  /**
   * Validates username uniqueness (for use in repositories)
   */
  validateUsernameUniqueness: async (username: string, excludeUserId?: string): Promise<boolean> => {
    // This would be implemented by the repository layer
    // Return true for now as a placeholder
    return true;
  }
};

/**
 * Validation Configuration
 * 
 * Global configuration for validation behavior.
 */
export interface ValidationConfig {
  /** Whether to throw errors immediately or collect them */
  failFast: boolean;
  /** Whether to include additional context in error messages */
  includeContext: boolean;
  /** Maximum number of validation errors to collect before stopping */
  maxErrors: number;
  /** Custom error formatter */
  errorFormatter?: (error: ValidationErrorDetail) => string;
}

export const defaultValidationConfig: ValidationConfig = {
  failFast: true,
  includeContext: true,
  maxErrors: 10
};

let validationConfig = { ...defaultValidationConfig };

/**
 * Configure global validation behavior
 */
export function configureValidation(config: Partial<ValidationConfig>): void {
  validationConfig = { ...validationConfig, ...config };
}

/**
 * Get current validation configuration
 */
export function getValidationConfig(): ValidationConfig {
  return { ...validationConfig };
}

/**
 * Utility Functions for Error Handling
 */

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationErrorDetail[]): string {
  const formatter = validationConfig.errorFormatter || ((error) => `${error.path}: ${error.message}`);
  return errors.map(formatter).join('\n');
}

/**
 * Check if an error is a validation error
 */
export function isValidationError(error: any): error is ValidationError {
  return error instanceof ValidationError || 
         (error && error.name === 'ValidationError' && Array.isArray(error.errors));
}

/**
 * Convert any error to a validation error format
 */
export function toValidationError(error: any, context?: string): ValidationError {
  if (isValidationError(error)) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return ValidationError.fromZodError(error, context);
  }

  return new ValidationError([{
    path: 'root',
    message: error.message || 'Unknown error',
    code: 'UNKNOWN_ERROR'
  }], context ? `Error in ${context}` : undefined);
}

/**
 * Export all validation schemas for external use
 */
export {
  UserSchema,
  CreateUserSchema,
  UpdateUserSchema,
  StarshipSchema,
  CreateStarshipSchema,
  UpdateStarshipSchema,
  AgentSchema,
  AgentTemplateSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  CreateAgentTemplateSchema,
  UpdateAgentTemplateSchema,
  MCPServerOptionSchema,
  MCPServerConnectorSchema,
  ConnectorConfigTemplateSchema,
  ConnectorConfigHistorySchema,
  ConnectorInstanceConfigSchema,
  VisionSchema,
  CreateVisionSchema,
  UpdateVisionSchema,
  OwnsRelationshipSchema,
  DeployedOnRelationshipSchema,
  CreatedFromRelationshipSchema,
  RatedRelationshipSchema
};

/**
 * Export validation utilities from shared module
 */
export { ValidationUtils } from '../types/shared';