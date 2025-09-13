import { NodeHandler } from '@/types/node-handler';
import { EndParams, ValidationResult } from '@/types';

export class End implements NodeHandler {
  params: EndParams;

  constructor(params?: EndParams) {
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
