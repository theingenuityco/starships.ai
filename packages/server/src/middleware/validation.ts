/**
 * Input Validation Middleware
 * 
 * Provides validation utilities for API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { 
  // Import types as needed
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

// Removed all expedition-related validation functions