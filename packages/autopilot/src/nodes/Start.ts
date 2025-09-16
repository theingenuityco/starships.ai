import { NodeHandler } from '@/types/node-handler';
import { StartParams, ValidationResult, ExecutionItem } from '@/types';
import { NodeHelpers } from '@/helpers/NodeHelpers';

export class Start implements NodeHandler {
  params: StartParams;

  constructor(params?: StartParams) {
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
