import { NodeHandler } from '@/types/node-handler';
import { EndParams, ValidationResult } from '@/types';

export class End implements NodeHandler {
  params: EndParams;

  constructor(params?: EndParams) {
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
