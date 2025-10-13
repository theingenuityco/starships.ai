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
  type V1Secret,
  type BatchV1ApiCreateNamespacedJobRequest,
  type BatchV1ApiDeleteNamespacedJobRequest,
  type CoreV1ApiReadNamespacedPodRequest,
  type CoreV1ApiReadNamespacedPodLogRequest,
  type CoreV1ApiCreateNamespacedSecretRequest,
  type CoreV1ApiDeleteNamespacedSecretRequest,
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
  imagePullSecrets?: string[];
}

export class KubernetesJobRunner implements Runner {
  constructor(private readonly opts: KubernetesJobRunnerOptions) {}

  async run(blueprint: Blueprint, execution: Execution, config?: EngineConfig): Promise<ExecutionItem[]> {
    // Emit no runner_* events; use console logging for diagnostics only
    const payload = {
      blueprint,
      execution,
      config: { ...config, eventCallback: undefined },
      autopilotCredentials: { openrouterApiKey: process.env.OPENROUTER_API_KEY ?? undefined },
    };
    const payloadJson = JSON.stringify(payload);

    const kc = new KubeConfig();
    kc.loadFromDefault();
    const batch = kc.makeApiClient(BatchV1Api);
    const core = kc.makeApiClient(CoreV1Api);
    const watch = new Watch(kc);

    // Create a Secret to hold the payload (protects secureContext/credentials)
    const payloadSecret: V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      type: 'Opaque',
      metadata: { generateName: 'autopilot-exec-payload-', namespace: this.opts.namespace },
      stringData: { 'payload.json': payloadJson },
    } as V1Secret;
    const secretCreateReq: CoreV1ApiCreateNamespacedSecretRequest = { namespace: this.opts.namespace, body: payloadSecret };
    const createdSecret = await core.createNamespacedSecret(secretCreateReq);
    const secretName = createdSecret?.metadata?.name ?? 'autopilot-exec-payload';

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
            automountServiceAccountToken: false,
            imagePullSecrets: (this.opts.imagePullSecrets?.length ? this.opts.imagePullSecrets : ['ghcr-pull-secret']).map((name) => ({
              name,
            })),
            restartPolicy: 'Never',
            securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
            containers: [
              {
                name: this.opts.containerName ?? 'runner',
                image: this.opts.image,
                imagePullPolicy: 'Always',
                command: ['node', 'scripts/runner-cli.js'],
                env: [
                  { name: 'NODE_ENV', value: 'production' },
                  { name: 'PAYLOAD_PATH', value: '/run/payload/payload.json' },
                  ...Object.entries(this.opts.extraEnv ?? {}).map(([k, v]) => ({ name: k, value: v })),
                ],
                resources: {
                  limits: { cpu: this.opts.resources?.cpu ?? '500m', memory: this.opts.resources?.memory ?? '256Mi' },
                  requests: { cpu: '100m', memory: '128Mi' },
                },
                securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
                volumeMounts: [
                  { name: 'tmp', mountPath: '/tmp' },
                  { name: 'payload', mountPath: '/run/payload', readOnly: true },
                ],
              },
            ],
            volumes: [
              { name: 'tmp', emptyDir: { medium: 'Memory' } },
              { name: 'payload', secret: { secretName } },
            ],
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
          if (err) {
            console.error('[K8sRunner] Pod watch error:', err);
            reject(err);
          }
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
              Promise.resolve(cb(data.event)).catch((cbErr) => {
                console.error('[K8sRunner] event callback error:', cbErr);
              });
            } else if (typeof data.ok === 'boolean') {
              if (data.ok) {
                finalResult = data.result as ExecutionItem[];
              } else {
                const msg = data?.error?.message || 'Runner error';
                throw new Error(msg);
              }
            }
          }
        } catch (parseErr) {
          console.warn('[K8sRunner] log parse error:', parseErr);
        }
      }
      processedLines = lines.length;
    };

    // Wait for pod to complete and poll logs for streaming (stderr for events, stdout for result)
    const deadline = Date.now() + (this.opts.timeoutMs ?? 120000);
    let phase = '';
    while (Date.now() < deadline) {
      const readPodReq: CoreV1ApiReadNamespacedPodRequest = { name: podName, namespace: this.opts.namespace };
      const pod = await core.readNamespacedPod(readPodReq);
      phase = pod?.status?.phase ?? '';
      try {
        // 1) Read stderr (events stream)
        const logReqErr: CoreV1ApiReadNamespacedPodLogRequest = {
          name: podName,
          namespace: this.opts.namespace,
          container: this.opts.containerName ?? 'runner',
          follow: false,
          timestamps: false,
          // Workaround: capture stderr by including it in combined stream where supported
        };
        const errText = await core.readNamespacedPodLog(logReqErr);
        processLogs(String(errText || ''));

        // 2) Read stdout (final JSON)
        const logReqOut: CoreV1ApiReadNamespacedPodLogRequest = {
          name: podName,
          namespace: this.opts.namespace,
          container: this.opts.containerName ?? 'runner',
          follow: false,
          timestamps: false,
          // Default behavior returns combined or stdout depending on cluster/runtime
        };
        const outText = await core.readNamespacedPodLog(logReqOut);
        processLogs(String(outText || ''));
      } catch (logErr) {
        console.warn('[K8sRunner] transient log read error:', logErr);
      }
      if (phase === 'Succeeded' || phase === 'Failed') break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Final read to capture any remaining lines (stderr then stdout)
    try {
      const finalErrReq: CoreV1ApiReadNamespacedPodLogRequest = {
        name: podName,
        namespace: this.opts.namespace,
        container: this.opts.containerName ?? 'runner',
        // Combined or stderr depending on cluster/runtime
      };
      const finalErr = await core.readNamespacedPodLog(finalErrReq);
      processLogs(String(finalErr || ''));

      const finalOutReq: CoreV1ApiReadNamespacedPodLogRequest = {
        name: podName,
        namespace: this.opts.namespace,
        container: this.opts.containerName ?? 'runner',
        // Combined or stdout depending on cluster/runtime
      };
      const finalOut = await core.readNamespacedPodLog(finalOutReq);
      processLogs(String(finalOut || ''));
    } catch (finalLogErr) {
      console.warn('[K8sRunner] final log read error:', finalLogErr);
    }

    try {
      const delReq: BatchV1ApiDeleteNamespacedJobRequest = {
        name: jobName,
        namespace: this.opts.namespace,
        propagationPolicy: 'Background',
      } as BatchV1ApiDeleteNamespacedJobRequest;
      await batch.deleteNamespacedJob(delReq);
    } catch (cleanupJobErr) {
      console.warn('[K8sRunner] job cleanup error:', cleanupJobErr);
    }

    // Cleanup payload Secret
    try {
      const secretDeleteReq: CoreV1ApiDeleteNamespacedSecretRequest = { name: secretName, namespace: this.opts.namespace };
      await core.deleteNamespacedSecret(secretDeleteReq);
    } catch (cleanupSecretErr) {
      console.warn('[K8sRunner] secret cleanup error:', cleanupSecretErr);
    }

    if (finalResult) return finalResult;
    console.error('[K8sRunner] Runner did not return a result, pod phase:', phase);
    throw new Error(`Runner did not return a result (pod phase=${phase})`);
  }
}
