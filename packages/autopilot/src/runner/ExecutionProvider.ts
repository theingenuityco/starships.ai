/**
 * ExecutionProvider
 *
 * Sits ABOVE the Runner. A Runner executes a blueprint "here, now." An
 * ExecutionProvider decides WHERE a (possibly workspace-backed) job runs:
 * inline in this process, in a local hardened container, on the user's machine,
 * or in the user's CI. It provisions any workspace, runs the blueprint via a
 * Runner, streams events, and cleans up. Provider selection is policy and lives
 * in a server-side router; RunnerFactory stays a pure isolation-strategy selector.
 */

import type { Blueprint, Execution, ExecutionItem } from '@/types';
import type { EngineConfig } from '@/engine/Engine';
import type { WorkspaceSpec, GitCredentials } from '@/workspace/Workspace';

export type ExecutionProviderKind = 'inline' | 'local_container' | 'user_machine' | 'github_actions';

/**
 * Workspace-backed (native code) job context. The run operates inside a cloned
 * repo checkout that PERSISTS across the many separate tool-call jobs of a single
 * agent run (read -> write -> test -> PR). `hostDir` is the per-conversation
 * directory the provider mounts into the sandbox. On the first (provisioning)
 * job `spec`+`git` are present so the sandbox clones the repo; on subsequent
 * jobs they are omitted and the existing checkout inside `hostDir` is reused.
 */
export interface ExecutionWorkspace {
  /** Persistent host dir mounted into the sandbox at a fixed path. */
  hostDir: string;
  /** Present only on the provisioning job: clone this repo. */
  spec?: WorkspaceSpec;
  /** Short-lived git credentials for clone + push. Provider-only; never persisted. */
  git?: GitCredentials;
}

export interface ExecutionJob {
  blueprint: Blueprint;
  execution: Execution;
  config: EngineConfig;
  /** Present => workspace-backed (native code) job. */
  workspace?: ExecutionWorkspace;
}

export interface ExecutionResult {
  items: ExecutionItem[];
}

export interface ExecutionProvider {
  readonly kind: ExecutionProviderKind;
  /** Whether this provider can currently accept a job (e.g. a runner is online). */
  isAvailable(ctx: { starshipId: string }): Promise<boolean>;
  /** Provision (if workspace present) + run + stream + cleanup. */
  runJob(job: ExecutionJob): Promise<ExecutionResult>;
}
