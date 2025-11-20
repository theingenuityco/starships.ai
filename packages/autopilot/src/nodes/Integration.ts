/**
 * Integration Node
 *
 * Connector-backed capability node that delegates to the host/server via
 * callConnector(slug, payload). Workflows specify which connector slug and
 * logical operation to call, and shape a JSON payload; secrets and transport
 * details remain entirely server-side.
 */

import { BaseNode } from './BaseNode';
import type { IntegrationParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItem } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { ValidationResult, ValidationError } from '@/types/validation';

export class Integration extends BaseNode<IntegrationParams> {
  constructor(params: IntegrationParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    const callConnector = this.getOptions()?.callConnector;

    if (!callConnector || typeof callConnector !== 'function') {
      throw this.handleExecutionError(
        new Error('Integration node requires callConnector to be provided by the host runtime')
      );
    }

    const connectorSlug = params.connectorSlug;
    const operation = params.operation;

    if (!connectorSlug || typeof connectorSlug !== 'string') {
      throw this.handleExecutionError(new Error('Integration node requires a valid connectorSlug (string)'));
    }

    if (!operation || typeof operation !== 'string') {
      throw this.handleExecutionError(new Error('Integration node requires a valid operation (string)'));
    }

    const payloadEnvelope = {
      operation,
      // Allow blueprints to specify a payload via params; if omitted, pass through input.
      payload:
        params.payload !== undefined
          ? params.payload
          : ExecutionItemUtils.unwrapSingle(input),
    };

    try {
      const result = await callConnector({
        slug: connectorSlug,
        payload: payloadEnvelope as Record<string, unknown>,
      });

      return ExecutionItemUtils.wrapSingle(result, input?.[0]);
    } catch (error) {
      throw this.handleExecutionError(error, 'Integration execution failed');
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    if (!params.connectorSlug || typeof params.connectorSlug !== 'string') {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Integration node requires connectorSlug (string)',
      });
    }

    if (!params.operation || typeof params.operation !== 'string') {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Integration node requires operation (string)',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length ? errors : undefined,
    };
  }
}


