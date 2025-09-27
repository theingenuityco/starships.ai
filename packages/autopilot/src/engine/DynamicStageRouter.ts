import { BaseBlueprint, Edge } from '@/types/base';
import { NodeExecutionResult, ParallelExecution } from './ParallelEngine';

export class DynamicStageRouter {
  /**
   * Get starting nodes (no incoming edges or from 'start' node)
   */
  getStartNodes(blueprint: BaseBlueprint): string[] {
    const incomingEdges = new Map<string, number>();
    
    // Count incoming edges for each node
    blueprint.nodes.forEach(n => incomingEdges.set(n.ref, 0));
    blueprint.edges.forEach(e => {
      if (e.to !== 'start') {
        incomingEdges.set(e.to, (incomingEdges.get(e.to) || 0) + 1);
      }
    });
    
    // Find nodes with no incoming edges or connected from 'start'
    const startNodes: string[] = [];
    const startEdges = blueprint.edges.filter(e => e.from === 'start');
    
    if (startEdges.length > 0) {
      // Use explicit start edges
      startNodes.push(...startEdges.map(e => e.to));
    } else {
      // Use nodes with no incoming edges
      incomingEdges.forEach((count, ref) => {
        if (count === 0 && ref !== 'end') {
          startNodes.push(ref);
        }
      });
    }
    
    // Special case: if we have a 'start' node, use its outgoing edges
    const startNode = blueprint.nodes.find(n => n.type === 'start');
    if (startNode) {
      const outgoingFromStart = blueprint.edges
        .filter(e => e.from === startNode.ref)
        .map(e => e.to);
      if (outgoingFromStart.length > 0) {
        return outgoingFromStart;
      }
    }
    
    // If all nodes have incoming edges (circular), pick the first one alphabetically
    if (startNodes.length === 0) {
      const nonEndNodes = blueprint.nodes.filter(n => n.type !== 'end');
      if (nonEndNodes.length > 0) {
        return [nonEndNodes[0].ref];
      }
    }
    
    return startNodes;
  }
  
  /**
   * Dynamically determine next nodes based on stage results
   * Handles conditional routing and parallel node selection
   */
  determineNextNodes(
    stageResults: NodeExecutionResult[],
    blueprint: BaseBlueprint,
    execution: ParallelExecution
  ): string[] {
    const nextNodes = new Set<string>();
    
    for (const result of stageResults) {
      // Skip nodes with errors
      if (result.error) {
        continue;
      }
      
      // Handle conditional nodes with edge routing
      if (result.nodeType === 'conditional' && result.routingInfo) {
        const condition = result.routingInfo.edgeCondition;
        
        // Find edges matching the condition
        const matchingEdges = blueprint.edges.filter(edge => 
          edge.from === result.nodeRef && 
          (edge.condition === condition || (!edge.condition && condition === 'true'))
        );
        
        matchingEdges.forEach(edge => {
          // Don't check if node is completed - allow cycles (handled by visit counts)
          nextNodes.add(edge.to);
        });
      } else {
        // Regular node - follow all non-conditional edges
        const outgoingEdges = blueprint.edges.filter(edge => 
          edge.from === result.nodeRef && !edge.condition
        );
        
        outgoingEdges.forEach(edge => {
          // Don't check if node is completed - allow cycles (handled by visit counts)
          nextNodes.add(edge.to);
        });
      }
    }
    
    // Filter out 'end' nodes if there are other nodes to execute
    const nonEndNodes = Array.from(nextNodes).filter(ref => {
      const node = blueprint.nodes.find(n => n.ref === ref);
      return node?.type !== 'end';
    });
    
    if (nonEndNodes.length > 0) {
      // Remove 'end' nodes from the set
      nextNodes.forEach(ref => {
        const node = blueprint.nodes.find(n => n.ref === ref);
        if (node?.type === 'end') {
          nextNodes.delete(ref);
        }
      });
    }
    
    // Check if nodes are ready (all dependencies satisfied)
    const readyNodes: string[] = [];
    nextNodes.forEach(nodeRef => {
      if (this.areAllDependenciesSatisfied(nodeRef, blueprint, execution)) {
        readyNodes.push(nodeRef);
      }
    });
    
    return readyNodes;
  }
  
  /**
   * Check if all dependencies for a node are satisfied
   */
  private areAllDependenciesSatisfied(
    nodeRef: string,
    blueprint: BaseBlueprint,
    execution: ParallelExecution
  ): boolean {
    // Find all incoming edges
    const incomingEdges = blueprint.edges.filter(e => e.to === nodeRef);
    
    // If no incoming edges, node is ready
    if (incomingEdges.length === 0) {
      return true;
    }
    
    // Check if all source nodes have completed
    return incomingEdges.every(edge => {
      // Check if source node exists and has been executed
      const sourceCompleted = execution.nodeResults.has(edge.from);
      
      if (!sourceCompleted) {
        // Special case: 'start' node doesn't need to be executed
        const sourceNode = blueprint.nodes.find(n => n.ref === edge.from);
        if (sourceNode?.type === 'start') {
          return true;
        }
        return false;
      }
      
      // If edge has condition, check if it was satisfied
      if (edge.condition) {
        const sourceResult = execution.nodeResults.get(edge.from);
        if (sourceResult?.routingInfo) {
          return sourceResult.routingInfo.edgeCondition === edge.condition;
        }
        // If no routing info, condition is not satisfied
        return false;
      }
      
      return sourceCompleted;
    });
  }
  
  private isNodeCompleted(nodeRef: string, execution: ParallelExecution): boolean {
    return execution.nodeResults.has(nodeRef);
  }
  
  /**
   * Analyze blueprint to detect implicit dependencies from templates
   */
  analyzeTemplateDependencies(blueprint: BaseBlueprint): Map<string, Set<string>> {
    const dependencies = new Map<string, Set<string>>();
    
    // Initialize dependency sets
    blueprint.nodes.forEach(node => {
      dependencies.set(node.ref, new Set());
    });
    
    // Add explicit edge dependencies
    blueprint.edges.forEach(edge => {
      const deps = dependencies.get(edge.to);
      if (deps) {
        deps.add(edge.from);
      }
    });
    
    // Scan for template dependencies like $lastOutputOf()
    const templateRegex = /\$lastOutputOf\(["']([^"']+)["']\)/g;
    
    blueprint.nodes.forEach(node => {
      const nodeStr = JSON.stringify(node.parameters);
      let match;
      
      while ((match = templateRegex.exec(nodeStr)) !== null) {
        const dependencyRef = match[1];
        const deps = dependencies.get(node.ref);
        if (deps) {
          deps.add(dependencyRef);
        }
      }
    });
    
    return dependencies;
  }
  
  /**
   * Detect cycles in blueprint
   */
  detectCycles(blueprint: BaseBlueprint): string[] {
    const cycles: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (nodeRef: string, path: string[] = []): void => {
      visited.add(nodeRef);
      recursionStack.add(nodeRef);
      path.push(nodeRef);
      
      const outgoingEdges = blueprint.edges.filter(e => e.from === nodeRef);
      
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.to)) {
          dfs(edge.to, [...path]);
        } else if (recursionStack.has(edge.to)) {
          // Found a cycle
          const cycleStart = path.indexOf(edge.to);
          const cyclePath = [...path.slice(cycleStart), edge.to];
          cycles.push(cyclePath.join(' -> '));
        }
      }
      
      recursionStack.delete(nodeRef);
    };
    
    // Check each unvisited node
    blueprint.nodes.forEach(node => {
      if (!visited.has(node.ref)) {
        dfs(node.ref);
      }
    });
    
    return cycles;
  }
}