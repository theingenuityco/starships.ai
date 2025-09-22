import { BaseNode } from './BaseNode';
import { EndParams, ValidationResult, ExecutionItem, NodeHandlerOptions } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class End extends BaseNode<EndParams> {
  constructor(params?: EndParams, options?: NodeHandlerOptions) {
    super(params || {}, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const { output } = this.getParams();
    if (output !== undefined) {
      return ExecutionItemUtils.wrapSingle({ result: output });
    }
    return ExecutionItemUtils.wrapSingle({});
  }

  validate(): ValidationResult {
    return {
      valid: true,
    };
  }
}
