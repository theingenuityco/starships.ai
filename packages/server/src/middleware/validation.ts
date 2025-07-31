/**
 * Input Validation Middleware
 * 
 * Provides validation utilities for expedition API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { 
  CreateExpeditionRequest,
  UpdateExpeditionRequest,
  CreateTaskRequest,
  SendMessageRequest,
  CreateResultRequest,
  ExpeditionStatus,
  TaskStatus,
  TaskPriority,
  MessageType,
  ResultType,
  ResultFormat
} from '@starships/protocol';

/**
 * Validation error response
 */
interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Send validation error response
 */
function sendValidationError(res: Response, errors: ValidationError[]): void {
  res.status(400).json({
    success: false,
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: errors
  });
}

/**
 * Validate required fields
 */
function validateRequired(obj: any, fields: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      errors.push({
        field,
        message: `${field} is required`,
        value: obj[field]
      });
    }
  }
  
  return errors;
}

/**
 * Validate string length
 */
function validateStringLength(obj: any, field: string, min?: number, max?: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const value = obj[field];
  
  if (value !== undefined && typeof value === 'string') {
    if (min !== undefined && value.length < min) {
      errors.push({
        field,
        message: `${field} must be at least ${min} characters long`,
        value: value.length
      });
    }
    if (max !== undefined && value.length > max) {
      errors.push({
        field,
        message: `${field} must be no more than ${max} characters long`,
        value: value.length
      });
    }
  }
  
  return errors;
}

/**
 * Validate enum values
 */
function validateEnum<T>(obj: any, field: string, validValues: T[], required = false): ValidationError[] {
  const errors: ValidationError[] = [];
  const value = obj[field];
  
  if (required && (value === undefined || value === null)) {
    errors.push({
      field,
      message: `${field} is required`,
      value
    });
  } else if (value !== undefined && value !== null && !validValues.includes(value)) {
    errors.push({
      field,
      message: `${field} must be one of: ${validValues.join(', ')}`,
      value
    });
  }
  
  return errors;
}

/**
 * Validate array
 */
function validateArray(obj: any, field: string, required = false, maxLength?: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const value = obj[field];
  
  if (required && (!value || !Array.isArray(value) || value.length === 0)) {
    errors.push({
      field,
      message: `${field} is required and must be a non-empty array`,
      value
    });
  } else if (value !== undefined && !Array.isArray(value)) {
    errors.push({
      field,
      message: `${field} must be an array`,
      value
    });
  } else if (value && Array.isArray(value) && maxLength && value.length > maxLength) {
    errors.push({
      field,
      message: `${field} must contain no more than ${maxLength} items`,
      value: value.length
    });
  }
  
  return errors;
}

/**
 * Validate number range
 */
function validateNumberRange(obj: any, field: string, min?: number, max?: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const value = obj[field];
  
  if (value !== undefined && typeof value === 'number') {
    if (min !== undefined && value < min) {
      errors.push({
        field,
        message: `${field} must be at least ${min}`,
        value
      });
    }
    if (max !== undefined && value > max) {
      errors.push({
        field,
        message: `${field} must be no more than ${max}`,
        value
      });
    }
  }
  
  return errors;
}

/**
 * Validate UUID format
 */
function validateUUID(obj: any, field: string, required = false): ValidationError[] {
  const errors: ValidationError[] = [];
  const value = obj[field];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (required && !value) {
    errors.push({
      field,
      message: `${field} is required`,
      value
    });
  } else if (value && !uuidRegex.test(value)) {
    errors.push({
      field,
      message: `${field} must be a valid UUID`,
      value
    });
  }
  
  return errors;
}

/**
 * Middleware to validate create expedition request
 */
export function validateCreateExpedition(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as CreateExpeditionRequest;
  let errors: ValidationError[] = [];
  
  // Required fields
  errors = errors.concat(validateRequired(body, ['name', 'mission', 'selectedAgents']));
  
  // String length validations
  errors = errors.concat(validateStringLength(body, 'name', 1, 200));
  errors = errors.concat(validateStringLength(body, 'mission', 1, 1000));
  
  // Array validations
  errors = errors.concat(validateArray(body, 'selectedAgents', true, 10)); // Required array with max 10 agents
  
  if (errors.length > 0) {
    sendValidationError(res, errors);
    return;
  }
  
  next();
}

/**
 * Middleware to validate update expedition request
 */
export function validateUpdateExpedition(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as UpdateExpeditionRequest;
  let errors: ValidationError[] = [];
  
  // String length validations (optional fields)
  if (body.name !== undefined) {
    errors = errors.concat(validateStringLength(body, 'name', 1, 200));
  }
  if (body.mission !== undefined) {
    errors = errors.concat(validateStringLength(body, 'mission', 1, 1000));
  }
  
  // Enum validations
  errors = errors.concat(validateEnum(body, 'status', ['draft', 'planning', 'in-progress', 'review', 'completed', 'failed', 'cancelled'] as ExpeditionStatus[]));
  
  // Array validations
  if (body.assignedAgents !== undefined) {
    errors = errors.concat(validateArray(body, 'assignedAgents', false, 20));
  }
  
  if (errors.length > 0) {
    sendValidationError(res, errors);
    return;
  }
  
  next();
}

/**
 * Middleware to validate create task request
 */
export function validateCreateTask(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as CreateTaskRequest;
  let errors: ValidationError[] = [];
  
  // Required fields
  errors = errors.concat(validateRequired(body, ['title', 'description', 'requiredSkills', 'deliverable']));
  
  // String length validations
  errors = errors.concat(validateStringLength(body, 'title', 1, 200));
  errors = errors.concat(validateStringLength(body, 'description', 1, 1000));
  errors = errors.concat(validateStringLength(body, 'deliverable', 1, 500));
  
  // Array validations
  errors = errors.concat(validateArray(body, 'requiredSkills', true, 20));
  errors = errors.concat(validateArray(body, 'dependencies', false, 50));
  
  // Enum validations
  errors = errors.concat(validateEnum(body, 'priority', ['low', 'medium', 'high', 'critical'] as TaskPriority[]));
  
  // Number validations
  errors = errors.concat(validateNumberRange(body, 'estimatedEffort', 1, 2880)); // Max 2 days in minutes
  
  if (errors.length > 0) {
    sendValidationError(res, errors);
    return;
  }
  
  next();
}

/**
 * Middleware to validate send message request
 */
export function validateSendMessage(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as SendMessageRequest;
  let errors: ValidationError[] = [];
  
  // Only require content
  errors = errors.concat(validateRequired(body, ['content']));
  errors = errors.concat(validateStringLength(body, 'content', 1, 5000));
  
  // Optional participant validation - allow 'first-officer' or valid UUID
  if (body.participantId !== undefined && body.participantId !== null) {
    if (body.participantId !== 'first-officer') {
      // Only validate UUID if it's not 'first-officer'
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(body.participantId)) {
        errors.push({
          field: 'participantId',
          message: 'participantId must be either "first-officer" or a valid UUID',
          value: body.participantId
        });
      }
    }
  }
  
  // Optional thread/parent validation
  errors = errors.concat(validateUUID(body, 'threadId'));
  errors = errors.concat(validateUUID(body, 'parentMessageId'));
  
  if (errors.length > 0) {
    sendValidationError(res, errors);
    return;
  }
  
  next();
}

/**
 * Middleware to validate create result request
 */
export function validateCreateResult(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as CreateResultRequest;
  let errors: ValidationError[] = [];
  
  // Required fields
  errors = errors.concat(validateRequired(body, ['title', 'content', 'resultType', 'format']));
  
  // String length validations
  errors = errors.concat(validateStringLength(body, 'title', 1, 200));
  errors = errors.concat(validateStringLength(body, 'content', 1, 50000)); // Allow large content
  errors = errors.concat(validateStringLength(body, 'description', 0, 1000));
  
  // Enum validations
  errors = errors.concat(validateEnum(body, 'resultType', ['final-report', 'task-output', 'analysis', 'code', 'document', 'design', 'data', 'recommendation'] as ResultType[], true));
  errors = errors.concat(validateEnum(body, 'format', ['text', 'markdown', 'json', 'code', 'html', 'pdf', 'image', 'video', 'audio', 'archive'] as ResultFormat[], true));
  
  // Array validations
  errors = errors.concat(validateArray(body, 'attachments', false, 20));
  
  if (errors.length > 0) {
    sendValidationError(res, errors);
    return;
  }
  
  next();
}

/**
 * Middleware to validate quality score request
 */
export function validateQualityScore(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;
  let errors: ValidationError[] = [];
  
  // Required fields
  errors = errors.concat(validateRequired(body, ['overall']));
  
  // Number validations
  errors = errors.concat(validateNumberRange(body, 'overall', 0, 100));
  errors = errors.concat(validateNumberRange(body, 'completeness', 0, 100));
  errors = errors.concat(validateNumberRange(body, 'accuracy', 0, 100));
  errors = errors.concat(validateNumberRange(body, 'relevance', 0, 100));
  errors = errors.concat(validateNumberRange(body, 'clarity', 0, 100));
  
  // String length validations
  errors = errors.concat(validateStringLength(body, 'notes', 0, 1000));
  
  if (errors.length > 0) {
    sendValidationError(res, errors);
    return;
  }
  
  next();
}

/**
 * Middleware to validate task assignment request
 */
export function validateTaskAssignment(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;
  let errors: ValidationError[] = [];
  
  // Required fields
  errors = errors.concat(validateRequired(body, ['agentId']));
  
  // UUID validations
  errors = errors.concat(validateUUID(body, 'agentId', true));
  
  if (errors.length > 0) {
    sendValidationError(res, errors);
    return;
  }
  
  next();
}

/**
 * Middleware to validate task completion request
 */
export function validateTaskCompletion(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;
  let errors: ValidationError[] = [];
  
  // String length validations (result is optional)
  errors = errors.concat(validateStringLength(body, 'result', 0, 10000));
  
  if (errors.length > 0) {
    sendValidationError(res, errors);
    return;
  }
  
  next();
}