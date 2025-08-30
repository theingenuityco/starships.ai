/**
 * Global test utilities type declarations
 */

import type { Blueprint } from '../src/types/workflow';
import type { ExecutionContext } from '../src/types/execution';

declare global {
  namespace NodeJS {
    interface Global {
      createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
      createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
      createMockContext: (overrides?: Partial<ExecutionContext>) => ExecutionContext;
    }
  }

  // Augment globalThis to include our custom properties
  interface GlobalThis {
    createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
    createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
    createMockContext: (overrides?: Partial<ExecutionContext>) => ExecutionContext;
  }

  // Also declare for regular global access
  var createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
  var createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
  var createMockContext: (overrides?: Partial<ExecutionContext>) => ExecutionContext;
}

export {};