import { RunnerFactory } from '@starships/autopilot';
import type { ExecutionProvider, ExecutionJob, ExecutionResult } from '@starships/autopilot';

/**
 * Runs the blueprint in-process via the existing RunnerFactory selection
 * (LocalRunner / RemoteRunner / ChildProcessRunner). This is the default path
 * for all non-workspace runs and preserves today's behavior exactly.
 */
export class InlineExecutionProvider implements ExecutionProvider {
  readonly kind = 'inline' as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async runJob(job: ExecutionJob): Promise<ExecutionResult> {
    const runner = RunnerFactory.getTopLevelRunner(job.execution.depth ?? 0);
    const items = await runner.run(job.blueprint, job.execution, job.config);
    return { items };
  }
}
