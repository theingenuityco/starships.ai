/**
 * Runner abstraction for executing an entire workflow engine lifecycle.
 * Implementations may run in-process or inside an isolated sandbox.
 */

import type { Blueprint, Execution, ExecutionItem } from '@/types';
import type { EngineConfig } from '@/engine/Engine';

export interface Runner {
  /**
   * Execute a blueprint with the provided execution context.
   * Implementations control the runtime isolation (local vs. child-process).
   */
  run(blueprint: Blueprint, execution: Execution, config?: EngineConfig): Promise<ExecutionItem[]>;
}
