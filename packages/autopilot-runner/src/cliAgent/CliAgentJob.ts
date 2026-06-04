/**
 * CliAgentJob
 *
 * Runs a code-native terminal agent (@starships/autopilot-cli) inside the
 * runner. This is the agent-execution counterpart to InProcessExecutor (which
 * runs DAG blueprints): given a job spec, it provisions/reuses the workspace,
 * builds the model client + connector-action dispatcher from host config, and
 * runs the agent loop to completion, streaming events back to the caller.
 *
 * The whole agent runs here (in the sandbox): system tools operate on the
 * mounted workspace in-process, and connector actions round-trip to the server
 * via the connector-action callback (so credentials never enter the sandbox).
 */

import type { WorkspaceSpec, GitCredentials } from '@starships/protocol';
import {
  runCliAgent,
  httpConnectorActionRunner,
  buildPermissionPolicy,
  type CliAgentJobSpec,
  type CliAgentEvent,
  type CliAgentResult,
} from '@starships/autopilot-cli';
import { LocalWorkspaceProvider } from '@/workspace/LocalWorkspaceProvider';

export type { CliAgentJobSpec };

export interface RunCliAgentJobOptions {
  onEvent?: (event: CliAgentEvent) => void | Promise<void>;
  signal?: AbortSignal;
}

export async function runCliAgentJob(spec: CliAgentJobSpec, opts: RunCliAgentJobOptions = {}): Promise<CliAgentResult> {
  // Provision (clone) on the first job; reuse the existing checkout otherwise.
  // The directory is a persistent, host-managed mount, so we never tear it down here.
  // Fall back to the launcher-injected mount root (WORKSPACE_BASE_DIR=/workspace)
  // before process.cwd(): a scratch run has no spec.workspace.root, and the agent
  // should operate on the mounted workspace, not the container's working directory.
  let cwd = spec.workspace?.root ?? process.env.WORKSPACE_BASE_DIR ?? process.cwd();
  if (spec.workspace?.spec) {
    const provider = new LocalWorkspaceProvider();
    const provisioned = await provider.provision(
      spec.workspace.spec as WorkspaceSpec,
      (spec.workspace.git ?? { token: '' }) as GitCredentials,
      spec.workspace.root
    );
    cwd = provisioned.root;
  }

  const connectors = httpConnectorActionRunner({
    url: spec.connectorActionCallback.url,
    ...(spec.connectorActionCallback.secret ? { secret: spec.connectorActionCallback.secret } : {}),
    starshipId: spec.connectorActionCallback.starshipId,
    authUserId: spec.connectorActionCallback.authUserId,
    ...(spec.runtimeEnv ? { runtimeEnv: spec.runtimeEnv } : {}),
  });

  return runCliAgent({
    model: spec.model,
    modelClient: {
      apiKey: spec.llm.apiKey,
      ...(spec.llm.baseUrl ? { baseURL: spec.llm.baseUrl } : {}),
      ...(spec.llm.defaultHeaders ? { defaultHeaders: spec.llm.defaultHeaders } : {}),
    },
    systemPrompt: spec.systemPrompt,
    messages: spec.messages,
    cwd,
    connectors,
    ...(spec.discoverConnectors ? { discoverConnectors: spec.discoverConnectors } : {}),
    ...(spec.permissions ? { permission: buildPermissionPolicy(spec.permissions) } : {}),
    ...(spec.approvals ? { approvals: spec.approvals } : {}),
    ...(spec.temperature !== undefined ? { temperature: spec.temperature } : {}),
    ...(spec.maxTokens !== undefined ? { maxTokens: spec.maxTokens } : {}),
    ...(spec.timeout !== undefined ? { timeout: spec.timeout } : {}),
    ...(spec.reasoning ? { reasoning: spec.reasoning } : {}),
    ...(spec.extras ? { extras: spec.extras } : {}),
    ...(spec.maxSteps !== undefined ? { maxSteps: spec.maxSteps } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.onEvent ? { onEvent: opts.onEvent } : {}),
  });
}
