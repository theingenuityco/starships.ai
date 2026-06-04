import * as yaml from 'js-yaml';
import type { AgentModel } from '@starships/protocol';
import type { AgentDefinition, AgentReasoningConfig } from './types';

/**
 * Codec between an {@link AgentModel} (index row) and its `.starship/agents/<slug>.md`
 * file: YAML frontmatter (config) + markdown body (the system prompt).
 *
 * Round-trip is lossless for the *authored* fields. Index-only fields
 * (createdAt/updatedAt, starshipId, state, contentHash, attachment ids) are not
 * serialized — they are reconciled, not authored. Full entity validation runs
 * at the reconciler boundary (where starshipId is known); the codec only does
 * structural parsing + required-field checks.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** The filename for an agent definition given its slug. */
export function agentFilename(slug: string): string {
  return `${slug}.md`;
}

/** The slug encoded by an agent filename (inverse of {@link agentFilename}). */
export function agentSlugFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

function reasoningOrUndefined(value: unknown): AgentReasoningConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as Record<string, unknown>;
  const out: AgentReasoningConfig = {};
  if (r.effort === 'low' || r.effort === 'medium' || r.effort === 'high') out.effort = r.effort;
  if (typeof r.max_tokens === 'number') out.max_tokens = r.max_tokens;
  if (typeof r.exclude === 'boolean') out.exclude = r.exclude;
  if (typeof r.enabled === 'boolean') out.enabled = r.enabled;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Build an object with a deliberate key order, dropping undefined values. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as Partial<T>;
}

/** Map an index row (AgentModel) to its authored definition shape. */
export function agentModelToDefinition(agent: AgentModel, opts?: { connectors?: string[] }): AgentDefinition {
  return compact({
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    role: agent.role || 'Assistant',
    description: agent.description,
    model: agent.model,
    category: agent.category,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    timeout: agent.timeout,
    reasoning: reasoningOrUndefined(agent.reasoning),
    previewPrompts: agent.previewPrompts && agent.previewPrompts.length > 0 ? agent.previewPrompts : undefined,
    version: agent.version || '1.0.0',
    connectors: opts?.connectors && opts.connectors.length > 0 ? opts.connectors : undefined,
    systemPrompt: agent.systemPrompt,
  }) as AgentDefinition;
}

/** Serialize an authored agent definition to its `.md` file form. */
export function serializeAgentDefinition(def: AgentDefinition): string {
  const frontmatter = compact({
    id: def.id,
    slug: def.slug,
    name: def.name,
    role: def.role || 'Assistant',
    description: def.description,
    model: def.model,
    category: def.category,
    version: def.version || '1.0.0',
    temperature: def.temperature,
    maxTokens: def.maxTokens,
    timeout: def.timeout,
    reasoning: reasoningOrUndefined(def.reasoning),
    previewPrompts: def.previewPrompts && def.previewPrompts.length > 0 ? def.previewPrompts : undefined,
    connectors: def.connectors && def.connectors.length > 0 ? def.connectors : undefined,
  });

  const fm = yaml.dump(frontmatter, { sortKeys: false, lineWidth: -1, noRefs: true });
  const body = (def.systemPrompt ?? '').trim();
  return `---\n${fm}---\n\n${body}\n`;
}

/**
 * Serialize an agent (index row) to its file form. `connectors` is the optional
 * per-agent connector scope, which is not part of AgentModel and is supplied by
 * the caller (CRUD route / backfill).
 */
export function serializeAgent(agent: AgentModel, opts?: { connectors?: string[] }): string {
  return serializeAgentDefinition(agentModelToDefinition(agent, opts));
}

/** Parse an agent definition file. Throws on malformed/missing required fields. */
export function parseAgent(raw: string): AgentDefinition {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    throw new Error('agent definition is missing YAML frontmatter (expected a leading `---` block)');
  }
  const data = (yaml.load(match[1]) ?? {}) as Record<string, unknown>;
  const body = match[2] ?? '';

  const requireString = (key: string): string => {
    const v = data[key];
    if (typeof v !== 'string' || v.trim() === '') {
      throw new Error(`agent definition field '${key}' must be a non-empty string`);
    }
    return v;
  };

  const numberOrUndefined = (key: string): number | undefined => {
    const v = data[key];
    if (v === undefined || v === null) return undefined;
    const n = Number(v);
    if (Number.isNaN(n)) throw new Error(`agent definition field '${key}' must be a number`);
    return n;
  };

  const stringArrayOrUndefined = (key: string): string[] | undefined => {
    const v = data[key];
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
      throw new Error(`agent definition field '${key}' must be an array of strings`);
    }
    return v as string[];
  };

  // Symmetric with serialize, which writes the trimmed prompt as the body after a
  // blank separator line. Trim both ends so serialize(parse(x)) === serialize(x).
  const trimmedBody = body.trim();
  const systemPrompt = trimmedBody === '' ? undefined : trimmedBody;

  return compact({
    id: requireString('id'),
    slug: requireString('slug'),
    name: requireString('name'),
    role: typeof data.role === 'string' && data.role.trim() ? data.role : 'Assistant',
    description: typeof data.description === 'string' ? data.description : undefined,
    model: requireString('model'),
    category: typeof data.category === 'string' ? data.category : undefined,
    temperature: numberOrUndefined('temperature'),
    maxTokens: numberOrUndefined('maxTokens'),
    timeout: numberOrUndefined('timeout'),
    reasoning: reasoningOrUndefined(data.reasoning),
    previewPrompts: stringArrayOrUndefined('previewPrompts'),
    version: typeof data.version === 'string' && data.version.trim() ? data.version : '1.0.0',
    connectors: stringArrayOrUndefined('connectors'),
    systemPrompt,
  }) as AgentDefinition;
}
