import { NodeHandler } from '@/types/node-handler';
import { EndParams, ValidationResult, ExecutionItem } from '@/types';
import { NodeHelpers } from '@/helpers/NodeHelpers';

export class End implements NodeHandler {
  params: EndParams;

  constructor(params?: EndParams) {
    this.params = params || {};
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
