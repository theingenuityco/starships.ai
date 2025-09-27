export { BaseNodeHandler } from './BaseNodeHandler';
export { ParallelToolsNode } from './ParallelToolsNode';
export { ConditionalNode } from './ConditionalNode';
export { StartNode } from './StartNode';
export { EndNode } from './EndNode';
export { TransformNode } from './TransformNode';

import { BaseNodeHandler } from './BaseNodeHandler';
import type { BaseNode } from '@/types/base';
import type { NodeHandlerOptions } from '@/types/node-handler';

/**
 * Create a node handler instance based on node type
 * For now, returns a simple handler that just passes through
 */
export function createNodeHandler(node: BaseNode, options: NodeHandlerOptions): BaseNodeHandler {
  // TODO: Implement proper node handler factory based on node.type
  // For now return a basic handler
  return {
    setContext: () => {},
    execute: async (input?: any) => input || [],
    validate: () => ({ valid: true })
  } as any;
}