/**
 * LLM Class
 *
 * Executable LLM (Large Language Model) that handles AI model interactions via OpenRouter.
 * Uses HttpRequest under the hood for HTTP communication, similar to how Agent uses Workflow.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 */

import { LlmNodeParameters, HttpRequestNodeParameters, Execution } from './types';
import { HttpRequest } from './HttpRequest';

export class LLM {
  private params: LlmNodeParameters;

  constructor(params: LlmNodeParameters) {
    // Store LLM parameters with deep copy to avoid mutations
    this.params = {
      ...params
    };
  }

  /**
   * Get LLM model
   */
  getModel(): string {
    return this.params.model;
  }

  /**
   * Get LLM prompt
   */
  getPrompt(): string {
    return this.params.prompt;
  }

  /**
   * Get LLM parameters (read-only copy)
   */
  getParameters(): LlmNodeParameters {
    return JSON.parse(JSON.stringify(this.params));
  }

  /**
   * Get LLM timeout
   */
  getTimeout(): number | undefined {
    return this.params.timeout;
  }

  /**
   * Execute the LLM request (delegates to HttpRequest)
   */
  async execute(execution?: Execution): Promise<{ status: 'completed' | 'failed'; data?: unknown; error?: Error }> {
    try {
      console.log(`Executing LLM: ${this.params.model}`);

      // Create HttpRequest instance with current execution context (for memory integration)
      const httpRequest = new HttpRequest(this.buildHttpRequestParams(execution));
      
      // Delegate to HttpRequest for execution
      const httpResult = await httpRequest.execute();
      
      // Check if HTTP request execution was successful
      if (httpResult.status === 'completed' && httpResult.data) {
        const responseData = httpResult.data as { body: unknown; status: number; statusText: string; headers: unknown; url?: string };
        const llmResponse = this.extractLlmResponse(responseData.body);
        
        // Add LLM response to agent memory if execution context is provided
        if (execution?.agentMemory) {
          execution.agentMemory.addMessage('assistant', llmResponse, {
            model: this.params.model
          });
        }

        return {
          status: 'completed',
          data: {
            ...responseData,
            llmResponse,
            model: this.params.model
          }
        };
      } else {
        // HTTP request execution failed
        const errorMessage = httpResult.error?.message || 'LLM request failed';
        return {
          status: 'failed',
          error: new Error(`LLM request failed: ${errorMessage}`)
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'failed',
        error: new Error(`LLM execution failed: ${errorMessage}`)
      };
    }
  }

  /**
   * Build HttpRequest parameters for OpenRouter API
   */
  private buildHttpRequestParams(execution?: Execution): HttpRequestNodeParameters {
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];
    
    // Get messages from agent memory if available
    if (execution?.agentMemory) {
      const memoryMessages = execution.agentMemory.toMessages();
      messages.push(...memoryMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      })));
    }
    
    // Add current prompt as user message
    messages.push({
      role: 'user',
      content: this.params.prompt
    });

    // Build request body
    const body = {
      model: this.params.model,
      messages,
      temperature: this.params.temperature || 0.7,
      max_tokens: this.params.maxTokens || 1024,
      top_p: this.params.topP || 1.0,
      frequency_penalty: this.params.frequencyPenalty || 0,
      presence_penalty: this.params.presencePenalty || 0,
      stream: this.params.stream || false,
      // OpenRouter specific optional parameters
      transforms: [], // Can be used for prompt transforms
      route: 'fallback' // Can be 'fallback' or specific routing
    };

    return {
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.params.openrouterApiKey}`
      },
      body,
      timeout: this.params.timeout || 60000,
      retries: 1,
      followRedirects: true
    };
  }

  /**
   * Extract LLM response from OpenRouter response body
   */
  private extractLlmResponse(responseBody: unknown): string {
    try {
      // Type guard and safe access for OpenRouter OpenAI-compatible format
      if (responseBody && typeof responseBody === 'object') {
        const body = responseBody as Record<string, unknown>;
        const choices = body.choices;
        if (Array.isArray(choices) && choices[0]) {
          const choice = choices[0] as Record<string, unknown>;
          const message = choice.message;
          if (message && typeof message === 'object') {
            const messageObj = message as Record<string, unknown>;
            const content = messageObj.content;
            if (typeof content === 'string') return content;
          }
        }
        
        // Fallback: try to extract any text content
        const content = body.content;
        if (typeof content === 'string') return content;
        const text = body.text;
        if (typeof text === 'string') return text;
      }
      
      // If it's already a string, return it
      if (typeof responseBody === 'string') return responseBody;
      
      // Last resort: stringify the response
      return JSON.stringify(responseBody);
    } catch {
      // If parsing fails completely, return empty string
      return '';
    }
  }

  /**
   * Validate LLM configuration (delegates to HttpRequest validation)
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check LLM-specific required fields
    if (!this.params.model) {
      errors.push('Model is required');
    }

    if (!this.params.prompt) {
      errors.push('Prompt is required');
    }

    if (!this.params.openrouterApiKey) {
      errors.push('OpenRouter API key is required');
    }

    // LLM-specific parameter range validation
    if (this.params.temperature !== undefined && (this.params.temperature < 0 || this.params.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (this.params.maxTokens !== undefined && this.params.maxTokens < 1) {
      errors.push('Max tokens must be greater than 0');
    }

    if (this.params.topP !== undefined && (this.params.topP < 0 || this.params.topP > 1)) {
      errors.push('Top P must be between 0 and 1');
    }

    if (this.params.frequencyPenalty !== undefined && (this.params.frequencyPenalty < -2 || this.params.frequencyPenalty > 2)) {
      errors.push('Frequency penalty must be between -2 and 2');
    }

    if (this.params.presencePenalty !== undefined && (this.params.presencePenalty < -2 || this.params.presencePenalty > 2)) {
      errors.push('Presence penalty must be between -2 and 2');
    }

    // Timeout validation
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push('Timeout should be at least 1000ms');
    }

    // Delegate to HttpRequest validation for HTTP-specific validation
    if (errors.length === 0) {
      const httpRequest = new HttpRequest(this.buildHttpRequestParams());
      const httpValidation = httpRequest.validate();
      if (!httpValidation.valid) {
        errors.push(...httpValidation.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Clone LLM with the same parameters
   */
  clone(): LLM {
    const clonedParams: LlmNodeParameters = {
      ...this.params
    };

    return new LLM(clonedParams);
  }

  /**
   * Update LLM parameters
   */
  updateParameters(updates: Partial<LlmNodeParameters>): LLM {
    const updatedParams = {
      ...this.params,
      ...updates
    };

    return new LLM(updatedParams);
  }
}