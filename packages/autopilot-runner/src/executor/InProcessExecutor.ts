import { Executor, ExecuteInput } from './Executor';
import { CancelledError, Engine, type Execution, type WorkspaceSpec, type GitCredentials, type ProvisionedWorkspace } from '@starships/autopilot';
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
       * When present, provision a per-task workspace (clone the repo) and run the
       * blueprint with FileSystem/Terminal nodes confined to it. Runner-only;
       * git.token is a secret that MUST NOT be placed in runtimeEnv or the blueprint.
       */
      workspace?: { spec: WorkspaceSpec; git?: GitCredentials };
      [key: string]: unknown;
    };

    // Extract host-runtime-only configuration. NOTE: runtimeEnv is explicitly
    // intended to be exposed to templates via env("KEY") and to user-authored
    // Code/Mutate nodes, but MUST NOT contain secrets.
    const {
      connectorTemplates,
      connectorSessions,
      connectorMetadata,
      llm,
      aws,
      azureAiFoundry,
      modelRoutes,
      runtimeEnv,
      workspace,
      ...engineConfig
    } = rawConfig;

    // Provision a per-task workspace (clone) when requested, before execution.
    let provisioned: ProvisionedWorkspace | undefined;
    if (workspace?.spec) {
      const provider = new LocalWorkspaceProvider();
      provisioned = await provider.provision(workspace.spec, workspace.git ?? { token: '' });
    }

    const controller = new AbortController();

    const hostRuntime = createRunnerHostRuntime({
      connectorTemplates: connectorTemplates ?? {},
      connectorSessions: connectorSessions ?? {},
      connectorMetadata: connectorMetadata ?? {},
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
      workspaceRoot: provisioned?.root,
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
      if (provisioned) {
        await provisioned.cleanup().catch((err) => {
          console.error('[InProcessExecutor] Failed to clean up workspace', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }
  }
}
