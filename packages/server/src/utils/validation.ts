/**
 * Shared validation utilities for API routes
 * 
 * Provides centralized validation logic using Zod schemas with consistent
 * error handling and response formatting across all routes.
 */

import { z, ZodError } from 'zod';
import type { Response } from 'express';
import { sendError } from './responseHelpers';

/**
 * Validates data against a Zod schema and sends error response if validation fails
 * 
 * This function centralizes validation logic across all API routes, ensuring consistent
 * error handling and response formatting. It replaces the duplicate validation functions
 * that were previously scattered across individual route files.
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate (typically req.body, req.params, or req.query)
 * @param res - Express response object (error response sent automatically on failure)
 * @param context - Context string for error messages (e.g., 'login data', 'user parameter', 'pagination query')
 * @returns Validated and transformed data if successful, null if validation fails
 * 
 * @throws {Error} If required parameters are missing or invalid
 * 
 * @example Basic usage
 * ```typescript
 * const bodyValidation = validateData(LoginSchema, req.body, res, 'login data');
 * if (!bodyValidation) return; // Error already sent to client
 * const { email, password } = bodyValidation;
 * ```
 * 
 * @example Parameter validation
 * ```typescript
 * const paramValidation = validateData(
 *   z.object({ id: IdSchema }), 
 *   req.params, 
 *   res, 
 *   'user parameter'
 * );
 * if (!paramValidation) return;
 * const { id } = paramValidation;
 * ```
 * 
 * @example Query validation with defaults
 * ```typescript
 * const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination');
 * if (!queryValidation) return;
 * const { page, limit } = queryValidation; // Defaults applied automatically
 * ```
 * 
 * Error Response Format:
 * - Status: 400 for validation errors, 500 for internal errors
 * - Body: Standardized error object with field-level details
 * - Headers: Standard error response headers
 * 
 * Security Notes:
 * - Always validates input before processing
 * - Prevents injection attacks through schema validation
 * - Sanitizes error messages to prevent information leakage
 * - Rate limiting should be applied at middleware level, not here
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  res: Response,
  context: string
): T | null {
  // Parameter validation for development safety
  if (!schema || !res || !context) {
    throw new Error('validateData: missing required parameters (schema, res, context)');
  }
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path.join('.');

      sendError(res, 'VALIDATION_ERROR', firstError.message, 400, {
        field: fieldName,
        context,
        validationErrors: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', `${context} validation error`, 500);
    }
    return null;
  }
}