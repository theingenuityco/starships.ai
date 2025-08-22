import { z } from 'zod';

/**
 * Base Repository Interface
 * 
 * Generic repository interface providing standard CRUD operations for all domain entities.
 * All domain-specific repositories should extend this interface.
 */
export interface Repository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

/**
 * Base Entity Interface
 * 
 * Common fields that all domain entities should have.
 */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Temporal Fields Interface
 * 
 * Standard timestamp fields for entities that track creation and modification times.
 */
export interface TemporalFields {
  createdAt: string;
  updatedAt: string;
}

/**
 * Aggregate Root Marker Interface
 * 
 * Marker interface to identify aggregate roots in domain-driven design.
 * Aggregate roots are the only entities that can be directly accessed from outside the aggregate.
 */
export interface AggregateRoot {
  readonly _aggregateRoot: true;
}

/**
 * Domain Event Interface
 * 
 * Base interface for domain events that can be raised by aggregate roots.
 */
export interface DomainEvent {
  readonly eventType: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
  readonly version: number;
}

/**
 * Validation Schema Registry
 * 
 * Central registry for all validation schemas across domains.
 */
export interface ValidationSchemaRegistry {
  [entityName: string]: z.ZodSchema<any>;
}

/**
 * Common Value Objects
 */

// UUID validation schema
export const UuidSchema = z.string().uuid('Invalid UUID format');

// Email validation schema
export const EmailSchema = z.string().email('Invalid email format');

// Username validation schema (alphanumeric, underscores, hyphens, 3-30 chars)
export const UsernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

// Slug validation schema (lowercase letters, numbers, hyphens)
export const SlugSchema = z.string()
  .min(1, 'Slug cannot be empty')
  .max(100, 'Slug must be at most 100 characters')
  .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens');

// ISO 8601 datetime validation schema
export const DateTimeSchema = z.string().datetime('Invalid ISO 8601 datetime format');

// JSON string validation schema
export const JsonStringSchema = z.string().refine((val: string) => {
  try {
    JSON.parse(val);
    return true;
  } catch {
    return false;
  }
}, 'Invalid JSON string');

/**
 * Common Enumerations
 */

// Standard entity status enumeration
export const EntityStatusSchema = z.enum(['active', 'inactive', 'disabled', 'pending']);
export type EntityStatus = z.infer<typeof EntityStatusSchema>;

// Log level enumeration
export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/**
 * Common Error Types
 */

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly field: string, value?: any) {
    super(message, 'VALIDATION_ERROR', { field, value });
    this.name = 'ValidationError';
  }
}

export class ConstraintViolationError extends DomainError {
  constructor(message: string, public readonly constraint: string) {
    super(message, 'CONSTRAINT_VIOLATION', { constraint });
    this.name = 'ConstraintViolationError';
  }
}

export class NotFoundError extends DomainError {
  constructor(entityType: string, identifier: string) {
    super(`${entityType} with identifier '${identifier}' not found`, 'NOT_FOUND', {
      entityType,
      identifier
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Aggregate Boundary Utilities
 */

export interface AggregateBoundary {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly version: number;
}

/**
 * Consistency Rules
 */

export interface ConsistencyRule<T> {
  readonly name: string;
  readonly validate: (entity: T) => boolean | string;
}

/**
 * Common Validation Utilities
 */

export const ValidationUtils = {
  /**
   * Validates if a string is a valid UUID
   */
  isValidUuid: (value: string): boolean => {
    return UuidSchema.safeParse(value).success;
  },

  /**
   * Validates if a string is a valid email
   */
  isValidEmail: (value: string): boolean => {
    return EmailSchema.safeParse(value).success;
  },

  /**
   * Validates if a string is a valid username
   */
  isValidUsername: (value: string): boolean => {
    return UsernameSchema.safeParse(value).success;
  },

  /**
   * Validates if a string is a valid slug
   */
  isValidSlug: (value: string): boolean => {
    return SlugSchema.safeParse(value).success;
  },

  /**
   * Validates if a string is valid JSON
   */
  isValidJson: (value: string): boolean => {
    return JsonStringSchema.safeParse(value).success;
  },

  /**
   * Creates a standardized error message from Zod validation errors
   */
  formatZodError: (error: z.ZodError): string => {
    return error.issues
      .map((issue: any) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
  }
};

/**
 * Port and Network Validation
 */
export const PortSchema = z.number()
  .int('Port must be an integer')
  .min(1, 'Port must be at least 1')
  .max(65535, 'Port must be at most 65535');

/**
 * Timeout Validation (in milliseconds)
 */
export const TimeoutSchema = z.number()
  .int('Timeout must be an integer')
  .min(1000, 'Timeout must be at least 1000ms')
  .max(600000, 'Timeout must be at most 600000ms (10 minutes)');

/**
 * Percentage Validation (0-100)
 */
export const PercentageSchema = z.number()
  .min(0, 'Percentage must be at least 0')
  .max(100, 'Percentage must be at most 100');

/**
 * Memory Size Validation (in MB)
 */
export const MemorySizeSchema = z.number()
  .int('Memory size must be an integer')
  .min(64, 'Memory size must be at least 64MB')
  .max(8192, 'Memory size must be at most 8192MB (8GB)');

/**
 * Rating Validation (1-5 scale)
 */
export const RatingSchema = z.number()
  .min(1, 'Rating must be at least 1')
  .max(5, 'Rating must be at most 5');

/**
 * Score Validation (0-1 scale)
 */
export const ScoreSchema = z.number()
  .min(0, 'Score must be at least 0')
  .max(1, 'Score must be at most 1');

/**
 * Common Configuration Schemas
 */

export const TimeoutConfigSchema = z.object({
  connection: TimeoutSchema.optional(),
  request: TimeoutSchema.optional(),
  idle: TimeoutSchema.optional(),
});

export const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).optional(),
  baseDelay: z.number().int().min(100).max(5000).optional(),
  maxDelay: z.number().int().min(1000).max(30000).optional(),
  exponentialBackoff: z.boolean().optional(),
});

export const LoggingConfigSchema = z.object({
  level: LogLevelSchema.optional(),
  enableDebug: z.boolean().optional(),
  logRequests: z.boolean().optional(),
  logMetrics: z.boolean().optional(),
});

export const ResourceConfigSchema = z.object({
  maxMemoryMB: MemorySizeSchema.optional(),
  maxCpuPercent: PercentageSchema.optional(),
  maxConnections: z.number().int().min(1).max(1000).optional(),
});

export const HealthCheckConfigSchema = z.object({
  enabled: z.boolean().optional(),
  interval: z.number().int().min(5000).max(300000).optional(),
  timeout: z.number().int().min(1000).max(30000).optional(),
  failureThreshold: z.number().int().min(1).max(10).optional(),
});