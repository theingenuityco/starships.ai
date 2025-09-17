import { NodeHandler } from '@/types/node-handler';
import { EndParams, ValidationResult, ExecutionItem } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class End implements NodeHandler {
  params: EndParams;

  constructor(params?: EndParams) {
    this.params = params || {};
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
