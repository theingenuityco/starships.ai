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

import { existsSync } from 'node:fs';
import type { WorkspaceSpec, GitCredentials } from '@starships/protocol';
import {
  runCliAgent,
  httpConnectorActionRunner,
  buildPermissionPolicy,
  loadAutopilotDefinition,
  resolveDefinitionRoot,
  PERSONA_PLACEHOLDER,
  type CliAgentJobSpec,
  type CliAgentEvent,
  type CliAgentResult,
} from '@starships/autopilot-cli';
import { LocalWorkspaceProvider } from '@/workspace/LocalWorkspaceProvider';

export type { CliAgentJobSpec };

/** Container path where the launcher bind-mounts the starship's `.autopilot/` volume. */
const STARSHIP_MOUNT_DIR = '/autopilot';

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

  // When the launcher bind-mounts the starship's definition volume (Stage 4+),
  // expose it as a read root so the agent's read/ls tools can read its own
  // `.autopilot/` definitions, not just via bash.
  const readRoots = existsSync(STARSHIP_MOUNT_DIR) ? [STARSHIP_MOUNT_DIR] : undefined;

  // .autopilot bootstrap: when the server marks this turn file-authoritative,
  // the agent's identity (persona, model, tuning) and connector allow-list come
  // from the mounted `.autopilot/` volume — the file is the source of truth. The
  // baked spec fields are the fallback when no file is present.
  let model = spec.model;
  let systemPrompt = spec.systemPrompt;
  let temperature = spec.temperature;
  let maxTokens = spec.maxTokens;
  let timeout = spec.timeout;
  let reasoning = spec.reasoning;
  let discoverConnectors = spec.discoverConnectors;
  if (spec.fsBootstrap && spec.agentSlug) {
    const root = resolveDefinitionRoot(cwd);
    if (root) {
      try {
        const def = loadAutopilotDefinition(root, spec.agentSlug);
        if (def) {
          if (def.model) model = def.model;
          if (def.temperature !== undefined) temperature = def.temperature;
          if (def.maxTokens !== undefined) maxTokens = def.maxTokens;
          if (def.timeout !== undefined) timeout = def.timeout;
          if (def.reasoning) reasoning = def.reasoning;
          discoverConnectors = def.discoverConnectors;
          if (def.persona !== undefined) {
            // The server composed the per-turn context with PERSONA_PLACEHOLDER
            // standing in for the persona; splice the file persona into the exact
            // canonical layout. Without a context (older spec), use the persona raw.
            systemPrompt = spec.systemPromptContext
              ? spec.systemPromptContext.split(PERSONA_PLACEHOLDER).join(def.persona)
              : def.persona;
          }
        }
      } catch (err) {
        console.warn(
          `[CliAgentJob] .autopilot bootstrap failed for agent ${spec.agentSlug}; using baked spec`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  return runCliAgent({
    model,
    modelClient: {
      apiKey: spec.llm.apiKey,
      ...(spec.llm.baseUrl ? { baseURL: spec.llm.baseUrl } : {}),
      ...(spec.llm.defaultHeaders ? { defaultHeaders: spec.llm.defaultHeaders } : {}),
    },
    systemPrompt,
    messages: spec.messages,
    cwd,
    ...(readRoots ? { readRoots } : {}),
    connectors,
    ...(discoverConnectors ? { discoverConnectors } : {}),
    ...(spec.permissions ? { permission: buildPermissionPolicy(spec.permissions) } : {}),
    ...(spec.approvals ? { approvals: spec.approvals } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(spec.extras ? { extras: spec.extras } : {}),
    ...(spec.maxSteps !== undefined ? { maxSteps: spec.maxSteps } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.onEvent ? { onEvent: opts.onEvent } : {}),
  });
}
