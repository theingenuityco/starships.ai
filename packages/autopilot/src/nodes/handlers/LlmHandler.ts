/**
 * LLM Node Handler
 * 
 * Handles LLM (Large Language Model) nodes using OpenRouter unified API
 * Uses BaseHandler pattern and delegates to HttpRequestHandler
 */

import { BaseHandler } from '../Handler';
import { ExecutionContext, ValidationResult, LlmNodeParameters, HttpRequestNodeParameters, Node, ValidationError, ValidationWarning } from '../../types';
import { HttpRequestHandler } from './HttpRequestHandler';

export class LlmHandler extends BaseHandler {
  readonly type = 'llm';

  async execute(context: ExecutionContext) {
    const params = this.node.parameters as LlmNodeParameters;
    try {
      // Convert LLM parameters to HTTP request parameters
      const httpParams = this.convertToHttpRequest(params);
      
      // Create HttpRequestHandler instance for delegation
      const httpNode: Node = {
        ref: `${this.node.ref}-http`,
        type: 'http_request',
        name: `HTTP Request for ${this.node.name}`,
        description: `HTTP request delegated from LLM node ${this.node.name}`,
        parameters: httpParams
      };
      const httpHandler = new HttpRequestHandler(httpNode);
      
      // Delegate to HttpRequestHandler
      const result = await httpHandler.execute(context);
      
      // Process the result to extract LLM-specific data
      if (result.success && result.data && typeof result.data === 'object') {
        const httpData = result.data as any;
        if (httpData.body) {
          const llmResponse = this.extractLlmResponse(httpData.body);
          
          return this.createSuccessResult({
            ...httpData,
            llmResponse,
            model: params.model,
          }, result.duration);
        }
      }
      
      return {
        ...result,
        nodeRef: this.node.ref
      };
      
    } catch (error) {
      return this.createErrorResult((error as Error).message);
    }
  }

  private convertToHttpRequest(params: LlmNodeParameters): HttpRequestNodeParameters {
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ${OPENROUTER_API_KEY}',
      'HTTP-Referer': '${OPENROUTER_HTTP_REFERER}', // Optional: for analytics
      'X-Title': '${OPENROUTER_APP_NAME}' // Optional: for analytics
    };
    const body = this.buildRequestBody(params);

    return {
      url: endpoint,
      method: 'POST',
      headers,
      body,
      timeout: params.timeout || 60000,
      retries: 1,
      followRedirects: true
    };
  }

  private buildRequestBody(params: LlmNodeParameters): object {
    const messages = [];
    
    // Add system message if provided
    if (params.systemMessage) {
      messages.push({
        role: 'system',
        content: params.systemMessage
      });
    }
    
    // Add user prompt
    messages.push({
      role: 'user',
      content: params.prompt
    });

    // Build OpenRouter-compatible request body
    return {
      model: params.model,
      messages,
      temperature: params.temperature || 0.7,
      max_tokens: params.maxTokens || 1024,
      top_p: params.topP || 1.0,
      frequency_penalty: params.frequencyPenalty || 0,
      presence_penalty: params.presencePenalty || 0,
      stream: params.stream || false,
      // OpenRouter specific optional parameters
      transforms: [], // Can be used for prompt transforms
      route: 'fallback' // Can be 'fallback' or specific routing
    };
  }

  private extractLlmResponse(responseBody: any): string {
    try {
      // OpenRouter uses OpenAI-compatible format
      const openAIContent = responseBody.choices?.[0]?.message?.content;
      if (openAIContent) return openAIContent;
      
      // Fallback: try to extract any text content
      if (typeof responseBody === 'string') return responseBody;
      if (responseBody?.content) return responseBody.content;
      if (responseBody?.text) return responseBody.text;
      return JSON.stringify(responseBody);
    } catch {
      // If parsing fails completely, return empty string
      return '';
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as LlmNodeParameters;

    // Required fields validation
    if (!params.model) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Model is required'
      ));
    }

    if (!params.prompt) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Prompt is required'
      ));
    }

    // Parameter range validation
    if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2)) {
      errors.push(this.createValidationError(
        'INVALID_PARAMETERS',
        'Temperature must be between 0 and 2'
      ));
    }

    if (params.maxTokens !== undefined && params.maxTokens < 1) {
      errors.push(this.createValidationError(
        'INVALID_PARAMETERS',
        'Max tokens must be greater than 0'
      ));
    }

    if (params.topP !== undefined && (params.topP < 0 || params.topP > 1)) {
      errors.push(this.createValidationError(
        'INVALID_PARAMETERS',
        'Top P must be between 0 and 1'
      ));
    }

    // Warnings for common issues
    if (params.maxTokens && params.maxTokens > 4000) {
      warnings.push(this.createValidationWarning(
        'LARGE_WORKFLOW_SIZE',
        'High token count may result in expensive API calls'
      ));
    }

    if (!params.systemMessage) {
      warnings.push(this.createValidationWarning(
        'MISSING_DESCRIPTIONS',
        'Consider adding a system message for better AI behavior control'
      ));
    }

    if (params.timeout && params.timeout < 10000) {
      warnings.push(this.createValidationWarning(
        'POTENTIAL_TIMEOUT',
        'LLM requests may take longer than the specified timeout'
      ));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: []
    };
  }

  getIcon(): string {
    return 'brain';
  }
}