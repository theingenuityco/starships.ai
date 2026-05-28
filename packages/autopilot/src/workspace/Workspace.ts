/**
 * Workspace
 *
 * Per-task isolated working directory for native code execution. A workspace is
 * a cloned git repository on a runner-local filesystem; its absolute root is
 * threaded into the Engine via EngineConfig.workspaceRoot so FileSystem/Terminal
 * nodes operate within it. Provisioning (clone) and teardown (cleanup) are owned
 * by a WorkspaceProvider on the runner side, never by the Engine.
 */

/** Describes the repository checkout a workspace-backed job needs. */
export interface WorkspaceSpec {
  /** HTTPS clone URL with NO embedded credentials. */
  repoUrl: string;
  /** Base branch or commit SHA to check out. Defaults to the repo default branch. */
  ref?: string;
  /** New working branch to create off `ref` (where changes/commits land). */
  branch?: string;
  /** Shallow clone depth. Default 1; 0 means a full clone. */
  depth?: number;
  /** Monorepo subdirectory to operate in (relative to the repo root). */
  subdir?: string;
}

/** A provisioned workspace ready for execution. */
export interface ProvisionedWorkspace {
  /** Absolute path; becomes EngineConfig.workspaceRoot. */
  root: string;
  /** Remove the workspace and scrub any transient credentials. Always call in a finally. */
  cleanup(): Promise<void>;
}

/**
 * Short-lived git credentials used only for the duration of provision/push.
 * Never written to the blueprint, Execution state, runtimeEnv, or logs.
 */
export interface GitCredentials {
  /** Short-lived token (prefer a GitHub App installation token). */
  token: string;
  /** HTTPS basic-auth username. Use `x-access-token` for GitHub App tokens. */
  username?: string;
}

/** Provisions (and the returned handle tears down) per-task workspaces. */
export interface WorkspaceProvider {
  provision(spec: WorkspaceSpec, creds: GitCredentials): Promise<ProvisionedWorkspace>;
}
