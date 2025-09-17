import { BaseNode } from './BaseNode';
import { StartParams, ValidationResult, ExecutionItem, NodeHandlerOptions } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Start extends BaseNode<StartParams> {
  constructor(params?: StartParams, options?: NodeHandlerOptions) {
    super(params || {}, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    return ExecutionItemUtils.wrapSingle({});
  }

  validate(): ValidationResult {
    return {
      valid: true,
    };
  }
}
