/**
 * Main Blueprint Types
 *
 * Primary workflow DSL structure definitions with strongly typed parameters
 * These are the main exported types for the autopilot API
 */

import type { BaseNode, BaseBlueprint } from './base';
import type { NodeParameters } from './node-parameters';

/**
 * Workflow node with strongly typed parameters
 * This is the main Node type exported by the autopilot package
 */
export interface Node extends Omit<BaseNode, 'parameters'> {
  parameters: NodeParameters;
}

/**
 * Blueprint with strongly typed nodes
 * This is the main Blueprint type exported by the autopilot package
 */
export interface Blueprint extends Omit<BaseBlueprint, 'nodes'> {
  nodes: Node[];
}
