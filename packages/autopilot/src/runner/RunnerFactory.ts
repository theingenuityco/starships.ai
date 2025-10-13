import { LocalRunner } from './LocalRunner';
import { ChildProcessRunner } from './ChildProcessRunner';
import { KubernetesJobRunner } from './KubernetesJobRunner';
import type { Runner } from './Runner';

export class RunnerFactory {
  static getTopLevelRunner(depth: number | undefined): Runner {
    if ((depth ?? 0) > 0) return new LocalRunner();
    const mode = process.env.AUTOPILOT_RUNNER || 'child';
    if (mode === 'k8s') {
      return new KubernetesJobRunner({
        namespace: process.env.AUTOPILOT_K8S_NAMESPACE || process.env.KUBERNETES_NAMESPACE || 'default',
        image: process.env.AUTOPILOT_K8S_IMAGE || 'ghcr.io/theingenuityco/autopilot-runner:latest',
        timeoutMs: Number(process.env.AUTOPILOT_K8S_TIMEOUT_MS || '120000'),
        serviceAccountName: process.env.AUTOPILOT_K8S_SA || 'autopilot-runner',
      });
    }
    return new ChildProcessRunner();
  }
}


