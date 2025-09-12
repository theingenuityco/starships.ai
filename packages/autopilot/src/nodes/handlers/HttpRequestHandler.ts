/**
 * HTTP Request Node Handler
 *
 * Executes HTTP request with direct HttpRequest class instantiation
 * Uses BaseHandler pattern
 */

import { BaseHandler } from '@/nodes/Handler';
import { Execution, ValidationResult, HttpRequestParams, ValidationError, ValidationWarning } from '@/types';
import { HttpRequest } from '@/HttpRequest';

export class HttpRequestHandler extends BaseHandler {
  readonly type = 'http_request';

  async execute(execution: Execution) {
    const params = this.node.parameters as HttpRequestParams;

    try {
      console.log(`Executing HTTP ${params.method} request to: ${params.url}`);

      // Create HttpRequest instance from the full parameters and execute
      const httpRequest = new HttpRequest(params);
      const httpResult = await httpRequest.execute();

      // Check if HTTP request execution was successful
      if (httpResult.status === 'completed') {
        return this.createSuccessResult(execution, {
          ...httpResult.data,
          output: `HTTP ${params.method} request to ${params.url} completed successfully`,
        });
      } else {
        // HTTP request execution failed
        const errorMessage = httpResult.error?.message || 'HTTP request failed';
        return this.createErrorResult(execution, `HTTP ${params.method} request to ${params.url} failed: ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(execution, `HTTP ${params.method} request to ${params.url} execution failed: ${errorMessage}`);
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as HttpRequestParams;

    // Check for required fields first
    if (!params.url) {
      errors.push(this.createValidationError('MISSING_REQUIRED_FIELD', 'URL is required'));
    }

    if (!params.method) {
      errors.push(this.createValidationError('MISSING_REQUIRED_FIELD', 'HTTP method is required'));
    }

    // Only do comprehensive validation if basic fields are present
    // to avoid duplicate error messages
    if (params.url && params.method) {
      // Use HttpRequest class validation for comprehensive checking
      const httpRequest = new HttpRequest(params);
      const httpValidation = httpRequest.validate();

      if (!httpValidation.valid) {
        httpValidation.errors.forEach((error) => {
          // Skip errors we already caught above
          if (!error.includes('URL is required') && !error.includes('HTTP method is required')) {
            errors.push(this.createValidationError('VALIDATION_FAILED', error));
          }
        });
      }
    }

    // Warnings for common issues
    if (params.timeout && params.timeout < 1000) {
      warnings.push(this.createValidationWarning('POTENTIAL_TIMEOUT', 'Timeout is very low, this may cause frequent failures'));
    }

    if (params.retries && params.retries > 5) {
      warnings.push(this.createValidationWarning('POTENTIAL_TIMEOUT', 'High retry count may cause long execution times'));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: [],
    };
  }

  getIcon(): string {
    return 'globe';
  }
}
