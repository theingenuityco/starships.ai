import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, chown } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliAgentJobSpec, CliAgentEvent, CliAgentResult, CliWorkspaceSpec, CliGitCredentials } from '@starships/autopilot-cli';
import { StarshipVolumeProvisioner, starshipDefinitionDir } from '@starships/models';
import { getEnvConfig } from '@starships/env';
import { WORKSPACE_CHECKOUT_SUBDIR } from './WorkspaceSessionManager';

/** Where the persistent per-conversation workspace is mounted inside the sandbox. */
const CONTAINER_WORKSPACE_BASE = '/workspace';
const CONTAINER_CHECKOUT_DIR = `${CONTAINER_WORKSPACE_BASE}/${WORKSPACE_CHECKOUT_SUBDIR}`;
/** Where the durable per-starship definition volume is mounted (read-only) inside the sandbox. */
const CONTAINER_STARSHIP_DIR = '/starship';

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
  /**
   * Starship owning this turn. When STARSHIP_FS_AUTHORITY is on, its durable
   * definition volume is bind-mounted read-only at /starship so the agent can
   * read its own `.starship/` definitions.
   */
  starshipId?: string;
  /** No-repo run: the agent's cwd is the mount root (/workspace) rather than a checkout subdir. */
  scratch?: boolean;
  onEvent?: (event: CliAgentEvent) => void | Promise<void>;
  /** Cancellation: aborting SIGKILLs the `docker run` child (reaped by `--rm`), ending the turn. */
  signal?: AbortSignal;
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
    // 0o600: the job file holds the LLM API key and the connector-action callback
    // secret, so it must stay readable only by its owner — not world-readable on the
    // host. The sandbox runs as a non-root UID (Dockerfile USER 1000:1000) that may
    // differ from the server's UID, so chown the file to the sandbox user: it stays
    // secret-safe (0o600) while the bind-mounted, read-only file is still readable
    // inside the container. Secrets via `-e`/`--env-file` would instead leak to `ps`
    // / `docker inspect`, and a world-readable mode would leak to other host users.
    await writeFile(jobFile, JSON.stringify(jobSpec), { mode: 0o600 });
    const sandboxUid = Number(process.env.RUNNER_SANDBOX_UID ?? 1000);
    const sandboxGid = Number(process.env.RUNNER_SANDBOX_GID ?? 1000);
    try {
      await chown(jobFile, sandboxUid, sandboxGid);
    } catch (err) {
      // chown needs privilege (server running as root — the common container case).
      // If it fails and the server's UID differs from the sandbox's, the container
      // would get EACCES reading /job/job.json; surface a clear hint up front.
      console.warn(
        `[CliAgentContainerLauncher] could not chown job file to ${sandboxUid}:${sandboxGid} ` +
          `(${err instanceof Error ? err.message : String(err)}); the sandbox can read it only if it shares the server's UID.`
      );
    }

    // When the filesystem definition plane is authoritative, mount the starship's
    // durable .starship/ volume read-only so the agent can read its own definitions.
    // Provision first: a read-only bind requires the host dir to exist.
    let starshipDefHostDir: string | undefined;
    if (input.starshipId && getEnvConfig().STARSHIP_FS_AUTHORITY === true) {
      try {
        await new StarshipVolumeProvisioner().ensureProvisioned(input.starshipId);
        starshipDefHostDir = starshipDefinitionDir(input.starshipId);
      } catch (err) {
        console.warn(
          `[CliAgentContainerLauncher] could not provision .starship volume for ${input.starshipId}; skipping /starship mount`,
          err instanceof Error ? err.message : err
        );
      }
    }

    try {
      return await this.runContainer(jobFile, hostDir, starshipDefHostDir, onEvent, input.signal);
    } finally {
      // The workspace (hostDir) is the persistent, per-conversation mount owned by
      // WorkspaceSessionManager; only the ephemeral job dir is cleaned here.
      await rm(hostJobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private buildDockerArgs(jobFile: string, hostWorkspaceDir: string, starshipDefHostDir?: string): string[] {
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
      // Read-only definition volume (Stage 4); writable self-edit is Stage 5.
      ...(starshipDefHostDir ? ['-v', `${starshipDefHostDir}:${CONTAINER_STARSHIP_DIR}:ro`] : []),
      image,
      // Override the image's default CMD (jobAgent) to run the CLI agent entrypoint.
      'node',
      CLI_JOB_AGENT_ENTRYPOINT,
    ];
  }

  private runContainer(
    jobFile: string,
    hostWorkspaceDir: string,
    starshipDefHostDir?: string,
    onEvent?: (event: CliAgentEvent) => void | Promise<void>,
    signal?: AbortSignal
  ): Promise<CliAgentResult> {
    return new Promise<CliAgentResult>((resolve, reject) => {
      const child = spawn('docker', this.buildDockerArgs(jobFile, hostWorkspaceDir, starshipDefHostDir), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Cancellation: SIGKILL the `docker run` child (reaped by `--rm`) so a stop request ends the
      // sandbox turn instead of letting the container run to natural completion. Same kill path as
      // the deadline below. Registered before any await so an already-aborted signal still fires.
      let failure: string | undefined;
      const onAbort = () => {
        failure = failure ?? 'sandbox turn cancelled';
        child.kill('SIGKILL');
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let result: CliAgentResult | undefined;
      // Serialize event handling: each onEvent (DB write + stream publish) runs after the
      // previous one. This preserves message ordering and bounds in-flight work (no unbounded
      // array of fire-and-forget promises).
      let eventChain: Promise<void> = Promise.resolve();

      // Hard deadline: if the container hangs (stuck Node process, stalled Docker), kill it so
      // the turn never stays in-flight forever. `--rm` reaps the killed container.
      const timeoutMs = Number(process.env.RUNNER_SANDBOX_TIMEOUT_MS) || 30 * 60 * 1000;
      const deadline = setTimeout(() => {
        failure = failure ?? `sandbox container timed out after ${timeoutMs}ms`;
        child.kill('SIGKILL');
      }, timeoutMs);
      deadline.unref?.();

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
            eventChain = eventChain.then(() => Promise.resolve(onEvent(parsed.data as CliAgentEvent)).catch(() => undefined));
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

      child.on('error', (err) => {
        clearTimeout(deadline);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      });

      child.on('close', async (code) => {
        clearTimeout(deadline);
        signal?.removeEventListener('abort', onAbort);
        if (stdoutBuffer) handleLine(stdoutBuffer);
        await eventChain;
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
