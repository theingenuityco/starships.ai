/**
 * LLM Node Handler
 * 
 * Handles LLM (Large Language Model) nodes using OpenRouter unified API
 */

import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, LlmNodeParameters, HttpRequestNodeParameters } from '../../types';
import { HttpRequestHandler } from './HttpRequestHandler';

export class LlmHandler implements Handler {
  readonly type = 'llm';
  private httpHandler = new HttpRequestHandler();

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as unknown as LlmNodeParameters;
    
    try {
      // Convert LLM parameters to HTTP request parameters
      const httpParams = this.convertToHttpRequest(params);
      
      // Create a temporary HTTP request node
      const httpNode: Node = {
        ...node,
        type: 'http_request',
        parameters: httpParams
      };
      
      // Delegate to HttpRequestHandler
      const result = await this.httpHandler.execute(httpNode, context);
      
      // Process the result to extract LLM-specific data
      if (result.success && result.data && typeof result.data === 'object') {
        const httpData = result.data as any;
        if (httpData.body) {
          const llmResponse = this.extractLlmResponse(httpData.body);
          
          return {
            ...result,
            nodeId: node.id,
            data: {
              ...httpData,
              llmResponse,
              model: params.model,            
            }
          };
        }
      }
      
      return {
        ...result,
        nodeId: node.id
      };
      
    } catch (error) {
      return {
        nodeId: node.id,
        success: false,
        data: { error: (error as Error).message },
        executedAt: new Date().toISOString(),
        duration: 0
      };
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
      return responseBody.choices?.[0]?.message?.content || '';
    } catch {
      // Fallback: try to extract any text content
      if (typeof responseBody === 'string') return responseBody;
      if (responseBody?.content) return responseBody.content;
      if (responseBody?.text) return responseBody.text;
      return JSON.stringify(responseBody);
    }
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as unknown as LlmNodeParameters;
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (!params.model) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Model is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.prompt) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Prompt is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    // Parameter range validation
    if (params.temperature !== undefined && (params.temperature < 0 || params.temperature > 2)) {
      errors.push({
        code: 'INVALID_TEMPERATURE',
        message: 'Temperature must be between 0 and 2',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (params.maxTokens !== undefined && params.maxTokens < 1) {
      errors.push({
        code: 'INVALID_MAX_TOKENS',
        message: 'Max tokens must be greater than 0',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (params.topP !== undefined && (params.topP < 0 || params.topP > 1)) {
      errors.push({
        code: 'INVALID_TOP_P',
        message: 'Top P must be between 0 and 1',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    // Warnings for common issues
    if (params.maxTokens && params.maxTokens > 4000) {
      warnings.push({
        code: 'HIGH_TOKEN_COUNT',
        message: 'High token count may result in expensive API calls',
        nodeId: node.id,
        severity: 'warning' as const
      });
    }

    if (!params.systemMessage) {
      warnings.push({
        code: 'NO_SYSTEM_MESSAGE',
        message: 'Consider adding a system message for better AI behavior control',
        nodeId: node.id,
        severity: 'warning' as const
      });
    }

    if (params.timeout && params.timeout < 10000) {
      warnings.push({
        code: 'LOW_TIMEOUT',
        message: 'LLM requests may take longer than the specified timeout',
        nodeId: node.id,
        severity: 'warning' as const
      });
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