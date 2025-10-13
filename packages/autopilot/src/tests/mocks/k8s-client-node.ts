'use strict';

export class KubeConfig {
  loadFromDefault(): void {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  makeApiClient<T>(_cls: unknown): unknown {
    return {};
  }
}

export class BatchV1Api {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createNamespacedJob(_req: unknown): Promise<{ metadata: { name: string } }> {
    return { metadata: { name: 'job-mock' } };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteNamespacedJob(_req: unknown): Promise<void> {}
}

export class CoreV1Api {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async readNamespacedPod(_req: unknown): Promise<{ status: { phase: string } }> {
    return { status: { phase: 'Succeeded' } };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async readNamespacedPodLog(_req: unknown): Promise<string> {
    return JSON.stringify({ ok: true, result: [] }) + '\n';
  }
}

export class Watch {
  constructor(kc: unknown) {
    void kc;
  }
  watch(
    _path: string,
    _query: unknown,
    cb: (type: string, obj: { metadata?: { name?: string }; status?: { phase?: string } }) => void
  ): void {
    cb('ADDED', { metadata: { name: 'pod-mock' }, status: { phase: 'Running' } });
  }
}
