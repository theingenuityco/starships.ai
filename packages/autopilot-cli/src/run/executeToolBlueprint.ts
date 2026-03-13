import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import type { Blueprint, EngineConfig } from '@starships/autopilot';

export async function executeToolBlueprint(args: {
  blueprint: Blueprint;
  toolConfig: Record<string, unknown>;
  toolArgs: Record<string, unknown>;
  engineConfig: EngineConfig;
}): Promise<unknown> {
  const execution = ExecutionItemUtils.createExecution();
  const initial = ExecutionItemUtils.wrapSingle({ ...args.toolArgs, config: args.toolConfig });
  execution.results.push({ nodeRef: '__initial__', items: initial });
  const runner = RunnerFactory.getTopLevelRunner(execution.depth ?? 0);
  const items = await runner.run(args.blueprint, execution, {
    failOnNodeError: true,
    ...(args.engineConfig as EngineConfig),
  });
  return ExecutionItemUtils.unwrapSingle(items);
}

