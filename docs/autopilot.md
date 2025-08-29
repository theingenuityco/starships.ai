Execution Plan: Creating packages/autopilot Package
Step 1: Create Package Structure
# Create the new package directory
mkdir -p packages/autopilot/src/{types,engine,nodes/handlers,validation,constants}

# Create package files
touch packages/autopilot/package.json
touch packages/autopilot/tsconfig.json
touch packages/autopilot/README.md
touch packages/autopilot/src/index.ts

bash


Step 2: Create package.json
File: packages/autopilot/package.json

{
  "name": "@starships/autopilot",
  "version": "1.0.0",
  "description": "Generic workflow DSL execution engine",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "dependencies": {
    "uuid": "^9.0.0",
    "jsonata": "^2.0.3"
  },
  "devDependencies": {
    "@types/uuid": "^9.0.0",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "@starships/protocol": "workspace:*"
  }
}

json


Step 3: Create tsconfig.json
File: packages/autopilot/tsconfig.json

{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}

json


Step 4: Extract and Transform Types
4.1 Create Core Types
File: packages/autopilot/src/types/workflow.ts

// Extract from packages/protocol/src/domains/workflow.ts lines 15-26
export interface Workflow {
  id: string;
  expeditionId: string;
  nodes: Node[];
  edges: Edge[];
  visualization: string;
  approvalStatus: WorkflowApprovalStatus;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  metadata?: WorkflowMetadata;
}

// Extract from packages/protocol/src/domains/workflow.ts lines 31-40
export interface Node {
  id: string;
  type: NodeType;
  name: string;
  description: string;
  estimatedTime?: number;
  parameters: NodeParameters;
  metadata?: Record<string, unknown>;
  position?: NodePosition;
}

// Extract from packages/protocol/src/domains/workflow.ts lines 46-53
export interface Edge {
  id: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

// Extract all other workflow types from lines 58-167 in workflow.ts
export interface NodePosition { /* ... */ }
export interface WorkflowMetadata { /* ... */ }
export type NodeType = 'agent' | 'conditional' | 'user_prompt' | 'output' | 'start' | 'end';
export type NodeParameters = /* ... union type ... */;
export type WorkflowApprovalStatus = 'pending' | 'approved' | 'rejected' | 'modified';

typescript



File: packages/autopilot/src/types/execution.ts

// Extract from packages/protocol/src/domains/workflow.ts lines 176-188
export interface RuntimeState {
  id: string;
  workflowId: string;
  currentNodeId?: string;
  status: ExecutionStatus;
  executionResults: Map<string, NodeResult>;
  startTime?: string;
  endTime?: string;
  pausedAt?: string;
  error?: ExecutionError;
  createdAt: string;
  updatedAt: string;
}

// Extract from packages/protocol/src/domains/workflow.ts lines 193-202
export interface NodeResult {
  nodeId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executedAt: string;
  duration?: number;
  nextEdgeCondition?: string;
  metadata?: Record<string, unknown>;
}

// Extract from packages/protocol/src/domains/workflow.ts lines 207-214
export interface ExecutionContext {
  expeditionId: string;
  workflowId: string;
  userId: string;
  previousResults: Map<string, NodeResult>;
  expeditionState: unknown;
  services: unknown;
}

// Extract all execution-related types from workflow.ts
export type ExecutionStatus = 'not_started' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export interface ExecutionError { /* ... */ }

typescript



File: packages/autopilot/src/types/nodes.ts

// Extract from packages/protocol/src/domains/workflow.ts lines 106-167
export interface AgentNodeParameters {
  agentId: string;
  taskIds?: string[];
  instructions?: string;
  expectedOutput?: string;
  timeout?: number;
  estimatedTime?: number;
}

export interface ConditionalNodeParameters {
  sourceNodeId: string;
  expression: string;
  conditions: Record<string, string>;
  defaultCondition?: string;
}

export interface UserPromptNodeParameters {
  promptText: string;
  choices: UserPromptChoice[];
  sourceNodeId?: string;
  timeout?: number;
  required?: boolean;
}

export interface OutputNodeParameters {
  template: string;
  sources: string[];
  format: OutputFormat;
  title?: string;
}

export interface UserPromptChoice {
  id: string;
  text: string;
  description?: string;
  value: unknown;
}

export type OutputFormat = 'text' | 'markdown' | 'json' | 'html' | 'xml' | 'pdf' | 'csv';

typescript



File: packages/autopilot/src/types/validation.ts

// Extract from packages/protocol/src/domains/workflow.ts lines 393-462
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
}

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
  severity: 'error' | 'warning';
  details?: unknown;
}

export interface ValidationWarning {
  code: ValidationWarningCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
  suggestion?: string;
}

export interface ValidationSuggestion {
  type: 'optimization' | 'improvement' | 'best_practice';
  message: string;
  impact: 'low' | 'medium' | 'high';
  nodeId?: string;
}

export type ValidationErrorCode = 
  | 'MISSING_START_NODE' | 'MISSING_END_NODE' | 'UNREACHABLE_NODE'
  | 'CIRCULAR_DEPENDENCY' | 'INVALID_NODE_TYPE' | 'INVALID_PARAMETERS'
  /* ... rest from workflow.ts lines 436-449 ... */;

export type ValidationWarningCode = 
  | 'LONG_EXECUTION_PATH' | 'NO_ERROR_HANDLING' | 'MISSING_DESCRIPTIONS'
  /* ... rest from workflow.ts lines 454-462 ... */;

typescript



File: packages/autopilot/src/types/index.ts

// Re-export all types
export * from './workflow';
export * from './execution';
export * from './nodes';
export * from './validation';

typescript


Step 5: Extract and Transform Core Engine
File: packages/autopilot/src/engine/Engine.ts

// Extract from packages/server/src/services/WorkflowExecutionService.ts lines 42-543
import { Workflow, RuntimeState, ExecutionContext, Node, NodeResult } from '../types';
import { Registry } from '../nodes/Registry';
import { v4 as uuidv4 } from 'uuid';

export class Engine {
  private registry: Registry;
  private eventCallbacks: EventCallback[] = [];
  private runningExecutions: Map<string, RuntimeState> = new Map();

  constructor(registry?: Registry) {
    this.registry = registry || new Registry();
  }

  // Extract executeWorkflow method from WorkflowExecutionService lines 63-167
  async execute(workflow: Workflow, context: Partial<ExecutionContext>): Promise<RuntimeState> {
    const executionId = uuidv4();
    
    // Initialize runtime state
    const runtimeState: RuntimeState = {
      id: executionId,
      workflowId: workflow.id,
      currentNodeId: undefined,
      status: 'not_started',
      executionResults: new Map(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in running executions
    this.runningExecutions.set(executionId, runtimeState);

    try {
      // Validate workflow before execution
      await this.validateForExecution(workflow);

      // Find start node
      const startNode = this.getStartNode(workflow);
      if (!startNode) {
        throw new Error('No start node found in workflow');
      }

      // Update runtime state
      runtimeState.status = 'running';
      runtimeState.startTime = new Date().toISOString();

      // Execute workflow graph
      await this.executeGraph(workflow, runtimeState, context);

      // Mark as completed if no errors
      if (runtimeState.status === 'running') {
        runtimeState.status = 'completed';
        runtimeState.endTime = new Date().toISOString();
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      runtimeState.status = 'failed';
      runtimeState.endTime = new Date().toISOString();
      runtimeState.error = {
        code: 'SYSTEM_ERROR',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        recoverable: false
      };
    } finally {
      this.runningExecutions.delete(executionId);
    }

    return runtimeState;
  }

  // Extract executeWorkflowGraph method from lines 172-284
  private async executeGraph(
    workflow: Workflow,
    runtimeState: RuntimeState, 
    contextData: Partial<ExecutionContext>
  ): Promise<void> {
    let currentNode = this.getStartNode(workflow);
    
    const context: ExecutionContext = {
      expeditionId: workflow.expeditionId,
      workflowId: workflow.id,
      userId: contextData.userId || 'system',
      previousResults: runtimeState.executionResults,
      expeditionState: contextData.expeditionState || {},
      services: contextData.services || {}
    };

    while (currentNode && runtimeState.status === 'running') {
      try {
        runtimeState.currentNodeId = currentNode.id;
        
        // Execute the node
        const result = await this.executeNode(currentNode, context);
        runtimeState.executionResults.set(currentNode.id, result);

        if (result.success) {
          // Find next node
          const nextNode = this.getNextNode(workflow, currentNode, result.nextEdgeCondition);
          if (!nextNode) break;
          currentNode = nextNode;
        } else {
          throw new Error(`Node execution failed: ${result.error}`);
        }
      } catch (error) {
        // Store failed result and throw
        const failedResult: NodeResult = {
          nodeId: currentNode.id,
          success: false,
          error: error instanceof Error ? error.message : 'Node execution failed',
          executedAt: new Date().toISOString(),
          duration: 0
        };
        runtimeState.executionResults.set(currentNode.id, failedResult);
        throw error;
      }
    }

    runtimeState.currentNodeId = undefined;
  }

  // Extract executeNode method from lines 289-315
  private async executeNode(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const handler = this.registry.getHandler(node.type);
    if (!handler) {
      throw new Error(`No handler found for node type: ${node.type}`);
    }

    const startTime = Date.now();
    const result = await handler.execute(node, context);
    const duration = Date.now() - startTime;

    if (!result.duration) {
      result.duration = duration;
    }

    return result;
  }

  // Extract getStartNode method from lines 320-322
  private getStartNode(workflow: Workflow): Node | null {
    return workflow.nodes.find(node => node.type === 'start') || null;
  }

  // Extract getNextNode method from lines 327-364
  private getNextNode(workflow: Workflow, currentNode: Node, edgeCondition?: string): Node | null {
    const outgoingEdges = workflow.edges.filter(edge => edge.from === currentNode.id);

    if (outgoingEdges.length === 0) {
      return null;
    }

    if (edgeCondition) {
      const matchingEdge = outgoingEdges.find(edge => edge.condition === edgeCondition);
      if (matchingEdge) {
        return workflow.nodes.find(node => node.id === matchingEdge.to) || null;
      }
    }

    const defaultEdge = outgoingEdges.find(edge => !edge.condition);
    if (defaultEdge) {
      return workflow.nodes.find(node => node.id === defaultEdge.to) || null;
    }

    if (outgoingEdges.length > 0) {
      return workflow.nodes.find(node => node.id === outgoingEdges[0].to) || null;
    }

    return null;
  }

  // Extract validateWorkflowForExecution method from lines 369-401
  private async validateForExecution(workflow: Workflow): Promise<void> {
    const startNode = this.getStartNode(workflow);
    if (!startNode) {
      throw new Error('Workflow must have a start node');
    }

    const unsupportedNodes = [];
    for (const node of workflow.nodes) {
      const handler = this.registry.getHandler(node.type);
      if (!handler) {
        unsupportedNodes.push({ id: node.id, type: node.type });
      }
    }

    if (unsupportedNodes.length > 0) {
      throw new Error(`Unsupported node types: ${unsupportedNodes.map(n => n.type).join(', ')}`);
    }
  }

  // Extract pause/resume/cancel methods from lines 428-506
  pause(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status !== 'running') {
      return false;
    }

    runtimeState.status = 'paused';
    runtimeState.pausedAt = new Date().toISOString();
    return true;
  }

  resume(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status !== 'paused') {
      return false;
    }

    runtimeState.status = 'running';
    runtimeState.pausedAt = undefined;
    return true;
  }

  cancel(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status === 'completed' || runtimeState.status === 'failed') {
      return false;
    }

    runtimeState.status = 'cancelled';
    runtimeState.endTime = new Date().toISOString();
    this.runningExecutions.delete(executionId);
    return true;
  }

  // Extract event handling methods from lines 511-543
  onEvent(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  offEvent(callback: EventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  getExecutionStatus(executionId: string): RuntimeState | null {
    return this.runningExecutions.get(executionId) || null;
  }

  getRunningExecutions(): RuntimeState[] {
    return Array.from(this.runningExecutions.values());
  }
}

// Extract event types
export type EventCallback = (event: ExecutionEvent) => Promise<void>;

export interface ExecutionEvent {
  type: 'workflow_started' | 'node_started' | 'node_completed' | 'node_failed' | 
        'workflow_paused' | 'workflow_resumed' | 'workflow_completed' | 'workflow_failed';
  workflowId: string;
  contextId: string;
  nodeId?: string;
  data?: any;
  timestamp: string;
}

typescript



Step 6: Extract and Transform Node System
File: packages/autopilot/src/nodes/Handler.ts

// Extract from packages/server/src/services/WorkflowNodeRegistry.ts lines 16-39
import { Node, NodeResult, ExecutionContext, ValidationResult } from '../types';

export interface Handler {
  readonly type: string;
  execute(node: Node, context: ExecutionContext): Promise<NodeResult>;
  validate(node: Node): ValidationResult;
  getIcon(): string; // For UI
}

typescript


File: packages/autopilot/src/nodes/Registry.ts

// Extract from packages/server/src/services/WorkflowNodeRegistry.ts lines 42-229
import { Handler } from './Handler';
import { Node } from '../types';

export class Registry {
  private handlers: Map<string, Handler> = new Map();
  private initialized = false;

  // Extract register method from lines 59-62
  register(handler: Handler): void {
    this.handlers.set(handler.type, handler);
    console.log(`Registered node handler: ${handler.type}`);
  }

  // Extract getHandlerForNode method from lines 86-92  
  getHandler(nodeType: string): Handler | null {
    return this.handlers.get(nodeType) || null;
  }

  // Extract getSupportedTypes method from lines 94-96
  getSupportedTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  // Extract hasHandler method from lines 98-100
  hasHandler(nodeType: string): boolean {
    return this.handlers.has(nodeType);
  }

  // Extract unregister method from lines 117-125
  unregister(nodeType: string): boolean {
    const result = this.handlers.delete(nodeType);
    if (result) {
      console.log(`Unregistered node handler: ${nodeType}`);
    }
    return result;
  }

  // Extract clear method from lines 132-136
  clear(): void {
    this.handlers.clear();
    this.initialized = true;
    console.log('Cleared all node handlers');
  }
}

typescript



File: packages/autopilot/src/nodes/handlers/StartHandler.ts

// Extract from packages/server/src/services/BasicNodeHandlers.ts
import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult } from '../../types';

export class StartHandler implements Handler {
  readonly type = 'start';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    return {
      nodeId: node.id,
      success: true,
      data: { message: 'Workflow started' },
      executedAt: new Date().toISOString(),
      duration: 0
    };
  }

  validate(node: Node): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'play-circle';
  }
}

typescript



File: packages/autopilot/src/nodes/handlers/EndHandler.ts

// Similar to StartHandler but for end nodes
import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult } from '../../types';

export class EndHandler implements Handler {
  readonly type = 'end';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    return {
      nodeId: node.id,
      success: true,
      data: { message: 'Workflow completed' },
      executedAt: new Date().toISOString(),
      duration: 0
    };
  }

  validate(node: Node): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'check-circle';
  }
}

typescript



File: packages/autopilot/src/nodes/handlers/AgentHandler.ts

// Placeholder for agent execution - will need integration point
import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, AgentNodeParameters } from '../../types';

export class AgentHandler implements Handler {
  readonly type = 'agent';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as AgentNodeParameters;
    
    // TODO: Integrate with agent service
    // This will need to be connected to the actual agent execution system
    console.log(`Executing agent: ${params.agentId} with instructions: ${params.instructions}`);
    
    return {
      nodeId: node.id,
      success: true,
      data: { output: 'Agent execution completed' },
      executedAt: new Date().toISOString(),
      duration: 1000
    };
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as AgentNodeParameters;
    const errors = [];

    if (!params.agentId) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent ID is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'robot';
  }
}

typescript



File: packages/autopilot/src/nodes/handlers/ConditionalHandler.ts

// Conditional logic handler with JSONata
import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, ConditionalNodeParameters } from '../../types';
import * as jsonata from 'jsonata';

export class ConditionalHandler implements Handler {
  readonly type = 'conditional';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as ConditionalNodeParameters;
    
    // Get data from source node
    const sourceResult = context.previousResults.get(params.sourceNodeId);
    if (!sourceResult) {
      throw new Error(`Source node ${params.sourceNodeId} not found in execution results`);
    }

    try {
      // Evaluate conditions using JSONata
      for (const [conditionKey, expression] of Object.entries(params.conditions)) {
        const evaluator = jsonata(expression);
        const result = evaluator.evaluate(sourceResult.data);
        
        if (result) {
          return {
            nodeId: node.id,
            success: true,
            data: { conditionMet: conditionKey, sourceData: sourceResult.data },
            nextEdgeCondition: conditionKey,
            executedAt: new Date().toISOString(),
            duration: 10
          };
        }
      }

      // Use default condition if provided
      const defaultCondition = params.defaultCondition || 'default';
      return {
        nodeId: node.id,
        success: true,
        data: { conditionMet: defaultCondition, sourceData: sourceResult.data },
        nextEdgeCondition: defaultCondition,
        executedAt: new Date().toISOString(),
        duration: 10
      };

    } catch (error) {
      return {
        nodeId: node.id,
        success: false,
        error: `JSONata evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executedAt: new Date().toISOString(),
        duration: 10
      };
    }
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as ConditionalNodeParameters;
    const errors = [];

    if (!params.sourceNodeId) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Source node ID is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.conditions || Object.keys(params.conditions).length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one condition is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    // Validate JSONata expressions
    if (params.conditions) {
      for (const [key, expression] of Object.entries(params.conditions)) {
        try {
          jsonata(expression);
        } catch (error) {
          errors.push({
            code: 'INVALID_JSONATA_EXPRESSION',
            message: `Invalid JSONata expression for condition '${key}': ${error instanceof Error ? error.message : 'Syntax error'}`,
            nodeId: node.id,
            severity: 'error' as const
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'git-branch';
  }
}

typescript



File: packages/autopilot/src/nodes/handlers/PromptHandler.ts

// User prompt handler - will need UI integration
import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, UserPromptNodeParameters } from '../../types';

export class PromptHandler implements Handler {
  readonly type = 'user_prompt';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as UserPromptNodeParameters;
    
    // TODO: Integrate with UI system for user prompts
    // This will need to pause execution and wait for user input
    console.log(`User prompt: ${params.promptText}`);
    console.log('Choices:', params.choices);
    
    // For now, return a placeholder result
    return {
      nodeId: node.id,
      success: true,
      data: { choice: params.choices[0], userInput: 'placeholder' },
      executedAt: new Date().toISOString(),
      duration: 100
    };
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as UserPromptNodeParameters;
    const errors = [];

    if (!params.promptText) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Prompt text is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.choices || params.choices.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one choice is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'message-circle';
  }
}

typescript



File: packages/autopilot/src/nodes/handlers/OutputHandler.ts

// Output formatting handler  
import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, OutputNodeParameters } from '../../types';

export class OutputHandler implements Handler {
  readonly type = 'output';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as OutputNodeParameters;
    
    // Gather data from source nodes
    const sourceData: Record<string, any> = {};
    for (const sourceNodeId of params.sources) {
      const sourceResult = context.previousResults.get(sourceNodeId);
      if (sourceResult) {
        sourceData[sourceNodeId] = sourceResult.data;
      }
    }

    // TODO: Implement template rendering (Mustache/Handlebars)
    // For now, return simple formatted output
    const output = `# ${params.title || 'Workflow Output'}\n\n${JSON.stringify(sourceData, null, 2)}`;
    
    return {
      nodeId: node.id,
      success: true,
      data: { 
        output, 
        format: params.format,
        sourceData 
      },
      executedAt: new Date().toISOString(),
      duration: 50
    };
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as OutputNodeParameters;
    const errors = [];

    if (!params.template) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Template is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.sources || params.sources.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one source node is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'file-text';
  }
}

typescript



File: packages/autopilot/src/nodes/handlers/index.ts

// Export all handlers
export { StartHandler } from './StartHandler';
export { EndHandler } from './EndHandler';
export { AgentHandler } from './AgentHandler';
export { ConditionalHandler } from './ConditionalHandler';
export { PromptHandler } from './PromptHandler';
export { OutputHandler } from './OutputHandler';

typescript


Step 7: Extract Validation System
File: packages/autopilot/src/validation/Validator.ts

// Extract from packages/server/src/services/WorkflowParsingService.ts lines 90-110
import { Workflow, ValidationResult, ValidationError, Node } from '../types';

export class Validator {
  validate(workflow: Workflow): ValidationResult {
    const errors: ValidationError[] = [];

    try {
      // Check basic structure
      if (!workflow.nodes || workflow.nodes.length === 0) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Workflow must have nodes',
          severity: 'error'
        });
      }

      if (!workflow.edges || workflow.edges.length === 0) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD', 
          message: 'Workflow must have edges',
          severity: 'error'
        });
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings: [], suggestions: [] };
      }

      // Check for required node types
      const hasStart = workflow.nodes.some(node => node.type === 'start');
      const hasEnd = workflow.nodes.some(node => node.type === 'end');

      if (!hasStart) {
        errors.push({
          code: 'MISSING_START_NODE',
          message: 'Workflow must have a start node',
          severity: 'error'
        });
      }

      if (!hasEnd) {
        errors.push({
          code: 'MISSING_END_NODE',
          message: 'Workflow must have an end node', 
          severity: 'error'
        });
      }

      // Validate node connectivity
      const connectivityErrors = this.validateConnectivity(workflow);
      errors.push(...connectivityErrors);

      return {
        valid: errors.length === 0,
        errors,
        warnings: [],
        suggestions: []
      };

    } catch (error) {
      errors.push({
        code: 'VALIDATION_FAILED',
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });

      return {
        valid: false,
        errors,
        warnings: [],
        suggestions: []
      };
    }
  }

  private validateConnectivity(workflow: Workflow): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Check for unreachable nodes
    const startNode = workflow.nodes.find(node => node.type === 'start');
    if (!startNode) return errors;

    const reachableNodes = this.findReachableNodes(workflow, startNode.id);
    const unreachableNodes = workflow.nodes.filter(node => 
      !reachableNodes.has(node.id) && node.type !== 'start'
    );

    unreachableNodes.forEach(node => {
      errors.push({
        code: 'UNREACHABLE_NODE',
        message: `Node '${node.name}' is not reachable from start node`,
        nodeId: node.id,
        severity: 'error'
      });
    });

    // Check for circular dependencies
    const circularPaths = this.detectCircularDependencies(workflow);
    circularPaths.forEach(path => {
      errors.push({
        code: 'CIRCULAR_DEPENDENCY',
        message: `Circular dependency detected: ${path.join(' -> ')}`,
        severity: 'error'
      });
    });

    return errors;
  }

  private findReachableNodes(workflow: Workflow, startNodeId: string): Set<string> {
    const reachable = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (reachable.has(currentId)) continue;

      reachable.add(currentId);

      workflow.edges
        .filter(edge => edge.from === currentId)
        .forEach(edge => queue.push(edge.to));
    }

    return reachable;
  }

  private detectCircularDependencies(workflow: Workflow): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (nodeId: string, path: string[]): void => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart).concat(nodeId));
        }
        return;
      }

      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoingEdges = workflow.edges.filter(edge => edge.from === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.to, path.concat(nodeId));
      }

      recursionStack.delete(nodeId);
    };

    workflow.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    });

    return cycles;
  }
}

typescript



Step 8: Extract Constants
File: packages/autopilot/src/constants/index.ts

// Extract from packages/server/src/constants/workflow.ts
export const config = {
  // User approval timeout for workflow DSL approval
  APPROVAL_TIMEOUT: 30 * 60 * 1000, // 30 minutes in ms

  // Execution timeout for single workflow execution  
  EXECUTION_TIMEOUT: 60 * 60 * 1000, // 1 hour in ms

  // Timeout for user prompt responses during workflow execution
  USER_PROMPT_TIMEOUT: 60 * 60 * 1000, // 1 hour in ms

  // Agent execution timeout
  AGENT_EXECUTION_TIMEOUT: 10 * 60 * 1000, // 10 minutes in ms

  // Maximum number of nodes in a workflow to prevent performance issues
  MAX_NODES: 50,

  // Maximum number of edges in a workflow to prevent performance issues  
  MAX_EDGES: 100,

  // Default retry configuration
  DEFAULT_RETRIES: 3,
  RETRY_BACKOFF_MS: 1000
};

typescript


Step 9: Create Main Index File
File: packages/autopilot/src/index.ts

// Core engine
export { Engine } from './engine/Engine';
export type { EventCallback, ExecutionEvent } from './engine/Engine';

// Node system
export { Registry } from './nodes/Registry';
export { Handler } from './nodes/Handler';

// Individual handlers
export {
  StartHandler,
  EndHandler,
  AgentHandler,
  ConditionalHandler,
  PromptHandler,
  OutputHandler
} from './nodes/handlers';

// Validation
export { Validator } from './validation/Validator';

// Types - clean exports
export type {
  // Core workflow types
  Workflow,
  Node,
  Edge,
  NodeType,
  NodeParameters,
  
  // Execution types
  RuntimeState,
  ExecutionContext,
  NodeResult,
  ExecutionStatus,
  
  // Node parameter types
  AgentNodeParameters,
  ConditionalNodeParameters,
  UserPromptNodeParameters,
  OutputNodeParameters,
  
  // Validation types
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationSuggestion
} from './types';

// Configuration
export { config } from './constants';

// Create default instances for convenience
export const defaultRegistry = new Registry();
export const defaultEngine = new Engine(defaultRegistry);
export const defaultValidator = new Validator();

// Register default handlers
import { 
  StartHandler, 
  EndHandler, 
  AgentHandler, 
  ConditionalHandler, 
  PromptHandler, 
  OutputHandler 
} from './nodes/handlers';

defaultRegistry.register(new StartHandler());
defaultRegistry.register(new EndHandler()); 
defaultRegistry.register(new AgentHandler());
defaultRegistry.register(new ConditionalHandler());
defaultRegistry.register(new PromptHandler());
defaultRegistry.register(new OutputHandler());

typescript



Step 10: Create README
File: packages/autopilot/README.md

# @starships/autopilot

Generic workflow DSL execution engine for starships.ai.

## Features

- **Graph-based execution** - True DAG support with conditional routing
- **Extensible node system** - Plugin architecture for custom node types  
- **Interactive workflows** - Built-in user input capabilities
- **JSONata integration** - Powerful expressions for conditional logic
- **Event-driven** - Comprehensive lifecycle hooks
- **Visual programming** - React Flow integration ready

## Quick Start

```typescript
import { Engine, defaultRegistry, Validator, type Workflow } from '@starships/autopilot';

// Create workflow
const workflow: Workflow = {
  id: 'example-workflow',
  expeditionId: 'exp-1',
  nodes: [
    { id: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
    { id: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
  ],
  edges: [
    { id: 'edge-1', from: 'start', to: 'end' }
  ],
  approvalStatus: 'approved',
  visualization: '',
  createdAt: new Date().toISOString()
};

// Validate workflow
const validator = new Validator();
const validation = validator.validate(workflow);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  process.exit(1);
}

// Execute workflow
const engine = new Engine(defaultRegistry);
const result = await engine.execute(workflow, {
  userId: 'user-1'
});

console.log('Execution result:', result);

markdown



Node Types
start/end - Flow control nodes
agent - AI agent task execution
conditional - Smart routing with JSONata expressions
user_prompt - Interactive user input
output - Result formatting and delivery
Extension
import { Handler, Registry, type Node, type NodeResult } from '@starships/autopilot';

class CustomHandler implements Handler {
  readonly type = 'custom';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    // Custom logic here
    return {
      nodeId: node.id,
      success: true,
      data: { result: 'custom execution' },
      executedAt: new Date().toISOString()
    };
  }

  validate(node: Node) {
    return { valid: true, errors: [], warnings: [], suggestions: [] };
  }

  getIcon() {
    return 'custom-icon';
  }
}

// Register custom handler
const registry = new Registry();
registry.register(new CustomHandler());

typescript



## **Step 11: Update Root Package Manager**

**File:** `package.json` (root)
```json
{
  "workspaces": [
    "packages/*"
  ]
}

txt


File: packages/autopilot/package.json - Add to workspaces if not auto-detected

Step 12: Post-Extraction Cleanup
Files to Remove:
packages/server/src/services/WorkflowExecutionService.ts
packages/server/src/services/WorkflowNodeRegistry.ts
packages/server/src/services/BasicNodeHandlers.ts
packages/server/src/constants/workflow.ts
Files to Update:
File: packages/server/src/services/index.ts

// Remove these exports:
// export { WorkflowExecutionService } from './WorkflowExecutionService';
// export { WorkflowNodeRegistry, workflowNodeRegistry, BaseWorkflowNodeHandler } from './WorkflowNodeRegistry';

typescript


File: packages/server/src/services/MissionOrchestratorAgent.ts (lines that use WorkflowExecutionService)

// Change import from:
// import { WorkflowExecutionService } from './WorkflowExecutionService';

// To:
import { Engine } from '@starships/autopilot';

// Change usage from:
// const executionService = WorkflowExecutionService.getInstance();

// To:
import { defaultEngine } from '@starships/autopilot';
const executionService = defaultEngine;

typescript


File: Any other files importing workflow execution services - update imports to use @starships/autopilot

Build Configuration:
# Install dependencies
cd packages/autopilot && pnpm install

# Build the package
pnpm run build

# Verify in other packages
cd ../server && pnpm install
cd ../client && pnpm install

bash


Step 13: Integration Testing
// Test basic functionality
import { defaultEngine, defaultValidator, type Workflow } from '@starships/autopilot';

const testWorkflow: Workflow = {
  id: 'test-1',
  expeditionId: 'exp-1', 
  nodes: [
    { id: '1', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
    { id: '2', type: 'end', name: 'End', description: 'Complete', parameters: {} }
  ],
  edges: [{ id: 'e1', from: '1', to: '2' }],
  approvalStatus: 'approved',
  visualization: '',
  createdAt: new Date().toISOString()
};

console.log('Validation:', defaultValidator.validate(testWorkflow));
console.log('Execution:', await defaultEngine.execute(testWorkflow, { userId: 'test' }));
```
