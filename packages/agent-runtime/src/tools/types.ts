// The tool framework's core seam.
//
// A *tool* is metadata (a ToolDescriptor) plus behaviour owned by its *toolset provider*.
// Providers are the extension point: `system` (in-process TS, this package), and — on the
// same interface — later `mcp` (a connected MCP server) and `bundle` (user-authored scripts
// or node modules). The runtime never special-cases a source; it talks to the registry, the
// registry talks to providers. See docs/toolsets.md.
import type { ZodTypeAny } from 'zod';

/** A capability a tool declares it needs. Surfaced at approval time; not yet enforced. */
export type Capability = 'fs:workspace' | 'fs:read' | 'network' | 'exec' | 'secrets';

/** What a tool implementation is handed when it runs. */
export interface ToolContext {
  /** Working directory fs / exec tools are scoped to. */
  workspace: string;
  /** Aborts the run (and any in-flight tool). */
  signal: AbortSignal;
  /** Secrets/env the tool declared and was granted (Phase 1+). */
  env?: Record<string, string>;
  /**
   * Deferred-tool controls, injected by the runtime only for the meta-tool
   * (system.tool_search). Lets it search the catalog and pull matches into context.
   */
  deferred?: {
    search: (query: string, max: number) => ToolDescriptor[];
    load: (fqns: string[]) => void;
  };
}

/** A tool's output. `error: true` renders as an error tool_result to the model. */
export interface ToolResult {
  output: string;
  error?: boolean;
}

/** A JSON Schema object — the canonical wire schema for non-Zod providers (mcp / bundles). */
export type JSONSchema = Record<string, unknown>;

/**
 * A tool's input schema as authored. In-process TS tools use Zod; mcp / bundle tools
 * arrive as JSON Schema. The registry converts either form for the model and uses it to
 * render the catalog. Validation is the provider's job (it knows the authored form).
 */
export type ToolSchema = { kind: 'zod'; schema: ZodTypeAny } | { kind: 'json'; schema: JSONSchema };

/** Pure metadata for one tool. No behaviour — execution lives on the provider. */
export interface ToolDescriptor {
  /** Human / config name, dotted: `system.bash`. Unique across the registry. */
  fqn: string;
  /** Bare name within the toolset: `bash`. */
  name: string;
  /** Owning toolset namespace: `system`. */
  toolset: string;
  description: string;
  schema: ToolSchema;
  /** Confirm the call even when not explicitly allowed. */
  sensitive: boolean;
  capabilities: Capability[];
  /**
   * `resident` tools are always in the model's tool list. `deferred` tools appear only in the
   * cheap catalog (name + description) until the model loads them via system.tool_search —
   * this is what keeps a large catalog (many user / mcp tools) from filling the context.
   */
  residency: 'resident' | 'deferred';
}

/** Context handed to a provider's init(). Carries config a provider needs to enumerate. */
export interface ProviderInitContext {
  /** Default workspace for the run (a provider may use it to resolve relative bundle paths). */
  workspace?: string;
}

/**
 * A source of tools. `init` enumerates (and for long-lived sources like mcp, connects);
 * `execute` runs one tool and validates its own input; `dispose` tears down connections.
 */
export interface ToolsetProvider {
  /** Toolset namespace, e.g. `system`. Must be unique in a registry. */
  readonly name: string;
  readonly source: 'system' | 'user' | 'mcp';
  init(ctx: ProviderInitContext): Promise<ToolDescriptor[]>;
  execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult>;
  dispose?(): Promise<void>;
}
