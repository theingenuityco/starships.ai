import { Edge } from '@/types/base';
import { ExecutionItem } from '@/types/execution';
import { ExecutionStage, ParallelExecution } from './ParallelEngine';

export class StageContext {
  private stage: ExecutionStage;
  public readonly execution: ParallelExecution;
  private stageOutputs: Map<string, ExecutionItem[]>;
  
  constructor(stage: ExecutionStage, execution: ParallelExecution) {
    this.stage = stage;
    this.execution = execution;
    this.stageOutputs = new Map();
  }
  
  /**
   * Get inputs for a node from previous stages
   * Handles parallel-aware template resolution
   */
  getNodeInputs(nodeRef: string): ExecutionItem[] | undefined {
    const node = this.stage.nodes.find(n => n.ref === nodeRef);
    if (!node) return undefined;
    
    // Check if node has explicit input dependencies
    const incomingEdges = this.getIncomingEdges(nodeRef);
    
    if (incomingEdges.length === 0) {
      // No dependencies - this is a start node
      return this.execution.initialInputs;
    }
    
    // Special handling for 'start' node edges
    const hasStartEdge = incomingEdges.some(edge => {
      const sourceNode = this.execution.blueprint.nodes.find(n => n.ref === edge.from);
      return sourceNode?.type === 'start';
    });
    
    if (hasStartEdge) {
      return this.execution.initialInputs;
    }
    
    // Aggregate inputs from all dependencies
    const inputs: ExecutionItem[] = [];
    for (const edge of incomingEdges) {
      const sourceOutput = this.execution.nodeResults.get(edge.from);
      if (sourceOutput) {
        inputs.push(...sourceOutput.items);
      }
    }
    
    return inputs.length > 0 ? inputs : undefined;
  }
  
  /**
   * Get output from a specific node (for template resolution)
   * Replaces $lastOutputOf() for parallel execution
   */
  getNodeOutput(nodeRef: string): ExecutionItem[] | undefined {
    // First check current stage outputs
    if (this.stageOutputs.has(nodeRef)) {
      return this.stageOutputs.get(nodeRef);
    }
    
    // Then check completed nodes from previous stages
    const result = this.execution.nodeResults.get(nodeRef);
    return result?.items;
  }
  
  /**
   * Store node result in context
   */
  setNodeResult(nodeRef: string, items: ExecutionItem[]): void {
    this.stageOutputs.set(nodeRef, items);
  }
  
  /**
   * Get previous stage results for synthesis
   */
  getPreviousStageResults(): ExecutionItem[] {
    if (this.stage.stageIndex === 0) return [];
    
    const previousStage = this.execution.stages[this.stage.stageIndex - 1];
    if (!previousStage) return [];
    
    const results: ExecutionItem[] = [];
    
    for (const nodeRef of previousStage.nodeRefs) {
      const nodeResult = this.execution.nodeResults.get(nodeRef);
      if (nodeResult && !nodeResult.error) {
        results.push(...nodeResult.items);
      }
    }
    
    return results;
  }
  
  /**
   * Get all results from specified stage
   */
  getStageResults(stageIndex: number): ExecutionItem[] {
    const stage = this.execution.stages[stageIndex];
    if (!stage) return [];
    
    const results: ExecutionItem[] = [];
    for (const nodeRef of stage.nodeRefs) {
      const nodeResult = this.execution.nodeResults.get(nodeRef);
      if (nodeResult && !nodeResult.error) {
        results.push(...nodeResult.items);
      }
    }
    
    return results;
  }
  
  /**
   * Get initial inputs for the execution
   */
  getInitialInputs(): ExecutionItem[] | undefined {
    return this.execution.initialInputs;
  }
  
  /**
   * Get current execution state
   */
  getState(): any {
    return this.execution.state;
  }
  
  /**
   * Get value from state by path
   */
  getStateValue(path: string): any {
    const parts = path.split('.').filter(Boolean);
    let current = this.execution.state;
    
    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = (current as any)[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
  
  /**
   * Check if a node has been executed
   */
  isNodeExecuted(nodeRef: string): boolean {
    return this.execution.nodeResults.has(nodeRef);
  }
  
  /**
   * Get the current stage index
   */
  getStageIndex(): number {
    return this.stage.stageIndex;
  }
  
  /**
   * Get the number of parallel nodes in current stage
   */
  getParallelCount(): number {
    return this.stage.parallelCount;
  }
  
  private getIncomingEdges(nodeRef: string): Edge[] {
    return this.execution.blueprint.edges.filter(e => e.to === nodeRef);
  }
  
  /**
   * Resolve template expressions in parameters
   * Handles $lastOutputOf(), state references, etc.
   */
  resolveTemplate(template: string): any {
    if (typeof template !== 'string') {
      return template;
    }
    
    // Handle $lastOutputOf() for backward compatibility
    let resolved = template.replace(/\$lastOutputOf\(["']([^"']+)["']\)/g, (match, nodeRef) => {
      const output = this.getNodeOutput(nodeRef);
      if (output && output.length > 0) {
        return JSON.stringify(output[0].json);
      }
      return 'null';
    });
    
    // Handle {{ state.* }} references
    resolved = resolved.replace(/\{\{\s*state\.([^\s}]+)\s*\}\}/g, (match, path) => {
      const value = this.getStateValue(path);
      // Don't stringify if it's already a string
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
    
    // Handle {{ nodes.*.output }} references (new parallel syntax)
    resolved = resolved.replace(/\{\{\s*nodes\.([^.]+)\.output\s*\}\}/g, (match, nodeRef) => {
      const output = this.getNodeOutput(nodeRef);
      return JSON.stringify(output);
    });
    
    // Handle {{ stage.previous.results }} references
    resolved = resolved.replace(/\{\{\s*stage\.previous\.results\s*\}\}/g, () => {
      const results = this.getPreviousStageResults();
      return JSON.stringify(results);
    });
    
    // Try to parse if it looks like JSON
    if (resolved.startsWith('{') || resolved.startsWith('[')) {
      try {
        return JSON.parse(resolved);
      } catch {
        return resolved;
      }
    }
    
    return resolved;
  }
  
  /**
   * Resolve all templates in node parameters
   */
  resolveNodeParameters(parameters: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        resolved[key] = this.resolveTemplate(value);
      } else if (Array.isArray(value)) {
        resolved[key] = value.map(item => 
          typeof item === 'string' ? this.resolveTemplate(item) : item
        );
      } else if (value && typeof value === 'object') {
        resolved[key] = this.resolveNodeParameters(value as Record<string, unknown>);
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  }
}