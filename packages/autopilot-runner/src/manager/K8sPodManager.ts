export interface K8sPodManagerOptions {
  namespace?: string;
  minReady?: number;
  maxReady?: number;
  image?: string;
  serviceAccountName?: string;
}

export class K8sPodManager {
  private readonly opts: K8sPodManagerOptions;
  private desired: number;

  constructor(opts: K8sPodManagerOptions = {}) {
    this.opts = opts;
    this.desired = Math.max(0, opts.minReady ?? 0);
  }

  async ensureWarmPool(): Promise<void> {
    // Placeholder: ensure Deployment exists with desired replicas
  }

  scaleUp(n: number): void {
    this.desired = Math.min(this.opts.maxReady ?? 10, this.desired + Math.max(1, n));
  }

  scaleDown(n: number): void {
    this.desired = Math.max(this.opts.minReady ?? 0, this.desired - Math.max(1, n));
  }

  getDesired(): number {
    return this.desired;
  }
}
