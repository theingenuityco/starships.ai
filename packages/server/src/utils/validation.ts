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
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param res - Express response object
 * @param context - Context string for error messages (e.g., 'registration data', 'user parameter')
 * @returns Validated data if successful, null if validation fails (error response already sent)
 * 
 * @example
 * ```typescript
 * const bodyValidation = validateData(LoginSchema, req.body, res, 'login data');
 * if (!bodyValidation) return; // Error already sent to client
 * const { email, password } = bodyValidation;
 * ```
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  res: Response,
  context: string
): T | null {
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