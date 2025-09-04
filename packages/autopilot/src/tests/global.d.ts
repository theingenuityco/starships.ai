/**
 * Global test utilities type declarations
 */

import type { Blueprint, Execution, Node } from '@/types';

declare global {
  namespace NodeJS {
    interface Global {
      createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
      createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
      createMockExecution: (overrides?: Partial<Execution>) => Execution;
      createMockNode: (overrides?: Partial<Node>) => Node;
    }
  }

  // Augment globalThis to include our custom properties
  interface GlobalThis {
    createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
    createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
    createMockExecution: (overrides?: Partial<Execution>) => Execution;
    createMockNode: (overrides?: Partial<Node>) => Node;
  }

  // Also declare for regular global access
  var createMockBlueprint: (overrides?: Partial<Blueprint>) => Blueprint;
  var createMockWorkflow: (overrides?: Partial<Blueprint>) => Blueprint;
  var createMockExecution: (overrides?: Partial<Execution>) => Execution;
  var createMockNode: (overrides?: Partial<Node>) => Node;
}

export {};
