import { Executor, ExecuteInput } from './Executor';
import { CancelledError, Engine, type Execution, type WorkspaceSpec, type GitCredentials } from '@starships/autopilot';
import {
  createRunnerHostRuntime,
  type AwsRuntimeConfig,
  type AzureAiFoundryRuntimeConfig,
  type ConnectorSession,
  type LlmRuntimeConfig,
  type ProviderRoute,
} from '../hostRuntime/RunnerHostRuntime';
import type { ConnectorTemplateRuntimeFieldsV2 } from '@starships/protocol/src/domains/connector';
import { executionRegistry } from '@/execution/ExecutionRegistry';
import { LocalWorkspaceProvider } from '@/workspace/LocalWorkspaceProvider';

export class InProcessExecutor implements Executor {
  private static isExecutionResults(value: unknown): value is Execution['results'] {
    if (!Array.isArray(value)) return false;
    for (const r of value) {
      if (!r || typeof r !== 'object') return false;
      const rec = r as { nodeRef?: unknown; items?: unknown };
      if (typeof rec.nodeRef !== 'string') return false;
      if (!Array.isArray(rec.items)) return false;
    }
    return true;
  }

  async execute(input: ExecuteInput): Promise<unknown> {
    const requestId = String(input.requestId || '');
    if (!requestId) {
      throw new Error('requestId is required');
    }
    // If this run was cancelled before it even started, exit immediately.
    if (executionRegistry.isCancelled(requestId)) {
      return null;
    }

    const blueprint = JSON.parse(input.blueprintJson || '{}');
    const execution = JSON.parse(input.executionJson || '{}') as Execution;
    const rawConfig = JSON.parse(input.configJson || '{}') as {
      failOnNodeError?: boolean;
      runtimeEnv?: Record<string, unknown>;
      /**
       * Connector templates (safe) passed from embedding host.
       */
      connectorTemplates?: Record<string, ConnectorTemplateRuntimeFieldsV2 | undefined>;
      /**
       * Connector sessions (auth headers) passed from embedding host.
       */
      connectorSessions?: Record<string, ConnectorSession | undefined>;
      /**
       * Connector instance metadata (non-secret) passed from embedding host.
       * Used for template evaluation in baseUrl/mappings.
       */
      connectorMetadata?: Record<string, Record<string, unknown> | undefined>;
      /**
       * Optional LLM runtime configuration used by HostRuntime.llm. When set,
       * the runner does not need to read provider keys from its own env.
       */
      llm?: LlmRuntimeConfig;
      /**
       * AWS runtime configuration for Bedrock.
       */
      aws?: AwsRuntimeConfig;
      /**
       * Azure AI Foundry runtime configuration.
       */
      azureAiFoundry?: AzureAiFoundryRuntimeConfig;
      /**
       * Model routing table.
       */
      modelRoutes?: Record<string, ProviderRoute[] | undefined>;
      /**
       * Server callback for connector action execution (server-authority mode). When
       * present, the runner delegates connector actions to the host instead of receiving
       * connector templates/sessions.
       */
      connectorActionCallback?: { url: string; secret?: string; starshipId?: string; authUserId?: string };
      /**
       * Workspace-backed (native code) run. `root` is the absolute checkout path
       * inside the sandbox (a persistent, mounted per-conversation dir). On the
       * first (provisioning) job `spec`+`git` are present so we clone into `root`;
       * on subsequent jobs only `root` is present and the existing checkout is
       * reused. FileSystem/Terminal nodes are confined to it. Runner-only;
       * git.token is a secret that MUST NOT be placed in runtimeEnv or the blueprint.
       */
      workspace?: { root?: string; spec?: WorkspaceSpec; git?: GitCredentials };
      [key: string]: unknown;
    };

    // Extract host-runtime-only configuration. NOTE: runtimeEnv is explicitly
    // intended to be exposed to templates via env("KEY") and to user-authored
    // Code/Mutate nodes, but MUST NOT contain secrets.
    const {
      connectorTemplates,
      connectorSessions,
      connectorMetadata,
      connectorActionCallback,
      llm,
      aws,
      azureAiFoundry,
      modelRoutes,
      runtimeEnv,
      workspace,
      ...engineConfig
    } = rawConfig;

    // Provision the workspace (clone) on the first job; reuse the existing
    // checkout on subsequent jobs of the same agent run. The directory is a
    // persistent, host-managed mount, so we never tear it down here.
    let workspaceRoot: string | undefined;
    if (workspace?.spec) {
      const provider = new LocalWorkspaceProvider();
      const provisioned = await provider.provision(workspace.spec, workspace.git ?? { token: '' }, workspace.root);
      workspaceRoot = provisioned.root;
    } else if (workspace?.root) {
      workspaceRoot = workspace.root;
    }

    const controller = new AbortController();

    const hostRuntime = createRunnerHostRuntime({
      connectorTemplates: connectorTemplates ?? {},
      connectorSessions: connectorSessions ?? {},
      connectorMetadata: connectorMetadata ?? {},
      connectorActionCallback,
      runtimeEnv: runtimeEnv ?? {},
      llm,
      aws,
      azureAiFoundry,
      modelRoutes,
      signal: controller.signal,
    });

    const engine = new Engine({
      ...(engineConfig || {}),
      // Ensure env("...") templates resolve inside the Engine (Eval uses Engine.runtimeEnv).
      runtimeEnv: runtimeEnv ?? {},
      hostRuntime,
      workspaceRoot,
      eventCallback: input.onEvent
        ? async (event: unknown) => {
            try {
              await input.onEvent?.({ type: 'event', data: event });
            } catch (err) {
              console.error('[InProcessExecutor] Failed to forward event to onEvent handler', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        : undefined,
      failOnNodeError: engineConfig.failOnNodeError ?? true,
    });

    executionRegistry.register({ requestId, engine, execution, controller });
    try {
      const result = await engine.executeBlueprint(blueprint, execution);
      return result;
    } catch (err) {
      // If this request was cancelled, treat as graceful termination (not error).
      if (executionRegistry.isCancelled(requestId) || err instanceof CancelledError) {
        return InProcessExecutor.isExecutionResults(execution?.results) ? execution.results : null;
      }
      throw err;
    } finally {
      executionRegistry.unregister(requestId);
      // The workspace is a persistent, host-managed mount reused across the
      // agent run's tool calls; teardown is owned by the server-side session
      // manager, never here.
    }
  }
}
