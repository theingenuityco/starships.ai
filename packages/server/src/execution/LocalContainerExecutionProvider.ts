import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExecutionItem, ExecutionProvider, ExecutionJob, ExecutionResult, EngineConfig, AutopilotEvent } from '@starships/autopilot';

/**
 * Runs a workspace-backed job inside a hardened, single-use Docker sandbox on
 * the same box (per-starship-EC2 model). The container clones the repo, runs the
 * blueprint's FileSystem/Terminal nodes (confined to the workspace, env-scrubbed),
 * runs the user's tests, commits, and pushes. Untrusted code never touches the
 * control plane: it runs unprivileged, cap-dropped, read-only-root, resource-capped,
 * with the job (and its short-lived git token) passed via a mounted file that is
 * deleted afterward.
 *
 * Event streaming uses the JobAgent's stdout JSON-line protocol, relayed into the
 * in-process eventCallback so the room sees live progress.
 */
export class LocalContainerExecutionProvider implements ExecutionProvider {
  readonly kind = 'local_container' as const;

  async isAvailable(): Promise<boolean> {
    // Docker is expected to be present on the starship box. A deeper probe can be
    // added later; for now assume availability when this provider is selected.
    return true;
  }

  async runJob(job: ExecutionJob): Promise<ExecutionResult> {
    if (!job.workspace) {
      throw new Error('LocalContainerExecutionProvider requires job.workspace');
    }

    // Separate the in-process callback (not serializable) from the config the
    // container receives, and strip function-valued engine fields.
    const eventCallback = job.config.eventCallback;
    const serializableConfig: Record<string, unknown> = { ...job.config };
    delete serializableConfig.eventCallback;
    delete serializableConfig.runner;
    delete serializableConfig.onCancel;

    const configJson = JSON.stringify({
      ...serializableConfig,
      workspace: { spec: job.workspace, git: job.git },
    });

    const requestId = randomUUID();
    const jobPayload = JSON.stringify({
      requestId,
      blueprintJson: JSON.stringify(job.blueprint),
      executionJson: JSON.stringify(job.execution),
      configJson,
    });

    // When the server runs inside a container and launches sibling sandbox
    // containers via the host Docker socket, the -v paths are resolved on the
    // HOST. RUNNER_JOB_BASE_DIR must therefore be a path bind-mounted into this
    // container at the identical path (see infra/starship-ec2/docker-compose.yml).
    const baseDir = process.env.RUNNER_JOB_BASE_DIR || tmpdir();
    const hostJobDir = await mkdtemp(join(baseDir, 'sjob-'));
    const hostWorkspaceDir = await mkdtemp(join(baseDir, 'swork-'));
    const jobFile = join(hostJobDir, 'job.json');
    await writeFile(jobFile, jobPayload, { mode: 0o644 });
    // The sandbox runs as an unprivileged uid that differs from the server's;
    // make the bind-mounted workspace writable to it.
    await chmod(hostWorkspaceDir, 0o777);

    try {
      const items = await this.runContainer(jobFile, hostWorkspaceDir, eventCallback);
      return { items };
    } finally {
      await rm(hostJobDir, { recursive: true, force: true }).catch(() => undefined);
      await rm(hostWorkspaceDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private buildDockerArgs(jobFile: string, hostWorkspaceDir: string): string[] {
    const image = process.env.RUNNER_SANDBOX_IMAGE || 'starships-sandbox:latest';
    const memory = process.env.RUNNER_SANDBOX_MEMORY || '2g';
    const cpus = process.env.RUNNER_SANDBOX_CPUS || '2';
    const pidsLimit = process.env.RUNNER_SANDBOX_PIDS_LIMIT || '512';
    const network = process.env.RUNNER_SANDBOX_NETWORK || 'bridge';

    return [
      'run',
      '--rm',
      '-i',
      '--network',
      network,
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,size=512m',
      '--memory',
      memory,
      '--cpus',
      cpus,
      '--pids-limit',
      pidsLimit,
      '-e',
      'JOB_FILE=/job/job.json',
      '-e',
      'WORKSPACE_BASE_DIR=/workspace',
      '-e',
      'HOME=/tmp',
      '-v',
      `${jobFile}:/job/job.json:ro`,
      '-v',
      `${hostWorkspaceDir}:/workspace:rw`,
      image,
    ];
  }

  private runContainer(
    jobFile: string,
    hostWorkspaceDir: string,
    eventCallback?: EngineConfig['eventCallback']
  ): Promise<ExecutionItem[]> {
    return new Promise<ExecutionItem[]>((resolve, reject) => {
      const child = spawn('docker', this.buildDockerArgs(jobFile, hostWorkspaceDir), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let result: ExecutionItem[] | undefined;
      let failure: string | undefined;
      const pending: Promise<void>[] = [];

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let parsed: { t?: string; data?: unknown; message?: string };
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          // Non-JSON stdout (e.g. tool/build output) is ignored for control flow.
          return;
        }
        if (parsed.t === 'event') {
          if (eventCallback) {
            pending.push(Promise.resolve(eventCallback(parsed.data as AutopilotEvent)).catch(() => undefined));
          }
        } else if (parsed.t === 'result') {
          result = (Array.isArray(parsed.data) ? parsed.data : []) as ExecutionItem[];
        } else if (parsed.t === 'error') {
          failure = parsed.message || 'sandbox job failed';
        }
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf-8');
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) handleLine(line);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString('utf-8');
      });

      child.on('error', (err) => reject(err));

      child.on('close', async (code) => {
        if (stdoutBuffer) handleLine(stdoutBuffer);
        await Promise.allSettled(pending);
        if (failure) {
          reject(new Error(failure));
          return;
        }
        if (code !== 0) {
          reject(new Error(`sandbox container exited with code ${code}: ${stderrBuffer.slice(0, 2000)}`));
          return;
        }
        resolve(result ?? []);
      });
    });
  }
}
