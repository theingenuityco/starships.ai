'use strict';

export class KubeConfig {
  loadFromDefault(): void {}
  makeApiClient<T>(_cls: unknown): any {
    return {};
  }
}

export class BatchV1Api {
  async createNamespacedJob(_req: any): Promise<any> {
    return { metadata: { name: 'job-mock' } } as any;
  }
  async deleteNamespacedJob(_req: any): Promise<void> {}
}

export class CoreV1Api {
  async readNamespacedPod(_req: any): Promise<any> {
    return { status: { phase: 'Succeeded' } } as any;
  }
  async readNamespacedPodLog(_req: any): Promise<string> {
    return JSON.stringify({ ok: true, result: [] }) + '\n';
  }
}

export class Watch {
  constructor(_kc: any) {}
  watch(_path: string, _query: any, cb: (type: string, obj: any) => void, _done: (err?: any) => void): void {
    cb('ADDED', { metadata: { name: 'pod-mock' }, status: { phase: 'Running' } });
  }
}
