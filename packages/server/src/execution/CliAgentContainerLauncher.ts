import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliAgentJobSpec, CliAgentEvent, CliAgentResult, CliWorkspaceSpec, CliGitCredentials } from '@starships/autopilot-cli';
import { WORKSPACE_CHECKOUT_SUBDIR } from './WorkspaceSessionManager';

/** Where the persistent per-conversation workspace is mounted inside the sandbox. */
const CONTAINER_WORKSPACE_BASE = '/workspace';
const CONTAINER_CHECKOUT_DIR = `${CONTAINER_WORKSPACE_BASE}/${WORKSPACE_CHECKOUT_SUBDIR}`;

/** Path to the CLI job-agent entrypoint inside the sandbox image (relative to its WORKDIR). */
const CLI_JOB_AGENT_ENTRYPOINT = process.env.RUNNER_CLI_JOB_AGENT_PATH || 'dist/cliAgent/cliJobAgent.js';

export interface LaunchCliAgentInput {
  /** Job spec, minus the workspace.root which this launcher fixes to the container mount path. */
  spec: Omit<CliAgentJobSpec, 'workspace'> & {
    /** First job: provide spec (+git) to clone; later jobs omit both to reuse the checkout. */
    workspace?: { spec?: CliWorkspaceSpec; git?: CliGitCredentials };
  };
  /** Persistent per-conversation host dir, bind-mounted at /workspace. */
  hostDir: string;
  /** No-repo run: the agent's cwd is the mount root (/workspace) rather than a checkout subdir. */
  scratch?: boolean;
  onEvent?: (event: CliAgentEvent) => void | Promise<void>;
}

/**
 * Launches a code-native terminal agent inside the same hardened, single-use
 * Docker sandbox used for blueprint jobs, but runs the cliJobAgent entrypoint.
 * The whole agent runs in the sandbox: system tools operate on the mounted
 * workspace; connector actions round-trip to the server (credentials never enter
 * the sandbox). Progress streams back over the JobAgent JSON-line protocol.
 */
export class CliAgentContainerLauncher {
  async launch(input: LaunchCliAgentInput): Promise<CliAgentResult> {
    const { hostDir, onEvent } = input;
    const ws = input.spec.workspace;

    // First (provisioning) job carries spec+git so the sandbox clones into the
    // mounted checkout; later jobs carry neither and reuse the existing checkout.
    // Scratch (no-repo) runs work directly in the mount root.
    const root = input.scratch ? CONTAINER_WORKSPACE_BASE : CONTAINER_CHECKOUT_DIR;
    const jobSpec: CliAgentJobSpec = {
      ...input.spec,
      workspace: {
        root,
        ...(ws?.spec ? { spec: ws.spec } : {}),
        ...(ws?.git ? { git: ws.git } : {}),
      },
    } as CliAgentJobSpec;

    const baseDir = process.env.RUNNER_JOB_BASE_DIR || tmpdir();
    const hostJobDir = await mkdtemp(join(baseDir, 'cjob-'));
    const jobFile = join(hostJobDir, 'job.json');
    await writeFile(jobFile, JSON.stringify(jobSpec), { mode: 0o644 });

    try {
      return await this.runContainer(jobFile, hostDir, onEvent);
    } finally {
      // The workspace (hostDir) is the persistent, per-conversation mount owned by
      // WorkspaceSessionManager; only the ephemeral job dir is cleaned here.
      await rm(hostJobDir, { recursive: true, force: true }).catch(() => undefined);
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
      'CLI_JOB_FILE=/job/job.json',
      '-e',
      'WORKSPACE_BASE_DIR=/workspace',
      '-e',
      'HOME=/tmp',
      '-v',
      `${jobFile}:/job/job.json:ro`,
      '-v',
      `${hostWorkspaceDir}:/workspace:rw`,
      image,
      // Override the image's default CMD (jobAgent) to run the CLI agent entrypoint.
      'node',
      CLI_JOB_AGENT_ENTRYPOINT,
    ];
  }

  private runContainer(
    jobFile: string,
    hostWorkspaceDir: string,
    onEvent?: (event: CliAgentEvent) => void | Promise<void>
  ): Promise<CliAgentResult> {
    return new Promise<CliAgentResult>((resolve, reject) => {
      const child = spawn('docker', this.buildDockerArgs(jobFile, hostWorkspaceDir), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let result: CliAgentResult | undefined;
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
          if (onEvent) {
            pending.push(Promise.resolve(onEvent(parsed.data as CliAgentEvent)).catch(() => undefined));
          }
        } else if (parsed.t === 'result') {
          result = parsed.data as CliAgentResult;
        } else if (parsed.t === 'error') {
          failure = parsed.message || 'sandbox cli job failed';
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
        if (!result) {
          reject(new Error('sandbox cli job produced no result'));
          return;
        }
        resolve(result);
      });
    });
  }
}

export const cliAgentContainerLauncher = new CliAgentContainerLauncher();
