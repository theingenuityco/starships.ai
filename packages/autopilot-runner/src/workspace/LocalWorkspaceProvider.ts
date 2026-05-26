/**
 * LocalWorkspaceProvider
 *
 * Provisions a per-task workspace on the local filesystem by cloning a git repo.
 * Runs inside the sandbox container (or the runner process). The clone uses a
 * workspace-local git credential store so the token stays off argv and out of
 * the remote URL, while still letting later `git push` from the (env-scrubbed)
 * Terminal node authenticate.
 *
 * The credential file lives in the workspace's parent dir (NOT the checkout)
 * so `git clone` sees an empty destination, and the repo's local git config
 * points back at it so push keeps working. When a `targetRoot` is given (the
 * persistent, per-conversation mount) the checkout is created there and is left
 * in place on cleanup; the host-side session manager owns teardown.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import type { WorkspaceSpec, ProvisionedWorkspace, WorkspaceProvider, GitCredentials } from '@starships/autopilot';

const execFileAsync = promisify(execFile);

const DEFAULT_COMMIT_NAME = 'Starships Bot';
const DEFAULT_COMMIT_EMAIL = 'bot@starships.ai';

export class LocalWorkspaceProvider implements WorkspaceProvider {
  /**
   * @param targetRoot Absolute path the checkout should be created at. When
   *        provided (persistent per-conversation workspace) the parent dir is
   *        assumed to already exist and be writable.
   */
  async provision(spec: WorkspaceSpec, creds: GitCredentials, targetRoot?: string): Promise<ProvisionedWorkspace> {
    const baseDir = process.env.WORKSPACE_BASE_DIR || tmpdir();
    const workDir = targetRoot ? dirname(targetRoot) : await mkdtemp(join(baseDir, 'ws-'));
    const root = targetRoot ?? join(workDir, 'checkout');

    try {
      const hasToken = Boolean(creds.token && creds.token.length > 0);
      const username = creds.username || 'x-access-token';
      const host = new URL(spec.repoUrl).host;
      // Keep the credential store OUTSIDE the checkout so `git clone` sees an
      // empty destination, but ON the (persistent) workspace mount so a later
      // env-scrubbed `git push` can still read it.
      const credFile = join(workDir, '.git-credentials');
      const credHelper = `store --file=${credFile}`;

      if (hasToken) {
        // git "store" credential helper format, one entry per line.
        await writeFile(credFile, `https://${encodeURIComponent(username)}:${creds.token}@${host}\n`, { mode: 0o600 });
        await chmod(credFile, 0o600);
      }

      const cloneArgs: string[] = [];
      if (hasToken) {
        cloneArgs.push('-c', `credential.helper=${credHelper}`, '-c', 'credential.useHttpPath=false');
      }
      cloneArgs.push('clone');
      const depth = spec.depth ?? 1;
      if (depth > 0) {
        cloneArgs.push('--depth', String(depth));
      }
      cloneArgs.push(spec.repoUrl, root);
      await this.git(cloneArgs, undefined, { GIT_TERMINAL_PROMPT: '0' });

      // Persist the credential helper + identity in the repo so later git push
      // (run by the Terminal node with a scrubbed env) can still authenticate.
      if (hasToken) {
        await this.git(['-C', root, 'config', 'credential.helper', credHelper]);
        await this.git(['-C', root, 'config', 'credential.useHttpPath', 'false']);
      }
      await this.git(['-C', root, 'config', 'user.name', DEFAULT_COMMIT_NAME]);
      await this.git(['-C', root, 'config', 'user.email', DEFAULT_COMMIT_EMAIL]);

      if (spec.ref) {
        await this.git(['-C', root, 'fetch', '--depth', '1', 'origin', spec.ref], undefined, { GIT_TERMINAL_PROMPT: '0' });
        await this.git(['-C', root, 'checkout', spec.ref]);
      }
      if (spec.branch) {
        await this.git(['-C', root, 'checkout', '-B', spec.branch]);
      }

      return {
        root,
        // The persistent (targetRoot) workspace is torn down by the host-side
        // session manager, so cleanup is a no-op there; the ephemeral mkdtemp
        // path removes its own working dir.
        cleanup: async () => {
          if (!targetRoot) {
            await rm(workDir, { recursive: true, force: true });
          }
        },
      };
    } catch (err) {
      // Best-effort teardown if provisioning failed partway through.
      await rm(targetRoot ? root : workDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  private async git(args: string[], cwd?: string, extraEnv?: Record<string, string>): Promise<void> {
    await execFileAsync('git', args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      maxBuffer: 64 * 1024 * 1024,
    });
  }
}
