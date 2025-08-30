/**
 * Global test utilities type declarations
 */

import type { Blueprint } from '../src/types';
import type { Execution } from '../src/types';

declare global {
  namespace NodeJS {
    interface Global {
      createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
      createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
      createMockExecution: (overrides?: Partial<Execution>) => Execution;
    }
  }

  // Augment globalThis to include our custom properties
  interface GlobalThis {
    createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
    createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
    createMockExecution: (overrides?: Partial<Execution>) => Execution;
  }

  // Also declare for regular global access
  var createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
  var createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
  var createMockExecution: (overrides?: Partial<Execution>) => Execution;
}

export {};