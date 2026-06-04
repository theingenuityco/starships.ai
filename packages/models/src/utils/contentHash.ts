import { createHash } from 'crypto';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deterministic JSON stringify with stable object key ordering.
 * - Objects: keys sorted lexicographically
 * - Arrays: order preserved
 * - Undefined: omitted (to match JSON.stringify behavior on objects)
 */
export function stableStringify(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return null;
      if (!Number.isFinite(v)) return null;
      return v;
    }
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map(normalize);
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v).sort()) {
        const nv = normalize(v[key]);
        if (nv !== undefined) out[key] = nv;
      }
      return out;
    }
    // Fallback for class instances / Dates / etc: best-effort JSON conversion
    try {
      return normalize(JSON.parse(JSON.stringify(v)));
    } catch {
      return String(v);
    }
  };

  return JSON.stringify(normalize(value));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function computeToolContentHash(input: {
  name: unknown;
  description: unknown;
  parameters: unknown;
  /** @deprecated DAG removed; accepted but ignored for backward-compat with legacy callers. */
  blueprint?: unknown;
  transforms: unknown;
  mutations: unknown;
  condition: unknown;
  isEnabled: unknown;
  status: unknown;
}): string {
  return sha256Hex(
    stableStringify({
      name: input.name ?? '',
      description: input.description ?? '',
      parameters: input.parameters ?? null,
      transforms: input.transforms ?? null,
      mutations: input.mutations ?? null,
      condition: input.condition ?? null,
      isEnabled: input.isEnabled ?? true,
      status: input.status ?? 'active',
    })
  );
}

export function computeAgentContentHash(input: {
  name: unknown;
  role: unknown;
  description: unknown;
  model: unknown;
  temperature: unknown;
  maxTokens: unknown;
  timeout: unknown;
  reasoning: unknown;
  systemPrompt: unknown;
  state: unknown;
  /** @deprecated DAG removed; accepted but ignored for backward-compat with legacy callers. */
  blueprint?: unknown;
  category: unknown;
  previewPrompts: unknown;
  /** @deprecated Tools abstraction removed; accepted but ignored for backward-compat with legacy callers. */
  assignedToolSlugs?: unknown;
}): string {
  return sha256Hex(
    stableStringify({
      name: input.name ?? '',
      role: input.role ?? 'Assistant',
      description: input.description ?? '',
      model: input.model ?? '',
      temperature: input.temperature ?? null,
      maxTokens: input.maxTokens ?? null,
      timeout: input.timeout ?? null,
      reasoning: input.reasoning ?? null,
      systemPrompt: input.systemPrompt ?? null,
      state: input.state ?? null,
      category: input.category ?? null,
      previewPrompts: input.previewPrompts ?? null,
    })
  );
}
