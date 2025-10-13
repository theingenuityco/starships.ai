import { LocalRunner } from './LocalRunner';
import { ChildProcessRunner } from './ChildProcessRunner';
import type { Runner } from './Runner';
import { RemoteRunner } from './RemoteRunner';

export class RunnerFactory {
  static getTopLevelRunner(depth: number | undefined): Runner {
    if ((depth ?? 0) > 0) return new LocalRunner();
    const mode = process.env.AUTOPILOT_RUNNER || 'child';
    if (mode === 'remote') {
      return new RemoteRunner();
    }
    return new ChildProcessRunner();
  }
}
