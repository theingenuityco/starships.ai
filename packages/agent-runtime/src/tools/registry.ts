// The tool registry: the runtime's single point of contact for tools.
//
// Holds the registered providers, aggregates their descriptors, and owns:
//  - namespacing + the wire-name encoding (providers/models forbid `.` in tool names,
//    so the dotted fqn `system.bash` is encoded to the wire name `system__bash`),
//  - the AI SDK tool map the model sees (only resident + loaded tools — the deferred model),
//  - catalog rendering (cheap name+description listing of deferred tools),
//  - search (what system.tool_search calls to pull deferred tools into context),
//  - allowlist matching (exact, `ns.*` wildcard, `*`, and legacy bare-name back-compat).
import { tool, jsonSchema, type Tool } from 'ai';
import type { ProviderInitContext, ToolContext, ToolDescriptor, ToolResult, ToolsetProvider } from './types';

/** Encode a dotted fqn to a provider-safe wire name (`system.bash` -> `system__bash`). */
export function toWireName(fqn: string): string {
  return fqn.replace('.', '__');
}

interface Entry {
  provider: ToolsetProvider;
  descriptor: ToolDescriptor;
  wire: string;
}

export class ToolRegistry {
  private readonly providers = new Map<string, ToolsetProvider>();
  private readonly byFqn = new Map<string, Entry>();
  private readonly byWire = new Map<string, Entry>();

  /** Register a provider: init it, then index every descriptor it returns. */
  async register(provider: ToolsetProvider, ctx: ProviderInitContext = {}): Promise<void> {
    if (this.providers.has(provider.name)) {
      throw new Error(`Toolset "${provider.name}" is already registered`);
    }
    const descriptors = await provider.init(ctx);
    this.providers.set(provider.name, provider);
    for (const descriptor of descriptors) {
      if (this.byFqn.has(descriptor.fqn)) {
        throw new Error(`Duplicate tool fqn: ${descriptor.fqn}`);
      }
      const entry: Entry = { provider, descriptor, wire: toWireName(descriptor.fqn) };
      this.byFqn.set(descriptor.fqn, entry);
      this.byWire.set(entry.wire, entry);
    }
  }

  /** Resolve an incoming wire name (what the model called) to its provider + descriptor. */
  resolveWire(wire: string): Entry | undefined {
    return this.byWire.get(wire);
  }

  get(fqn: string): Entry | undefined {
    return this.byFqn.get(fqn);
  }

  all(): ToolDescriptor[] {
    return [...this.byFqn.values()].map((e) => e.descriptor);
  }

  /** Fqns that are always in the model's tool list (no search needed). */
  residentFqns(): string[] {
    return [...this.byFqn.values()].filter((e) => e.descriptor.residency === 'resident').map((e) => e.descriptor.fqn);
  }

  /** Run a tool by fqn through its owning provider. */
  execute(fqn: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const entry = this.byFqn.get(fqn);
    if (!entry) return Promise.resolve({ output: `Unknown tool: ${fqn}`, error: true });
    return entry.provider.execute(entry.descriptor.name, input, ctx);
  }

  /**
   * Build the AI SDK tool map for the given fqns (resident + whatever's been loaded this run).
   * Keyed by wire name. No `execute` — the runtime gates + runs each call itself.
   */
  buildSdkTools(fqns: string[]): Record<string, Tool> {
    const out: Record<string, Tool> = {};
    for (const fqn of fqns) {
      const entry = this.byFqn.get(fqn);
      if (!entry) continue;
      const { schema, description } = entry.descriptor;
      // Zod passes straight through tool(); JSON Schema is wrapped with the SDK's jsonSchema().
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputSchema: any = schema.kind === 'zod' ? schema.schema : jsonSchema(schema.schema as Record<string, never>);
      out[entry.wire] = tool({ description, inputSchema });
    }
    return out;
  }

  /**
   * Search the catalog. `select:a.b,c.d` loads exact fqns; otherwise a keyword match over
   * fqn + description, ranked by hit count. Returns descriptors (the runtime adds them to
   * the loaded set so their schemas appear next step).
   */
  search(query: string, max = 10): ToolDescriptor[] {
    const trimmed = query.trim();
    if (trimmed.toLowerCase().startsWith('select:')) {
      const names = trimmed
        .slice('select:'.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return names.map((n) => this.byFqn.get(n)?.descriptor).filter((d): d is ToolDescriptor => Boolean(d));
    }
    const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const scored = this.all()
      .map((d) => {
        const hay = `${d.fqn} ${d.description}`.toLowerCase();
        const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
        return { d, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map((x) => x.d);
  }

  /**
   * A compact listing of deferred tools not yet loaded, grouped by toolset, for the system
   * prompt. Names + descriptions only — schemas stay out of context until searched. Returns
   * '' when there is nothing deferred (e.g. a system-only run).
   */
  catalog(loaded: ReadonlySet<string>): string {
    const deferred = this.all().filter((d) => d.residency === 'deferred' && !loaded.has(d.fqn));
    if (!deferred.length) return '';
    const byToolset = new Map<string, ToolDescriptor[]>();
    for (const d of deferred) {
      const list = byToolset.get(d.toolset) ?? [];
      list.push(d);
      byToolset.set(d.toolset, list);
    }
    const lines = [...byToolset.entries()].map(([ts, tools]) => {
      const items = tools.map((t) => `    ${t.fqn} — ${t.description}`).join('\n');
      return `  ${ts} (${tools.length} tool${tools.length === 1 ? '' : 's'}):\n${items}`;
    });
    return [
      'Additional tools are available but not yet loaded. To use one, first call `tool_search`',
      'with a keyword query (or `select:<fqn>,<fqn>`); its schema then becomes callable.',
      '',
      ...lines,
    ].join('\n');
  }

  /**
   * Does `allow` permit `fqn`? Matches: `*` (all), exact fqn, `ns.*` (whole toolset), and a
   * legacy bare name (`bash`) against the tool's bare name for back-compat with pre-namespace
   * allowlists.
   */
  isAllowed(fqn: string, allow: Iterable<string>): boolean {
    const entry = this.byFqn.get(fqn);
    const bare = entry?.descriptor.name;
    for (const a of allow) {
      if (a === '*' || a === fqn) return true;
      if (a.endsWith('.*') && fqn.startsWith(a.slice(0, -1))) return true;
      if (!a.includes('.') && a === bare) return true;
    }
    return false;
  }

  /** Tear down every provider's long-lived resources (mcp connections, spawned servers). */
  async dispose(): Promise<void> {
    await Promise.all([...this.providers.values()].map((p) => p.dispose?.()));
  }
}
