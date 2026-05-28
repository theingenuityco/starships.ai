import { mkdtemp, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * WorkspaceSessionManager
 *
 * Owns one persistent, per-conversation workspace directory so a native-code
 * agent run can `checkout-repo` once and then read/write/test/PR against the
 * SAME checkout across many separate tool-call jobs.
 *
 * Lifecycle:
 *  - `bind` allocates (or reuses) a host dir for a conversation+repo. The dir
 *    lives under RUNNER_JOB_BASE_DIR so it is bind-mounted into the sandbox
 *    containers at the identical path (see infra/starship-ec2/docker-compose.yml).
 *  - The repo is cloned INTO `<hostDir>/checkout` by the first (provisioning)
 *    sandbox job — never here on the control plane — so untrusted code and the
 *    clone run as the unprivileged sandbox uid. We chmod the dir 0777 so that
 *    uid can create the checkout inside it.
 *  - `isProvisioned` is derived from disk (`<hostDir>/checkout/.git`) so it
 *    survives a server restart even though the in-memory map does not.
 *  - An idle reaper removes stale workspaces (and the short-lived git token
 *    that lives in their .git-credentials) after RUNNER_WORKSPACE_TTL_MS.
 */

export const WORKSPACE_CHECKOUT_SUBDIR = 'checkout';

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h idle
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export interface WorkspaceSession {
  /** Conversation id (one workspace per agent run). */
  key: string;
  /** Persistent host dir, bind-mounted into sandbox containers. */
  hostDir: string;
  /** HTTPS clone URL (no embedded credentials). */
  repoUrl: string;
  /** Base ref/branch the working branch was cut from. */
  ref?: string;
  /** Working branch where changes/commits land. */
  branch?: string;
  createdAt: number;
  lastUsedAt: number;
}

export class WorkspaceSessionManager {
  private readonly sessions = new Map<string, WorkspaceSession>();
  private sweeper?: ReturnType<typeof setInterval>;

  private baseDir(): string {
    return process.env.RUNNER_JOB_BASE_DIR || tmpdir();
  }

  private ttlMs(): number {
    const raw = Number(process.env.RUNNER_WORKSPACE_TTL_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
  }

  /**
   * Allocate (or reuse) the workspace for a conversation. If a session already
   * exists for a DIFFERENT repo, it is torn down and recreated so a fresh
   * checkout-repo always wins.
   */
  async bind(args: { key: string; repoUrl: string; ref?: string; branch?: string }): Promise<WorkspaceSession> {
    this.ensureSweeper();
    const existing = this.sessions.get(args.key);
    if (existing && existing.repoUrl === args.repoUrl) {
      existing.ref = args.ref ?? existing.ref;
      existing.branch = args.branch ?? existing.branch;
      existing.lastUsedAt = Date.now();
      return existing;
    }
    if (existing) {
      await this.release(args.key);
    }

    const hostDir = await mkdtemp(join(this.baseDir(), 'ws-'));
    // The sandbox runs as an unprivileged uid that differs from the server's;
    // make the workspace writable so it can create the checkout inside it.
    await chmod(hostDir, 0o777);

    const session: WorkspaceSession = {
      key: args.key,
      hostDir,
      repoUrl: args.repoUrl,
      ref: args.ref,
      branch: args.branch,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
    this.sessions.set(args.key, session);
    return session;
  }

  get(key: string): WorkspaceSession | undefined {
    const session = this.sessions.get(key);
    if (session) session.lastUsedAt = Date.now();
    return session;
  }

  /** Host path of the repo checkout inside a session's workspace. */
  checkoutHostDir(session: WorkspaceSession): string {
    return join(session.hostDir, WORKSPACE_CHECKOUT_SUBDIR);
  }

  /** True once the repo has been cloned (derived from disk, restart-safe). */
  isProvisioned(session: WorkspaceSession): boolean {
    return existsSync(join(this.checkoutHostDir(session), '.git'));
  }

  async release(key: string): Promise<void> {
    const session = this.sessions.get(key);
    this.sessions.delete(key);
    if (session) {
      await rm(session.hostDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private ensureSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      void this.sweep();
    }, SWEEP_INTERVAL_MS);
    // Don't keep the process alive just for the reaper.
    this.sweeper.unref?.();
  }

  private async sweep(): Promise<void> {
    const cutoff = Date.now() - this.ttlMs();
    for (const [key, session] of this.sessions) {
      if (session.lastUsedAt < cutoff) {
        await this.release(key);
      }
    }
  }
}

/** Shared singleton. */
export const workspaceSessionManager = new WorkspaceSessionManager();
