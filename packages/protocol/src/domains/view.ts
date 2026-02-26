/**
 * View Domain Types
 *
 * A "View" is a persisted, starship-scoped screen/app definition.
 *
 * - Layout/composability is provided by the root widget (container widgets with children).
 * - Interactivity is defined via events + handlers (optionally backed by sandboxed JS).
 * - Dynamic data comes from bindings/queries defined in the view runtime config.
 */

export type ViewNodeId = string;
export type ViewScriptId = string;
export type ViewQueryId = string;

/**
 * WidgetInstanceNode
 *
 * A node in the view's widget tree. Nodes can be containers (with children) or leaf widgets.
 */
export interface WidgetInstanceNode {
  id: ViewNodeId;
  /**
   * Registry key / component type to render.
   */
  type: string;
  /**
   * Raw props for the component. Bindings (if any) can compute/override values at runtime.
   */
  props: Record<string, unknown>;
  children?: WidgetInstanceNode[];
  /**
   * Optional bindings, keyed by a dot-path into props (e.g. "title", "data.rows").
   */
  bindings?: Record<string, BindingSpec>;
  /**
   * Optional event handlers keyed by event name (e.g. "click", "row_select").
   */
  handlers?: Record<string, HandlerSpec>;
  /**
   * Optional per-node permissions (overrides / tightens view-level permissions).
   */
  permissions?: PermissionSpec;
}

/**
 * Input node shape accepted by create/update endpoints.
 * The server/models layer may generate missing ids.
 */
export interface WidgetInstanceNodeInput extends Omit<WidgetInstanceNode, 'id' | 'children'> {
  id?: ViewNodeId;
  children?: WidgetInstanceNodeInput[];
}

/**
 * BindingSpec
 *
 * Deterministic data binding (separate from sandboxed JS handlers).
 */
export type BindingSpec =
  | { kind: 'state'; path: string }
  | { kind: 'query'; queryId: ViewQueryId; path?: string }
  | { kind: 'expr'; expr: string };

/**
 * HandlerSpec
 *
 * Event handler definition. The primary mode is sandboxed JavaScript scripts referenced by id.
 */
export type HandlerSpec =
  | { kind: 'script'; scriptId: ViewScriptId; entrypoint?: string }
  | { kind: 'actions'; actions: ViewRuntimeActionRequest[] };

export type PermissionSpec = {
  /**
   * Allowed workflows (Autopilot tool/workflow slugs) the view/runtime may invoke.
   */
  workflows?: string[];
  /**
   * Allowed connector ids/providers for query/actions (optional; server enforced).
   */
  connectors?: string[];
};

export type ViewScript = {
  language: 'javascript';
  source: string;
};

export type ViewQuerySpec =
  | { kind: 'http'; url: string; method?: 'GET' | 'POST'; bodyTemplate?: Record<string, unknown> }
  | { kind: 'connector_action'; connector: string; action: string; argsTemplate?: Record<string, unknown> };

export interface ViewRuntimeConfig {
  scripts?: Record<ViewScriptId, ViewScript>;
  queries?: Record<ViewQueryId, ViewQuerySpec>;
  permissions?: PermissionSpec;
}

export interface ViewModel {
  id: string;
  name: string;
  slug: string;
  description: string;
  root: WidgetInstanceNode;
  runtimeConfig: ViewRuntimeConfig;
  version: number;
  starshipId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateViewRequest {
  name: string;
  slug?: string;
  description: string;
  root?: WidgetInstanceNodeInput;
  runtimeConfig?: ViewRuntimeConfig;
  starshipId: string;
}

export interface UpdateViewRequest {
  name?: string;
  description?: string;
  root?: WidgetInstanceNodeInput;
  runtimeConfig?: ViewRuntimeConfig;
  version?: number;
}

export interface ViewSearchParams {
  starshipId?: string;
  name?: string;
  slug?: string;
  limit?: number;
  offset?: number;
}

// ----------------------------------------------------------------------------
// View Runtime Actions/Events (server <-> client coordination)
// ----------------------------------------------------------------------------

export type ViewPatchOp =
  | { op: 'add' | 'replace' | 'test'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'move' | 'copy'; from: string; path: string };

export type ViewRuntimeActionRequest =
  | { type: 'run_workflow'; workflowSlug: string; args?: Record<string, unknown> }
  | { type: 'set_state'; path: string; value: unknown; persist?: boolean }
  | { type: 'patch_props'; instanceId: ViewNodeId; patch: Record<string, unknown> }
  | { type: 'patch_root'; patch: ViewPatchOp[] };

export type ViewRuntimeEvent =
  | { type: 'snapshot'; data: { viewId: string; at: string; root: WidgetInstanceNode; state?: Record<string, unknown> } }
  | { type: 'patch'; data: { viewId: string; at: string; patch: ViewPatchOp[] } }
  | { type: 'state'; data: { viewId: string; at: string; patch: Array<{ path: string; value: unknown }> } }
  | { type: 'toast'; data: { viewId: string; at: string; level?: 'info' | 'success' | 'warning' | 'error'; message: string } }
  | { type: 'error'; data: { viewId: string; at: string; message: string; code?: string } };

