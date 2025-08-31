/**
 * LLM Class
 *
 * Executable LLM (Large Language Model) that handles AI model interactions via OpenRouter.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 */

import axios, { AxiosResponse, AxiosRequestConfig, AxiosError } from 'axios';
import { LlmNodeParameters, Execution } from './types';
import { AgentMemory } from './AgentMemory';

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
   * Execute the LLM request
   */
  async execute(execution?: Execution): Promise<{ status: 'completed' | 'failed'; data?: any; error?: Error }> {
    try {
      console.log(`Executing LLM: ${this.params.model}`);

      // Build the HTTP request for OpenRouter
      const requestConfig = this.buildOpenRouterRequest(execution);
      
      // Execute request with retries
      const maxRetries = 1; // Default retry for LLM requests
      let lastError: Error | null = null;
      let response: AxiosResponse | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await axios(requestConfig);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as AxiosError;
          
          // Don't retry on certain errors
          if (axios.isCancel(error) ||
              (error as AxiosError).code === 'ECONNABORTED') {
            break;
          }
          
          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }

      if (response && response.status >= 200 && response.status < 300) {
        const llmResponse = this.extractLlmResponse(response.data);
        
        // Add LLM response to agent memory if execution context is provided
        if (execution?.agentMemory) {
          execution.agentMemory.addMessage('assistant', llmResponse, {
            model: this.params.model
          });
        }

        return {
          status: 'completed',
          data: {
            llmResponse,
            model: this.params.model,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: response.data,
            url: response.config.url
          }
        };
      } else {
        // LLM request failed
        const errorMessage = lastError?.message || response?.data?.error?.message || 'LLM request failed';
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
   * Build OpenRouter-compatible HTTP request configuration
   */
  private buildOpenRouterRequest(execution?: Execution): AxiosRequestConfig {
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
      method: 'POST',
      url: endpoint,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${OPENROUTER_API_KEY}',
        'HTTP-Referer': '${OPENROUTER_HTTP_REFERER}', // Optional: for analytics
        'X-Title': '${OPENROUTER_APP_NAME}' // Optional: for analytics
      },
      data: body,
      timeout: this.params.timeout || 60000,
      validateStatus: () => true, // Don't throw on any status code
    };
  }

  /**
   * Extract LLM response from OpenRouter response body
   */
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

  /**
   * Validate LLM configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!this.params.model) {
      errors.push('Model is required');
    }

    if (!this.params.prompt) {
      errors.push('Prompt is required');
    }

    // Parameter range validation
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