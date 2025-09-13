/**
 * LLM Node Handler
 *
 * Simple wrapper around LLM class - delegates all logic to LLM
 * Handles only streaming emitter integration
 */

import { LLM } from '@/LLM';
import { BaseHandler } from '@/nodes/Handler';
import { Execution, LlmParams, ValidationResult } from '@/types';
import { EventCallback } from '@/types/emitters';

export class LlmHandler extends BaseHandler {
  readonly type = 'llm';
  private eventCallback?: EventCallback;

  /**
   * Set streaming emitter for content streaming
   */
  setStreamingEmitter(cb?: EventCallback): void {
    this.eventCallback = cb;
  }

  async execute(execution: Execution) {
    const params = this.node.parameters as LlmParams;

    // Create LLM instance and execute - delegate all logic to LLM
    const llm = new LLM(params);
    const llmResult = await llm.execute({
      streamingCallbacks: this.createStreamingCallbacks(execution, params),
    });

    // Simple result mapping - no additional logic
    if (llmResult.status === 'completed') {
      const baseData = llmResult.data && typeof llmResult.data === 'object' ? (llmResult.data as Record<string, unknown>) : {};
      return this.createSuccessResult(execution, baseData);
    } else {
      return this.createErrorResult(execution, llmResult.error?.message || 'LLM execution failed');
    }
  }

  /**
   * Create streaming callbacks for emitter integration
   */
  private createStreamingCallbacks(execution: Execution, params: LlmParams) {
    if (!this.eventCallback) return undefined;

    return {
      onChunk: async (content: string, accumulated: string) => {
        await this.eventCallback({
          type: 'content_chunk',
          execution,
          timestamp: new Date().toISOString(),
        });
      },
      onComplete: async (finalContent: string) => {
        await this.eventCallback({
          type: 'content_complete',
          execution,
          timestamp: new Date().toISOString(),
          content: finalContent,
        });
      },
    };
  }

  validate(): ValidationResult {
    const params = this.node.parameters as LlmParams;

    // Delegate validation entirely to LLM class
    const llm = new LLM(params);
    const llmValidation = llm.validate();

    // LLM validation already returns ValidationError objects, so pass them through
    return {
      valid: llmValidation.valid,
      errors: llmValidation.errors || [],
      warnings: [],
      suggestions: [],
    };
  }

  getIcon(): string {
    return 'brain';
  }
}
