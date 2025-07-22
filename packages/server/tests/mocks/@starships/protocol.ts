/**
 * Mock implementations for @starships/protocol package
 * Used in server unit tests to isolate from protocol dependencies
 */

declare const jest: any;

// Mock Error Classes
export class ValidationError extends Error {
  public field?: string;
  public statusCode: number = 400;
  public category: string = 'validation';
  public requestId?: string;
  public path?: string;
  
  constructor(message: string, field?: string, details?: any, requestId?: string, path?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.requestId = requestId;
    this.path = path;
  }
  
  toResponse() {
    return {
      code: 'VALIDATION_ERROR',
      message: this.message,
      field: this.field,
      statusCode: this.statusCode,
      category: this.category,
      timestamp: new Date().toISOString(),
    };
  }
  
  toJSON() {
    return {
      name: this.name,
      code: 'VALIDATION_ERROR',
      message: this.message,
      statusCode: this.statusCode,
      category: this.category,
      requestId: this.requestId,
      path: this.path,
      stack: this.stack,
    };
  }
}

export class AuthenticationError extends Error {
  public statusCode: number = 401;
  public category: string = 'authentication';
  
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
  
  toResponse() {
    return {
      code: 'AUTHENTICATION_ERROR',
      message: this.message,
      statusCode: this.statusCode,
      category: this.category,
      timestamp: new Date().toISOString(),
    };
  }
}

export class AuthorizationError extends Error {
  public statusCode: number = 403;
  public category: string = 'authorization';
  
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  public entityType?: string;
  public entityId?: string;
  public statusCode: number = 404;
  public category: string = 'not_found';
  
  constructor(message: string, entityType?: string, entityId?: string) {
    super(message);
    this.name = 'NotFoundError';
    this.entityType = entityType;
    this.entityId = entityId;
  }
  
  toResponse() {
    return {
      code: 'NOT_FOUND_ERROR',
      message: this.message,
      entityType: this.entityType,
      entityId: this.entityId,
      statusCode: this.statusCode,
      category: this.category,
      timestamp: new Date().toISOString(),
    };
  }
}

export class ConflictError extends Error {
  public statusCode: number = 409;
  public category: string = 'conflict';
  
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DatabaseError extends Error {
  public operation?: string;
  public query?: string;
  public statusCode: number = 500;
  public category: string = 'database';
  public code?: string;
  public requestId?: string;
  public path?: string;
  
  constructor(message: string, operation?: string, query?: string, details?: any, requestId?: string, path?: string) {
    super(message);
    this.name = 'DatabaseError';
    this.operation = operation;
    this.query = query;
    this.requestId = requestId;
    this.path = path;
  }
  
  toJSON() {
    return {
      name: this.name,
      code: this.code || 'DATABASE_ERROR',
      message: this.message,
      statusCode: this.statusCode,
      category: this.category,
      requestId: this.requestId,
      path: this.path,
      stack: this.stack,
    };
  }
  
  toResponse() {
    const details: any = {};
    if (this.operation) details.operation = this.operation;
    if (this.query && process.env.NODE_ENV !== 'production') {
      details.query = this.query;
    }
    
    return {
      code: 'DATABASE_ERROR',
      message: this.message,
      statusCode: this.statusCode,
      category: this.category,
      details: Object.keys(details).length > 0 ? details : undefined,
      timestamp: new Date().toISOString(),
    };
  }
}

// Mock Error Utils
export const ErrorUtils = {
  isApplicationError: jest.fn((error: any) => {
    return error.name && ['ValidationError', 'AuthenticationError', 'NotFoundError'].includes(error.name);
  }),
  normalize: jest.fn((error: any, requestId?: string, path?: string) => {
    const normalizedError = new DatabaseError(error.message || 'Internal server error');
    normalizedError.code = 'INTERNAL_SERVER_ERROR';
    normalizedError.requestId = requestId;
    normalizedError.path = path;
    return normalizedError;
  }),
  generateRequestId: jest.fn(() => {
    // Generate unique UUIDs for each test call
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }),
  extractLogDetails: jest.fn((error: any) => {
    return {
      errorName: error.name,
      errorCode: error.code || (error.name === 'DatabaseError' ? 'DATABASE_ERROR' : 'UNKNOWN_ERROR'),
      errorMessage: error.message,
      statusCode: error.statusCode || 500,
      category: error.category || 'unknown',
      requestId: error.requestId,
      path: error.path,
      stack: error.stack,
    };
  }),
};

// Mock Error Factory
export const ErrorFactory = {
  validation: jest.fn((message: string, field?: string, requestId?: string, path?: string) => {
    const error = new ValidationError(message, field);
    return Object.assign(error, { requestId, path });
  }),
  notFound: jest.fn((entityType: string, entityId: string, requestId?: string, path?: string) => {
    const error = new NotFoundError(`${entityType} with ID ${entityId} not found`, entityType, entityId);
    return Object.assign(error, { requestId, path });
  }),
};

// Mock Types
export interface ChatRequest {
  agent_id: string;
  user_id: string;
  message: string;
  channel_id?: string;
}

export interface ChatResponse {
  reply: string;
  metadata?: any;
}

export interface SocketIOEvents {
  connection: (socket: any) => void;
  disconnect: (reason: string) => void;
}

export interface SocketConnectionState {
  userId: string;
  isConnected: boolean;
}

// Additional Error Classes needed by errorHandler
export class StandardError extends Error {
  public code: string;
  public category: string;
  public severity: string;
  public httpStatusCode: number;
  public correlationId?: string;
  public requestId?: string;
  public userId?: string;
  public isRetryable: boolean;
  public context?: Record<string, any>;
  public details?: Record<string, any>;

  constructor(
    code: string,
    message?: string,
    details?: Record<string, any>,
    context?: Record<string, any>,
    userId?: string,
    requestId?: string
  ) {
    super(message || 'An error occurred');
    this.name = 'StandardError';
    this.code = code;
    this.category = 'general';
    this.severity = 'medium';
    this.httpStatusCode = 500;
    this.isRetryable = false;
    this.context = context;
    this.details = details;
    this.userId = userId;
    this.requestId = requestId;
  }

  static fromError(error: Error, code: string, context?: Record<string, any>, userId?: string, requestId?: string) {
    return new StandardError(code, error.message, undefined, context, userId, requestId);
  }

  toErrorResponse(config?: any) {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        category: this.category,
        severity: this.severity,
        correlationId: this.correlationId,
        details: this.details,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        service: config?.service,
        version: config?.version,
        environment: config?.environment,
      },
    };
  }
}

export class NetworkError extends StandardError {
  constructor(message: string, details?: Record<string, any>) {
    super('NETWORK_ERROR', message, details);
    this.name = 'NetworkError';
    this.category = 'network';
    this.httpStatusCode = 503;
  }
}

export class BusinessLogicError extends StandardError {
  constructor(
    code: string,
    title: string,
    message: string,
    context?: Record<string, any>,
    userId?: string,
    requestId?: string
  ) {
    super(code, message, undefined, context, userId, requestId);
    this.name = 'BusinessLogicError';
    this.category = 'business_logic';
    this.httpStatusCode = 422;
  }
}

export class ExpeditionError extends StandardError {
  constructor(message: string) {
    super('EXPEDITION_ERROR', message);
    this.name = 'ExpeditionError';
    this.category = 'expedition';
  }
}

export class StarshipError extends StandardError {
  constructor(message: string) {
    super('STARSHIP_ERROR', message);
    this.name = 'StarshipError';
    this.category = 'starship';
  }
}

export class TaskError extends StandardError {
  constructor(message: string) {
    super('TASK_ERROR', message);
    this.name = 'TaskError';
    this.category = 'task';
  }
}

export class AgentError extends StandardError {
  constructor(message: string) {
    super('AGENT_ERROR', message);
    this.name = 'AgentError';
    this.category = 'agent';
  }
}

// Type guards
export const isStandardError = jest.fn((error: any) => error instanceof StandardError);
export const isValidationError = jest.fn((error: any) => error instanceof ValidationError);
export const isAuthenticationError = jest.fn((error: any) => error instanceof AuthenticationError);
export const isAuthorizationError = jest.fn((error: any) => error instanceof AuthorizationError);
export const isNotFoundError = jest.fn((error: any) => error instanceof NotFoundError);
export const isConflictError = jest.fn((error: any) => error instanceof ConflictError);
export const isDatabaseError = jest.fn((error: any) => error instanceof DatabaseError);
export const isNetworkError = jest.fn((error: any) => error instanceof NetworkError);
export const isBusinessLogicError = jest.fn((error: any) => error instanceof BusinessLogicError);

// Error types and utilities from @starships/protocol/src/types/errors
export type StandardErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND_ERROR'
  | 'CONFLICT_ERROR'
  | 'DATABASE_ERROR'
  | 'NETWORK_ERROR'
  | 'BUSINESS_LOGIC_ERROR'
  | 'INTERNAL_SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'REQUEST_TIMEOUT'
  | 'RATE_LIMIT_EXCEEDED';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    category: string;
    severity: string;
    correlationId?: string;
    details?: Record<string, any>;
  };
  metadata: {
    timestamp: string;
    service?: string;
    version?: string;
    environment?: string;
  };
}

export const generateCorrelationId = jest.fn(() => {
  return 'correlation-' + Math.random().toString(36).substr(2, 9);
});

export const shouldLogError = jest.fn((severity: ErrorSeverity) => {
  return ['medium', 'high', 'critical'].includes(severity);
});