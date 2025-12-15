import { LocalRunner } from './LocalRunner';
import { ChildProcessRunner } from './ChildProcessRunner';
import type { Runner } from './Runner';
import { RemoteRunner } from './RemoteRunner';

export class RunnerFactory {
  static getTopLevelRunner(depth: number | undefined): Runner {
    if ((depth ?? 0) > 0) return new LocalRunner();
    // Remote runner is enabled when RUNNER_URL is configured on the host.
    // (RemoteRunner itself reads the configured URL via autopilot.setRunnerConfig.)
    if (process.env.RUNNER_URL) {
      return new RemoteRunner();
    }
    return new ChildProcessRunner();
  }
}
