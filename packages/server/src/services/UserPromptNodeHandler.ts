/**
 * User Prompt Node Handler
 * 
 * Handles execution of user prompt nodes within the workflow DSL system.
 * Creates structured decision points for user interaction during workflow execution.
 * Different from free-form chat - uses predefined choices for structured decisions.
 */

import {
  WorkflowDSLNode,
  WorkflowNodeResult,
  WorkflowValidationResult,
  WorkflowExecutionContext,
  UserPromptNodeParameters,
  UserPromptChoice
} from '@starships/protocol';
import { BaseWorkflowNodeHandler } from './WorkflowNodeRegistry';
import { WORKFLOW_CONFIG } from '../constants/workflow';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Structure for a workflow user prompt
 */
interface WorkflowUserPrompt {
  id: string;
  workflowId: string;
  nodeId: string;
  expeditionId: string;
  promptText: string;
  choices: UserPromptChoice[];
  sourceContext?: any;
  createdAt: string;
  expiresAt?: string;
  status: 'pending' | 'responded' | 'expired' | 'cancelled';
  response?: {
    choiceId: string;
    choiceValue: any;
    respondedAt: string;
    userId: string;
  };
}

/**
 * Handler for executing user prompt nodes
 */
export class UserPromptNodeHandler extends BaseWorkflowNodeHandler {
  readonly type = 'user_prompt';
  private logger = Logger.getInstance();
  private activePrompts: Map<string, WorkflowUserPrompt> = new Map();
  private promptResolvers: Map<string, {
    resolve: (response: any) => void;
    reject: (error: Error) => void;
  }> = new Map();

  /**
   * Execute the user prompt node
   */
  async execute(
    node: WorkflowDSLNode,
    context: WorkflowExecutionContext
  ): Promise<WorkflowNodeResult> {
    const startTime = Date.now();
    const logContext = {
      nodeId: node.id,
      nodeName: node.name,
      expeditionId: context.expeditionId,
      workflowId: context.workflowId
    };

    this.logger.info('Starting user prompt node execution', logContext);

    try {
      // Validate node parameters
      const validation = this.validate(node);
      if (!validation.valid) {
        const errors = validation.errors.map(e => e.message).join(', ');
        return this.createErrorResult(node, `Validation failed: ${errors}`);
      }

      const params = node.parameters as UserPromptNodeParameters;
      
      // Get source context if specified
      let sourceContext = null;
      if (params.sourceNodeId) {
        const sourceResult = context.previousResults.get(params.sourceNodeId);
        if (sourceResult && sourceResult.success) {
          sourceContext = sourceResult.data;
        }
      }

      // Create the user prompt
      const prompt = await this.createStructuredPrompt(
        node,
        params,
        context,
        sourceContext
      );

      this.logger.info('User prompt created, waiting for response', {
        ...logContext,
        promptId: prompt.id,
        choiceCount: params.choices.length,
        timeout: params.timeout
      });

      // Wait for user response
      const userResponse = await this.waitForUserChoice(
        prompt.id,
        params.timeout || WORKFLOW_CONFIG.USER_PROMPT_TIMEOUT_MINUTES
      );

      const duration = Date.now() - startTime;

      this.logger.info('User prompt completed', {
        ...logContext,
        promptId: prompt.id,
        responseChoiceId: userResponse.choiceId,
        duration
      });

      // Clean up
      this.cleanupPrompt(prompt.id);

      return {
        nodeId: node.id,
        success: true,
        data: {
          promptId: prompt.id,
          userChoice: userResponse.choiceId,
          choiceValue: userResponse.choiceValue,
          responseTime: userResponse.respondedAt,
          sourceContext
        },
        nextEdgeCondition: userResponse.choiceId,
        executedAt: new Date().toISOString(),
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('User prompt node execution failed', {
        ...logContext,
        error: errorMessage,
        duration
      });

      return {
        nodeId: node.id,
        success: false,
        error: errorMessage,
        executedAt: new Date().toISOString(),
        duration
      };
    }
  }

  /**
   * Create a structured user prompt
   */
  private async createStructuredPrompt(
    node: WorkflowDSLNode,
    params: UserPromptNodeParameters,
    context: WorkflowExecutionContext,
    sourceContext: any
  ): Promise<WorkflowUserPrompt> {
    const promptId = uuidv4();
    const now = new Date();
    const timeoutMinutes = params.timeout || WORKFLOW_CONFIG.USER_PROMPT_TIMEOUT_MINUTES;
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

    const prompt: WorkflowUserPrompt = {
      id: promptId,
      workflowId: context.workflowId,
      nodeId: node.id,
      expeditionId: context.expeditionId,
      promptText: params.promptText,
      choices: params.choices,
      sourceContext,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'pending'
    };

    // Store the prompt
    this.activePrompts.set(promptId, prompt);

    // TODO: In a production system, this would:
    // 1. Store the prompt in a database
    // 2. Emit WebSocket event to notify frontend
    // 3. Send notifications to relevant users
    
    this.logger.debug('Structured prompt created', {
      promptId,
      expeditionId: context.expeditionId,
      workflowId: context.workflowId,
      nodeId: node.id,
      expiresAt: expiresAt.toISOString()
    });

    // Simulate sending to frontend (in real implementation, use WebSocket)
    this.simulatePromptNotification(prompt);

    return prompt;
  }

  /**
   * Wait for user to make a choice
   */
  private async waitForUserChoice(
    promptId: string,
    timeoutMinutes: number
  ): Promise<{
    choiceId: string;
    choiceValue: any;
    respondedAt: string;
  }> {
    return new Promise((resolve, reject) => {
      // Store resolver
      this.promptResolvers.set(promptId, { resolve, reject });

      // Set timeout
      const timeoutMs = timeoutMinutes * 60 * 1000;
      setTimeout(() => {
        if (this.promptResolvers.has(promptId)) {
          this.promptResolvers.delete(promptId);
          const prompt = this.activePrompts.get(promptId);
          if (prompt) {
            prompt.status = 'expired';
          }
          reject(new Error(`User prompt timeout after ${timeoutMinutes} minutes`));
        }
      }, timeoutMs);
    });
  }

  /**
   * Handle user response to a prompt
   * This would be called by an API endpoint when user responds
   */
  public respondToPrompt(
    promptId: string,
    choiceId: string,
    userId: string
  ): boolean {
    const prompt = this.activePrompts.get(promptId);
    if (!prompt) {
      this.logger.warn('Attempted to respond to non-existent prompt', { promptId });
      return false;
    }

    if (prompt.status !== 'pending') {
      this.logger.warn('Attempted to respond to non-pending prompt', { 
        promptId, 
        status: prompt.status 
      });
      return false;
    }

    // Find the chosen option
    const choice = prompt.choices.find(c => c.id === choiceId);
    if (!choice) {
      this.logger.warn('Invalid choice ID for prompt', { promptId, choiceId });
      return false;
    }

    // Update prompt
    prompt.status = 'responded';
    prompt.response = {
      choiceId,
      choiceValue: choice.value,
      respondedAt: new Date().toISOString(),
      userId
    };

    // Resolve waiting promise
    const resolver = this.promptResolvers.get(promptId);
    if (resolver) {
      resolver.resolve({
        choiceId,
        choiceValue: choice.value,
        respondedAt: prompt.response.respondedAt
      });
      this.promptResolvers.delete(promptId);
    }

    this.logger.info('User prompt response processed', {
      promptId,
      choiceId,
      userId
    });

    return true;
  }

  /**
   * Get pending prompts for an expedition
   */
  public getPendingPromptsForExpedition(expeditionId: string): WorkflowUserPrompt[] {
    return Array.from(this.activePrompts.values())
      .filter(prompt => 
        prompt.expeditionId === expeditionId && 
        prompt.status === 'pending'
      );
  }

  /**
   * Cancel a prompt
   */
  public cancelPrompt(promptId: string): boolean {
    const prompt = this.activePrompts.get(promptId);
    if (!prompt || prompt.status !== 'pending') {
      return false;
    }

    prompt.status = 'cancelled';

    const resolver = this.promptResolvers.get(promptId);
    if (resolver) {
      resolver.reject(new Error('Prompt was cancelled'));
      this.promptResolvers.delete(promptId);
    }

    this.cleanupPrompt(promptId);
    return true;
  }

  /**
   * Clean up a completed prompt
   */
  private cleanupPrompt(promptId: string): void {
    this.activePrompts.delete(promptId);
    this.promptResolvers.delete(promptId);
  }

  /**
   * Simulate prompt notification (placeholder for real WebSocket implementation)
   */
  private simulatePromptNotification(prompt: WorkflowUserPrompt): void {
    // In a real implementation, this would:
    // 1. Emit WebSocket event to connected clients
    // 2. Send push notification to mobile apps
    // 3. Store notification in database
    
    this.logger.info('User prompt notification sent (simulated)', {
      promptId: prompt.id,
      expeditionId: prompt.expeditionId,
      workflowId: prompt.workflowId
    });
  }

  /**
   * Validate user prompt node configuration
   */
  validate(node: WorkflowDSLNode): WorkflowValidationResult {
    const baseValidation = this.validateRequiredParams(node, [
      'promptText',
      'choices'
    ]);

    if (!baseValidation.valid) {
      return baseValidation;
    }

    const params = node.parameters as UserPromptNodeParameters;
    const errors: any[] = [...baseValidation.errors];
    const warnings: any[] = [...baseValidation.warnings];
    const suggestions: any[] = [...baseValidation.suggestions];

    // Validate promptText
    if (typeof params.promptText !== 'string' || params.promptText.trim() === '') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'promptText must be a non-empty string',
        nodeId: node.id,
        severity: 'error'
      });
    }

    // Validate choices
    if (!Array.isArray(params.choices) || params.choices.length === 0) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'choices must be a non-empty array',
        nodeId: node.id,
        severity: 'error'
      });
    } else {
      // Validate each choice
      const choiceIds = new Set();
      for (let i = 0; i < params.choices.length; i++) {
        const choice = params.choices[i];
        
        if (!choice || typeof choice !== 'object') {
          errors.push({
            code: 'INVALID_PARAMETERS',
            message: `Choice at index ${i} must be an object`,
            nodeId: node.id,
            severity: 'error'
          });
          continue;
        }

        if (!choice.id || typeof choice.id !== 'string') {
          errors.push({
            code: 'INVALID_PARAMETERS',
            message: `Choice at index ${i} must have a string id`,
            nodeId: node.id,
            severity: 'error'
          });
        } else if (choiceIds.has(choice.id)) {
          errors.push({
            code: 'DUPLICATE_CHOICE_ID',
            message: `Duplicate choice ID: ${choice.id}`,
            nodeId: node.id,
            severity: 'error'
          });
        } else {
          choiceIds.add(choice.id);
        }

        if (!choice.text || typeof choice.text !== 'string') {
          errors.push({
            code: 'INVALID_PARAMETERS',
            message: `Choice at index ${i} must have a string text`,
            nodeId: node.id,
            severity: 'error'
          });
        }

        if (choice.value === undefined) {
          warnings.push({
            code: 'MISSING_CHOICE_VALUE',
            message: `Choice '${choice.id}' has no value specified`,
            nodeId: node.id,
            suggestion: 'Consider adding explicit values for routing logic'
          });
        }
      }

      // Warning for too many choices
      if (params.choices.length > 10) {
        warnings.push({
          code: 'COMPLEX_USER_INTERACTION',
          message: `${params.choices.length} choices may overwhelm the user`,
          nodeId: node.id,
          suggestion: 'Consider grouping choices or using progressive disclosure'
        });
      }
    }

    // Validate timeout
    if (params.timeout !== undefined) {
      if (typeof params.timeout !== 'number' || params.timeout <= 0) {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: 'timeout must be a positive number (minutes)',
          nodeId: node.id,
          severity: 'error'
        });
      } else if (params.timeout > 1440) { // 24 hours
        warnings.push({
          code: 'LONG_TIMEOUT',
          message: `Timeout of ${params.timeout} minutes (${Math.round(params.timeout / 60)}h) may be too long`,
          nodeId: node.id,
          suggestion: 'Consider shorter timeout or making prompt optional'
        });
      }
    }

    // Validate sourceNodeId if specified
    if (params.sourceNodeId && typeof params.sourceNodeId !== 'string') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'sourceNodeId must be a string if specified',
        nodeId: node.id,
        severity: 'error'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Generate visualization for user prompt node
   */
  getVisualization(node: WorkflowDSLNode): string {
    const params = node.parameters as UserPromptNodeParameters;
    const choiceCount = params.choices?.length || 0;
    const timeoutMinutes = params.timeout || WORKFLOW_CONFIG.USER_PROMPT_TIMEOUT_MINUTES;
    
    let visualization = `[USER PROMPT] ${node.name}\n`;
    visualization += `              Choices: ${choiceCount}\n`;
    visualization += `              Timeout: ${timeoutMinutes}m`;

    if (params.sourceNodeId) {
      visualization += `\n              Context: ${params.sourceNodeId}`;
    }

    return visualization;
  }

  /**
   * Get estimated execution time
   */
  getEstimatedTime(node: WorkflowDSLNode): number {
    if (node.estimatedTime) {
      return node.estimatedTime;
    }

    const params = node.parameters as UserPromptNodeParameters;
    const timeoutMinutes = params.timeout || WORKFLOW_CONFIG.USER_PROMPT_TIMEOUT_MINUTES;
    
    // Use timeout as estimated time, but cap it at a reasonable maximum
    return Math.min(timeoutMinutes, 60); // Max 1 hour for estimation
  }

  /**
   * Check if this handler can process the node
   */
  canHandle(node: WorkflowDSLNode): boolean {
    return node.type === 'user_prompt' && 
           node.parameters && 
           typeof node.parameters.promptText === 'string' &&
           Array.isArray(node.parameters.choices);
  }
}