/**
 * Connector tools: the "like how Claude does it" deferred-action surface.
 *
 * Rather than injecting all ~128 connector-action schemas into the model's
 * context and binding them per agent, the agent gets two meta-tools:
 *   - search_actions(query): discover relevant connector actions on demand
 *   - run_action(connector, action, args): execute one via the host runtime
 *
 * Execution is delegated to the host's connectorAction surface, which in the
 * runner round-trips to the server's ConnectorActionExecutor (where auth and
 * secrets live). The agent never sees credentials.
 */

import { bootstrapCodeConnectors, connectorRegistry } from '@starships/connectors';
import type { ActionCatalog, ActionDescriptor, AgentTool } from '@/types';

const DEFAULT_SEARCH_LIMIT = 10;

function descriptorsFromRegistry(connectors?: string[]): ActionDescriptor[] {
  // The registry singleton is empty until a host bootstraps it, and importing
  // @starships/connectors does not self-register. The agent may run in a process
  // (runner sandbox) that never touches the server's bootstrap, so do it here.
  bootstrapCodeConnectors();
  const allow = connectors && connectors.length > 0 ? new Set(connectors) : null;
  const out: ActionDescriptor[] = [];
  for (const def of connectorRegistry.list()) {
    const provider = (def as { provider?: string; name?: string }).provider ?? def.name;
    if (allow && !allow.has(provider)) continue;
    for (const action of def.actions) {
      out.push({
        connector: provider,
        action: action.name,
        description: action.description,
        parameters: (action.parameters as Record<string, unknown>) ?? { type: 'object', properties: {} },
      });
    }
  }
  return out;
}

function scoreMatch(descriptor: ActionDescriptor, terms: string[]): number {
  const haystack = `${descriptor.connector} ${descriptor.action} ${descriptor.description}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (haystack.includes(term)) score += 1;
    if (descriptor.action.toLowerCase().includes(term)) score += 2;
    if (descriptor.connector.toLowerCase() === term) score += 3;
  }
  return score;
}

/**
 * Build an ActionCatalog backed by the in-process connector registry.
 * Pass `connectors` to restrict discovery to a subset (e.g. only what a
 * starship has connected).
 */
export function connectorRegistryCatalog(opts?: { connectors?: string[] }): ActionCatalog {
  const all = descriptorsFromRegistry(opts?.connectors);
  const byKey = new Map(all.map((d) => [`${d.connector}:${d.action}`, d]));
  return {
    list(connector?: string): ActionDescriptor[] {
      return connector ? all.filter((d) => d.connector === connector) : all;
    },
    get(connector: string, action: string): ActionDescriptor | null {
      return byKey.get(`${connector}:${action}`) ?? null;
    },
    search(query: string, limit = DEFAULT_SEARCH_LIMIT): ActionDescriptor[] {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length === 0) return all.slice(0, limit);
      return all
        .map((d) => ({ d, score: scoreMatch(d, terms) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.d);
    },
  };
}

const searchActions: AgentTool = {
  name: 'search_actions',
  description:
    'Discover connector actions (integrations like GitHub, Slack, etc.) relevant to a task. Returns matching actions with their connector, name, and argument schema. Call this before run_action to learn the exact schema.',
  parameters: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'Keywords describing what you want to do, e.g. "create github issue".' },
      limit: { type: 'number', description: `Max results (default ${DEFAULT_SEARCH_LIMIT}).` },
    },
  },
  async run(args, ctx) {
    if (!ctx.catalog) return { content: { error: 'no action catalog available' }, isError: true };
    const query = String(args.query ?? '');
    const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : DEFAULT_SEARCH_LIMIT;
    const matches = ctx.catalog.search(query, limit);
    return { content: { actions: matches } };
  },
};

const runAction: AgentTool = {
  name: 'run_action',
  description:
    'Execute a connector action discovered via search_actions. Provide the connector name, action name, and an args object matching the action schema. Returns the action response.',
  parameters: {
    type: 'object',
    required: ['connector', 'action'],
    properties: {
      connector: { type: 'string', description: 'Connector name, e.g. "github".' },
      action: { type: 'string', description: 'Action name, e.g. "create-issue".' },
      args: { type: 'object', description: 'Arguments for the action, matching its schema.' },
      timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds.' },
    },
  },
  async run(args, ctx) {
    if (!ctx.catalog) return { content: { error: 'no action catalog available' }, isError: true };
    if (!ctx.connectors) return { content: { error: 'no connector runner available' }, isError: true };
    const connector = String(args.connector ?? '');
    const action = String(args.action ?? '');
    if (!connector || !action) return { content: { error: 'connector and action are required' }, isError: true };

    const descriptor = ctx.catalog.get(connector, action);
    if (!descriptor) {
      return {
        content: { error: `unknown action '${connector}:${action}'. Use search_actions to find valid actions.` },
        isError: true,
      };
    }

    const actionArgs = args.args && typeof args.args === 'object' ? (args.args as Record<string, unknown>) : {};
    const timeoutMs = typeof args.timeoutMs === 'number' && args.timeoutMs > 0 ? args.timeoutMs : undefined;

    try {
      const envelope = await ctx.connectors.run({
        connector,
        action,
        args: actionArgs,
        ...(timeoutMs ? { timeoutMs } : {}),
      });
      const isHttpError = typeof envelope.status === 'number' && envelope.status >= 400;
      return { content: { status: envelope.status, body: envelope.body }, isError: isHttpError };
    } catch (err) {
      return { content: { error: err instanceof Error ? err.message : String(err) }, isError: true };
    }
  },
};

/** The default connector discovery/dispatch meta-tools. */
export function buildConnectorTools(): AgentTool[] {
  return [searchActions, runAction];
}
