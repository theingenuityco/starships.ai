import type { Runner } from './Runner';
import type { Blueprint, Execution, ExecutionItem } from '@/types';
import type { EngineConfig } from '@/engine/Engine';
import {
  KubeConfig,
  BatchV1Api,
  CoreV1Api,
  Watch,
  type V1Job,
  type V1Pod,
  type BatchV1ApiCreateNamespacedJobRequest,
  type BatchV1ApiDeleteNamespacedJobRequest,
  type CoreV1ApiReadNamespacedPodRequest,
  type CoreV1ApiReadNamespacedPodLogRequest,
} from '@kubernetes/client-node';

export interface KubernetesJobRunnerOptions {
  namespace: string;
  image: string;
  timeoutMs?: number;
  resources?: { cpu?: string; memory?: string };
  serviceAccountName?: string;
  extraEnv?: Record<string, string>;
  jobTTLSeconds?: number;
  containerName?: string;
}

export class KubernetesJobRunner implements Runner {
  constructor(private readonly opts: KubernetesJobRunnerOptions) {}

  async run(blueprint: Blueprint, execution: Execution, config?: EngineConfig): Promise<ExecutionItem[]> {
    const payload = {
      blueprint,
      execution,
      config: { ...config, eventCallback: undefined },
      autopilotCredentials: { openrouterApiKey: process.env.OPENROUTER_API_KEY ?? undefined },
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

    const kc = new KubeConfig();
    kc.loadFromDefault();
    const batch = kc.makeApiClient(BatchV1Api);
    const core = kc.makeApiClient(CoreV1Api);
    const watch = new Watch(kc);

    const jobManifest: V1Job = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { generateName: 'autopilot-exec-', namespace: this.opts.namespace },
      spec: {
        ttlSecondsAfterFinished: this.opts.jobTTLSeconds ?? 60,
        backoffLimit: 0,
        activeDeadlineSeconds: Math.ceil((this.opts.timeoutMs ?? 120000) / 1000),
        template: {
          metadata: { labels: { app: 'autopilot-runner' } },
          spec: {
            serviceAccountName: this.opts.serviceAccountName ?? 'autopilot-runner',
            restartPolicy: 'Never',
            securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
            containers: [
              {
                name: this.opts.containerName ?? 'runner',
                image: this.opts.image,
                command: ['sh', '-lc', 'echo "$PAYLOAD_B64" | base64 -d | node scripts/runner-cli.js'],
                env: [
                  { name: 'NODE_ENV', value: 'production' },
                  { name: 'PAYLOAD_B64', value: payloadB64 },
                  ...Object.entries(this.opts.extraEnv ?? {}).map(([k, v]) => ({ name: k, value: v })),
                ],
                resources: {
                  limits: { cpu: this.opts.resources?.cpu ?? '500m', memory: this.opts.resources?.memory ?? '256Mi' },
                  requests: { cpu: '100m', memory: '128Mi' },
                },
                securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
                volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }],
              },
            ],
            volumes: [{ name: 'tmp', emptyDir: { medium: 'Memory' } }],
          },
        },
      },
    };

    const createReq: BatchV1ApiCreateNamespacedJobRequest = { namespace: this.opts.namespace, body: jobManifest };
    const created = await batch.createNamespacedJob(createReq);
    const jobName = created?.metadata?.name ?? 'autopilot-exec';

    const podName = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Pod watch timeout')), this.opts.timeoutMs ?? 120000);
      watch.watch(
        `/api/v1/namespaces/${this.opts.namespace}/pods`,
        { labelSelector: `job-name=${jobName}` },
        (_type: string, obj: Partial<V1Pod>) => {
          const name = obj?.metadata?.name;
          const phase = obj?.status?.phase as string | undefined;
          if (name && phase) {
            clearTimeout(timer);
            resolve(name);
          }
        },
        (err: unknown) => {
          if (err) reject(err);
        }
      );
    });

    let finalResult: ExecutionItem[] | undefined;
    let processedLines = 0;

    const processLogs = (logText: string) => {
      const lines = (logText || '').split('\n');
      for (let i = processedLines; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          if (!line.startsWith('{')) continue;
          const data = JSON.parse(line);
          if (data && typeof data === 'object') {
            if (data.type === 'event' && config?.eventCallback) {
              const cb = config.eventCallback as (e: unknown) => Promise<void> | void;
              Promise.resolve(cb(data.event)).catch(() => {});
            } else if (typeof data.ok === 'boolean') {
              if (data.ok) {
                finalResult = data.result as ExecutionItem[];
              } else {
                const msg = data?.error?.message || 'Runner error';
                throw new Error(msg);
              }
            }
          }
        } catch {
          // ignore non-JSON lines or parse errors
        }
      }
      processedLines = lines.length;
    };

    // Wait for pod to complete and poll logs for streaming
    const deadline = Date.now() + (this.opts.timeoutMs ?? 120000);
    let phase = '';
    while (Date.now() < deadline) {
      const readPodReq: CoreV1ApiReadNamespacedPodRequest = { name: podName, namespace: this.opts.namespace };
      const pod = await core.readNamespacedPod(readPodReq);
      phase = pod?.status?.phase ?? '';
      try {
        const logReq: CoreV1ApiReadNamespacedPodLogRequest = {
          name: podName,
          namespace: this.opts.namespace,
          container: this.opts.containerName ?? 'runner',
          follow: false,
          timestamps: false,
        };
        const logText = await core.readNamespacedPodLog(logReq);
        processLogs(String(logText || ''));
      } catch {
        // ignore transient log read errors
      }
      if (phase === 'Succeeded' || phase === 'Failed') break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Final log read to capture any remaining lines
    try {
      const finalLogReq: CoreV1ApiReadNamespacedPodLogRequest = {
        name: podName,
        namespace: this.opts.namespace,
        container: this.opts.containerName ?? 'runner',
      };
      const finalLog = await core.readNamespacedPodLog(finalLogReq);
      processLogs(String(finalLog || ''));
    } catch {
      // ignore final log read errors
    }

    try {
      const delReq: BatchV1ApiDeleteNamespacedJobRequest = {
        name: jobName,
        namespace: this.opts.namespace,
        propagationPolicy: 'Background',
      } as BatchV1ApiDeleteNamespacedJobRequest;
      await batch.deleteNamespacedJob(delReq);
    } catch {
      // ignore cleanup errors
    }

    if (finalResult) return finalResult;
    throw new Error(`Runner did not return a result (pod phase=${phase})`);
  }
}
