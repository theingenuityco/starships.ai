import { z } from 'zod';
import type { SystemTool } from './tool';

// The deferred-tool meta-tool. Most tools (user bundles, mcp servers) are advertised in the
// system prompt as a cheap name+description catalog but kept OUT of the model's tool list to
// save context. Calling tool_search pulls matches into the loaded set, so their full schemas
// become callable on the next step. This is the same load-on-demand pattern a large catalog
// needs to stay within the context window.
export const toolSearchTool: SystemTool = {
  name: 'tool_search',
  description:
    'Search for and load additional tools that are not yet available. ' +
    'Pass a keyword query (e.g. "create github issue") or `select:<fqn>,<fqn>` to load exact tools. ' +
    'Loaded tools become callable on your next step.',
  schema: z.object({
    query: z.string().describe('Keyword query, or "select:toolset.tool,toolset.tool" for exact tools.'),
    max_results: z.number().int().positive().max(50).optional().describe('Max tools to load (default 10).'),
  }),
  sensitive: false,
  capabilities: [],
  run: async (input, ctx) => {
    if (!ctx.deferred) return 'Tool search is unavailable in this run.';
    const { query, max_results } = input as { query: string; max_results?: number };
    const matches = ctx.deferred.search(query, max_results ?? 10);
    if (!matches.length) return `No tools matched "${query}".`;
    ctx.deferred.load(matches.map((m) => m.fqn));
    const lines = matches.map((m) => `- ${m.fqn}${m.sensitive ? ' (sensitive)' : ''} — ${m.description}`);
    return `Loaded ${matches.length} tool${matches.length === 1 ? '' : 's'} (callable next step):\n${lines.join('\n')}`;
  },
};
