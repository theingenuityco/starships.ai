import { NodeHandler } from '@/types/node-handler';
import { StartParams, ValidationResult } from '@/types';

export class Start implements NodeHandler {
  params: StartParams;

  constructor(params?: StartParams) {
    this.params = params || {};
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input?: unknown): Promise<void> {
    return;
  }

  validate(): ValidationResult {
    return {
      valid: true,
    };
  }
}
