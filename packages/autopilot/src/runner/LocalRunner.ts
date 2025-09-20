/**
 * Local (in-process) Runner
 * Executes the engine within the current process without isolation.
 */

import { Engine } from '@/engine/Engine';
import type { EngineConfig } from '@/engine/Engine';
import type { Blueprint, Execution, ExecutionItem } from '@/types';
import type { Runner } from './Runner';

export class LocalRunner implements Runner {
  async run(blueprint: Blueprint, execution: Execution, config?: EngineConfig): Promise<ExecutionItem[]> {
    const engine = new Engine(config);
    return await engine.executeBlueprint(blueprint, execution);
  }
}
