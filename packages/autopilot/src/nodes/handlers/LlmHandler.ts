/**
 * LLM Node Handler
 * 
 * Handles LLM (Large Language Model) nodes by converting them to HTTP requests
 * and delegating to the HttpRequestHandler
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
          const llmResponse = this.extractLlmResponse(httpData.body, params.provider);
          
          return {
            ...result,
            nodeId: node.id,
            data: {
              ...httpData,
              llmResponse,
              model: params.model,
              provider: params.provider
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
    const endpoint = this.getProviderEndpoint(params.provider || 'openai');
    const headers = this.getProviderHeaders(params.provider || 'openai');
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

  private getProviderEndpoint(provider: LlmNodeParameters['provider']): string {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'anthropic':
        return 'https://api.anthropic.com/v1/messages';
      case 'google':
        return 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
      case 'local':
        return 'http://localhost:11434/api/chat'; // Ollama default
      case 'custom':
        return 'https://api.custom-provider.com/v1/chat'; // Placeholder
      default:
        return 'https://api.openai.com/v1/chat/completions';
    }
  }

  private getProviderHeaders(provider: LlmNodeParameters['provider']): Record<string, string> {
    const baseHeaders = {
      'Content-Type': 'application/json'
    };

    switch (provider) {
      case 'openai':
        return {
          ...baseHeaders,
          'Authorization': 'Bearer ${OPENAI_API_KEY}' // Will be replaced at runtime
        };
      case 'anthropic':
        return {
          ...baseHeaders,
          'x-api-key': '${ANTHROPIC_API_KEY}', // Will be replaced at runtime
          'anthropic-version': '2023-06-01'
        };
      case 'google':
        return {
          ...baseHeaders,
          'x-goog-api-key': '${GOOGLE_API_KEY}' // Will be replaced at runtime
        };
      case 'local':
      case 'custom':
        return baseHeaders;
      default:
        return {
          ...baseHeaders,
          'Authorization': 'Bearer ${OPENAI_API_KEY}'
        };
    }
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

    // Build request body based on provider format
    switch (params.provider) {
      case 'anthropic':
        return {
          model: params.model,
          max_tokens: params.maxTokens || 1024,
          temperature: params.temperature || 0.7,
          messages,
          stream: params.stream || false
        };
      case 'google':
        return {
          contents: messages.map(msg => ({
            role: msg.role === 'system' ? 'user' : msg.role,
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            temperature: params.temperature || 0.7,
            maxOutputTokens: params.maxTokens || 1024,
            topP: params.topP || 1.0
          }
        };
      case 'local':
        return {
          model: params.model,
          messages,
          stream: params.stream || false,
          options: {
            temperature: params.temperature || 0.7,
            num_predict: params.maxTokens || 1024
          }
        };
      case 'openai':
      default:
        return {
          model: params.model,
          messages,
          temperature: params.temperature || 0.7,
          max_tokens: params.maxTokens || 1024,
          top_p: params.topP || 1.0,
          frequency_penalty: params.frequencyPenalty || 0,
          presence_penalty: params.presencePenalty || 0,
          stream: params.stream || false
        };
    }
  }

  private extractLlmResponse(responseBody: any, provider: LlmNodeParameters['provider']): string {
    try {
      switch (provider) {
        case 'anthropic':
          return responseBody.content?.[0]?.text || responseBody.completion || '';
        case 'google':
          return responseBody.candidates?.[0]?.content?.parts?.[0]?.text || '';
        case 'local':
          return responseBody.message?.content || responseBody.response || '';
        case 'openai':
        default:
          return responseBody.choices?.[0]?.message?.content || '';
      }
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

    // Provider validation
    const validProviders = ['openai', 'anthropic', 'google', 'local', 'custom'];
    if (params.provider && !validProviders.includes(params.provider)) {
      errors.push({
        code: 'INVALID_PROVIDER',
        message: `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
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