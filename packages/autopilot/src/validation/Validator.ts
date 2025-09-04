/**
 * Blueprint Validator
 *
 * Validates workflow structure and configuration
 */

import { Blueprint, ValidationResult, ValidationError, Node } from '@/types';

export class Validator {
  validate(workflow: Blueprint): ValidationResult {
    const errors: ValidationError[] = [];

    try {
      // Check basic structure
      if (!workflow.nodes || workflow.nodes.length === 0) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Blueprint must have nodes',
          severity: 'error',
        });
      }

      if (!workflow.edges || workflow.edges.length === 0) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Blueprint must have edges',
          severity: 'error',
        });
      }

      if (errors.length > 0) {
        return { valid: false, errors, warnings: [], suggestions: [] };
      }

      // Check for required node types
      const hasStart = workflow.nodes.some((node) => node.type === 'start');
      const hasEnd = workflow.nodes.some((node) => node.type === 'end');

      if (!hasStart) {
        errors.push({
          code: 'MISSING_START_NODE',
          message: 'Blueprint must have a start node',
          severity: 'error',
        });
      }

      if (!hasEnd) {
        errors.push({
          code: 'MISSING_END_NODE',
          message: 'Blueprint must have an end node',
          severity: 'error',
        });
      }

      // Validate node connectivity
      const connectivityErrors = this.validateConnectivity(workflow);
      errors.push(...connectivityErrors);

      return {
        valid: errors.length === 0,
        errors,
        warnings: [],
        suggestions: [],
      };
    } catch (error) {
      errors.push({
        code: 'VALIDATION_FAILED',
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });

      return {
        valid: false,
        errors,
        warnings: [],
        suggestions: [],
      };
    }
  }

  private validateConnectivity(workflow: Blueprint): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for unreachable nodes
    const startNode = workflow.nodes.find((node) => node.type === 'start');
    if (!startNode) return errors;

    const reachableNodes = this.findReachableNodes(workflow, startNode.ref);
    const unreachableNodes = workflow.nodes.filter((node) => !reachableNodes.has(node.ref) && node.type !== 'start');

    unreachableNodes.forEach((node) => {
      errors.push({
        code: 'UNREACHABLE_NODE',
        message: `Node '${node.name}' is not reachable from start node`,
        nodeRef: node.ref,
        severity: 'error',
      });
    });

    // Check for circular dependencies
    const circularPaths = this.detectCircularDependencies(workflow);
    circularPaths.forEach((path) => {
      errors.push({
        code: 'CIRCULAR_DEPENDENCY',
        message: `Circular dependency detected: ${path.join(' -> ')}`,
        severity: 'error',
      });
    });

    return errors;
  }

  private findReachableNodes(workflow: Blueprint, startNodeId: string): Set<string> {
    const reachable = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (reachable.has(currentId)) continue;

      reachable.add(currentId);

      workflow.edges.filter((edge) => edge.from === currentId).forEach((edge) => queue.push(edge.to));
    }

    return reachable;
  }

  private detectCircularDependencies(workflow: Blueprint): string[][] {
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

      const outgoingEdges = workflow.edges.filter((edge) => edge.from === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.to, path.concat(nodeId));
      }

      recursionStack.delete(nodeId);
    };

    workflow.nodes.forEach((node) => {
      if (!visited.has(node.ref)) {
        dfs(node.ref, []);
      }
    });

    return cycles;
  }
}
