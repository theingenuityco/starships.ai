/**
 * Workflow Node Registry
 * 
 * Registry pattern for managing workflow node handlers. Each node type has a corresponding
 * handler that can execute, validate, and visualize that type of node.
 */

import {
  WorkflowDSLNode,
  WorkflowNodeResult,
  WorkflowValidationResult,
  WorkflowExecutionContext
} from '@starships/protocol';

/**
 * Base interface for workflow node handlers
 */
export interface WorkflowNodeHandler {
  /** The node type this handler manages */
  readonly type: string;
  
  /** Execute the node with the given context */
  execute(
    node: WorkflowDSLNode, 
    context: WorkflowExecutionContext
  ): Promise<WorkflowNodeResult>;
  
  /** Validate the node configuration */
  validate(node: WorkflowDSLNode): WorkflowValidationResult;
  
  /** Generate visualization string for the node */
  getVisualization(node: WorkflowDSLNode): string;
  
  /** Get estimated execution time in minutes */
  getEstimatedTime?(node: WorkflowDSLNode): number;
  
  /** Check if the handler can process this node */
  canHandle(node: WorkflowDSLNode): boolean;
}

/**
 * Registry for managing workflow node handlers
 */
export class WorkflowNodeRegistry {
  private handlers: Map<string, WorkflowNodeHandler> = new Map();
  private initialized = false;

  constructor() {
    // Auto-initialize with built-in handlers when first used
  }

  /**
   * Register a node handler
   */
  register(handler: WorkflowNodeHandler): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`Overriding existing handler for node type: ${handler.type}`);
    }
    
    this.handlers.set(handler.type, handler);
    console.log(`Registered workflow node handler: ${handler.type}`);
  }

  /**
   * Get handler for a node type
   */
  getHandler(type: string): WorkflowNodeHandler | null {
    this.ensureInitialized();
    return this.handlers.get(type) || null;
  }

  /**
   * Get handler for a specific node (allows for dynamic handler selection)
   */
  getHandlerForNode(node: WorkflowDSLNode): WorkflowNodeHandler | null {
    this.ensureInitialized();
    
    // First try exact type match
    const handler = this.getHandler(node.type);
    if (handler && handler.canHandle(node)) {
      return handler;
    }
    
    // If no exact match, try all handlers
    for (const handler of Array.from(this.handlers.values())) {
      if (handler.canHandle(node)) {
        return handler;
      }
    }
    
    return null;
  }

  /**
   * Get all registered handlers
   */
  getAllHandlers(): WorkflowNodeHandler[] {
    this.ensureInitialized();
    return Array.from(this.handlers.values());
  }

  /**
   * Get all registered handler types
   */
  getSupportedTypes(): string[] {
    this.ensureInitialized();
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a node type is supported
   */
  isSupported(type: string): boolean {
    this.ensureInitialized();
    return this.handlers.has(type);
  }

  /**
   * Unregister a handler
   */
  unregister(type: string): boolean {
    const result = this.handlers.delete(type);
    if (result) {
      console.log(`Unregistered workflow node handler: ${type}`);
    }
    return result;
  }

  /**
   * Clear all handlers and prevent auto-initialization
   */
  clear(): void {
    this.handlers.clear();
    this.initialized = true; // Set to true to prevent auto-initialization
    console.log('Cleared all workflow node handlers');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalHandlers: number;
    supportedTypes: string[];
    initialized: boolean;
  } {
    return {
      totalHandlers: this.handlers.size,
      supportedTypes: this.getSupportedTypes(),
      initialized: this.initialized
    };
  }

  /**
   * Initialize built-in handlers (will be called automatically)
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initializeBuiltInHandlers();
      this.initialized = true;
    }
  }

  /**
   * Initialize built-in handlers
   */
  private initializeBuiltInHandlers(): void {
    // Register built-in handlers
    try {
      // Import and register handlers
      const { AgentNodeHandler } = require('./AgentNodeHandler');
      const { ConditionalNodeHandler } = require('./ConditionalNodeHandler');
      const { UserPromptNodeHandler } = require('./UserPromptNodeHandler');
      const { StartNodeHandler, EndNodeHandler, OutputNodeHandler } = require('./BasicNodeHandlers');
      
      this.register(new AgentNodeHandler());
      this.register(new ConditionalNodeHandler());
      this.register(new UserPromptNodeHandler());
      this.register(new StartNodeHandler());
      this.register(new EndNodeHandler());
      this.register(new OutputNodeHandler());
      
      console.log('WorkflowNodeRegistry initialized with built-in handlers');
    } catch (error) {
      console.error('Some built-in handlers failed to load:', error);
      console.error('WorkflowNodeRegistry initialized (partial)');
      // Re-throw so tests can see the error
      throw error;
    }
  }

  /**
   * Validate that all required handlers are registered
   */
  validateRequiredHandlers(requiredTypes: string[]): {
    valid: boolean;
    missing: string[];
  } {
    this.ensureInitialized();
    
    const missing = requiredTypes.filter(type => !this.isSupported(type));
    
    return {
      valid: missing.length === 0,
      missing
    };
  }
}

/**
 * Singleton instance of the workflow node registry
 */
export const workflowNodeRegistry = new WorkflowNodeRegistry();

/**
 * Abstract base class for node handlers (optional convenience)
 */
export abstract class BaseWorkflowNodeHandler implements WorkflowNodeHandler {
  abstract readonly type: string;
  
  abstract execute(
    node: WorkflowDSLNode, 
    context: WorkflowExecutionContext
  ): Promise<WorkflowNodeResult>;
  
  abstract validate(node: WorkflowDSLNode): WorkflowValidationResult;
  
  /**
   * Default visualization implementation
   */
  getVisualization(node: WorkflowDSLNode): string {
    const timeStr = node.estimatedTime ? ` (${node.estimatedTime}m)` : '';
    return `[${node.type.toUpperCase()}] ${node.name}${timeStr}`;
  }

  /**
   * Default estimated time implementation
   */
  getEstimatedTime(node: WorkflowDSLNode): number {
    return node.estimatedTime || 10; // Default 10 minutes
  }

  /**
   * Default canHandle implementation - checks type match
   */
  canHandle(node: WorkflowDSLNode): boolean {
    return node.type === this.type;
  }

  /**
   * Helper method to create successful result
   */
  protected createSuccessResult(
    node: WorkflowDSLNode,
    data?: any,
    nextEdgeCondition?: string
  ): WorkflowNodeResult {
    return {
      nodeId: node.id,
      success: true,
      data,
      nextEdgeCondition,
      executedAt: new Date().toISOString(),
      duration: 0 // Will be set by execution service
    };
  }

  /**
   * Helper method to create error result
   */
  protected createErrorResult(
    node: WorkflowDSLNode,
    error: string
  ): WorkflowNodeResult {
    return {
      nodeId: node.id,
      success: false,
      error,
      executedAt: new Date().toISOString(),
      duration: 0
    };
  }

  /**
   * Helper method to validate required parameters
   */
  protected validateRequiredParams(
    node: WorkflowDSLNode,
    requiredParams: string[]
  ): WorkflowValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    for (const param of requiredParams) {
      if (!node.parameters[param]) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          message: `Required parameter '${param}' is missing`,
          nodeId: node.id,
          severity: 'error'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }
}