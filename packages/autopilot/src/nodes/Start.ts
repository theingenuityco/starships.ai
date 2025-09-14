import { NodeHandler } from '@/types/node-handler';
import { StartParams, ValidationResult } from '@/types';

export class Start implements NodeHandler {
  params: StartParams;

  constructor(params?: StartParams) {
    this.params = params || {};
  }

  async execute(): Promise<void> {
    return;
  }

  validate(): ValidationResult {
    return {
      valid: true,
    };
  }
}
