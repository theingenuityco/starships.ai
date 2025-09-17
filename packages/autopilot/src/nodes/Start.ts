import { BaseNode } from './BaseNode';
import { StartParams, ValidationResult, ExecutionItem, NodeHandlerOptions } from '@/types';
import { NodeHelpers } from '@/helpers/NodeHelpers';

export class Start extends BaseNode<StartParams> {
  constructor(params?: StartParams, options?: NodeHandlerOptions) {
    super(params || {}, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    return NodeHelpers.createSingleOutput({});
  }

  validate(): ValidationResult {
    return {
      valid: true,
    };
  }
}
