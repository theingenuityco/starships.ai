/**
 * `.autopilot` bootstrap — the CLI reading its own definition from the filesystem,
 * exactly like `claude` reads `.claude`.
 *
 * Given a definition root and the agent slug to embody, this resolves the agent's
 * identity (persona, model, tuning) from `<root>/agents/<slug>.md` and the connector
 * allow-list from `<root>/connectors/*.yaml`, using the pure `@starships/definition`
 * codecs. It never touches the database; in hosted mode the server still bakes the
 * same fields into the job spec as a fallback (used when no file is present).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { agentFilename, parseAgent, parseConnector } from '@starships/definition';

/**
 * Connectors every agent can always reach, mirroring the server's
 * ALWAYS_DISCOVERABLE_CONNECTORS so the file-driven allow-list matches the
 * DB-driven one.
 */
export const ALWAYS_DISCOVERABLE_CONNECTORS = ['system', 'starships'] as const;

/**
 * Sentinel the server substitutes for the agent persona when it composes the
 * per-turn system-prompt context (so the CLI can splice the file persona into the
 * exact same canonical layout). Chosen from a Unicode private-use range so it
 * cannot collide with authored prompt text.
 */
export const PERSONA_PLACEHOLDER = 'AUTOPILOT_PERSONA';

/** The agent identity + capabilities resolved from a `.autopilot/` volume. */
export interface LoadedAutopilotDefinition {
  /** The agent's system prompt (markdown body of its `.md` file). */
  persona?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean };
  /** Connector providers this agent may discover (yaml providers + always-on). */
  discoverConnectors: string[];
}

/**
 * Resolve the `.autopilot` definition root for a run. Prefers the bind-mounted
 * volume (`/autopilot`, hosted) and falls back to `<cwd>/.autopilot` (standalone,
 * the directory lives inside the agent's home). Returns undefined when neither
 * has an `agents/` directory, so the caller keeps the baked spec.
 */
export function resolveDefinitionRoot(cwd: string): string | undefined {
  const mounted = '/autopilot';
  if (existsSync(join(mounted, 'agents'))) return mounted;
  const local = join(cwd, '.autopilot');
  if (existsSync(join(local, 'agents'))) return local;
  return undefined;
}

/**
 * Load the agent's authored definition from a `.autopilot` root. Returns null when
 * the agent's file does not exist (so the caller falls back to the baked spec).
 * Malformed connector files are skipped (best-effort allow-list), but a malformed
 * agent file throws — the agent's own identity must be valid.
 */
export function loadAutopilotDefinition(root: string, agentSlug: string): LoadedAutopilotDefinition | null {
  const agentPath = join(root, 'agents', agentFilename(agentSlug));
  if (!existsSync(agentPath)) return null;

  const agent = parseAgent(readFileSync(agentPath, 'utf-8'));

  const providers = new Set<string>(ALWAYS_DISCOVERABLE_CONNECTORS);
  const connectorsDir = join(root, 'connectors');
  if (existsSync(connectorsDir)) {
    for (const file of readdirSync(connectorsDir)) {
      if (!file.toLowerCase().endsWith('.yaml')) continue;
      try {
        const connector = parseConnector(readFileSync(join(connectorsDir, file), 'utf-8'));
        if (connector.provider) providers.add(connector.provider);
      } catch {
        // Skip a malformed connector file rather than failing the whole turn.
      }
    }
  }

  return {
    ...(agent.systemPrompt !== undefined ? { persona: agent.systemPrompt } : {}),
    ...(agent.model ? { model: agent.model } : {}),
    ...(typeof agent.temperature === 'number' ? { temperature: agent.temperature } : {}),
    ...(typeof agent.maxTokens === 'number' ? { maxTokens: agent.maxTokens } : {}),
    ...(typeof agent.timeout === 'number' ? { timeout: agent.timeout } : {}),
    ...(agent.reasoning ? { reasoning: agent.reasoning } : {}),
    discoverConnectors: Array.from(providers),
  };
}
