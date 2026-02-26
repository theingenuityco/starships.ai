import type { WidgetInstanceNode } from '@starships/protocol';

export type ViewWidgetRow = {
  nodeId: string;
  type: string;
  props: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  handlers?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
};

export type ViewStructureNode = {
  id: string;
  children?: ViewStructureNode[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export function isFullWidgetNode(root: unknown): root is WidgetInstanceNode {
  if (!isRecord(root)) return false;
  return typeof root.id === 'string' && typeof root.type === 'string' && isRecord(root.props);
}

export function isStructureNode(root: unknown): root is ViewStructureNode {
  if (!isRecord(root)) return false;
  if (typeof root.id !== 'string') return false;
  if (root.children === undefined) return true;
  if (!Array.isArray(root.children)) return false;
  return root.children.every(isStructureNode);
}

export function dehydrateViewRoot(fullRoot: WidgetInstanceNode): { structureRoot: ViewStructureNode; widgets: ViewWidgetRow[] } {
  const widgets: ViewWidgetRow[] = [];

  function walk(node: WidgetInstanceNode): ViewStructureNode {
    const out: ViewWidgetRow = {
      nodeId: node.id,
      type: node.type,
      props: isRecord(node.props) ? node.props : {},
      ...(isRecord(node.bindings) ? { bindings: node.bindings } : null),
      ...(isRecord(node.handlers) ? { handlers: node.handlers } : null),
      ...(isRecord(node.permissions) ? { permissions: node.permissions } : null),
    };
    widgets.push(out);

    const children = Array.isArray(node.children) ? node.children.map(walk) : undefined;
    return { id: node.id, ...(children && children.length > 0 ? { children } : null) };
  }

  const structureRoot = walk(fullRoot);
  return { structureRoot, widgets };
}

export function hydrateViewRoot(structureRoot: ViewStructureNode, widgetById: Map<string, ViewWidgetRow>): WidgetInstanceNode {
  function walk(node: ViewStructureNode): WidgetInstanceNode {
    const w = widgetById.get(node.id);
    const type = w?.type || 'Box';
    const props = w?.props && isRecord(w.props) ? w.props : {};
    const children = Array.isArray(node.children) ? node.children.map(walk) : undefined;

    const out: WidgetInstanceNode = {
      id: node.id,
      type,
      props,
      ...(children && children.length > 0 ? { children } : null),
    };

    if (w?.bindings && isRecord(w.bindings)) (out as unknown as { bindings: Record<string, unknown> }).bindings = w.bindings;
    if (w?.handlers && isRecord(w.handlers)) (out as unknown as { handlers: Record<string, unknown> }).handlers = w.handlers;
    if (w?.permissions && isRecord(w.permissions)) (out as unknown as { permissions: Record<string, unknown> }).permissions = w.permissions;

    return out;
  }

  return walk(structureRoot);
}

export function collectStructureNodeIds(root: ViewStructureNode): string[] {
  const ids: string[] = [];
  function walk(n: ViewStructureNode) {
    ids.push(n.id);
    if (Array.isArray(n.children)) for (const c of n.children) walk(c);
  }
  walk(root);
  return ids;
}

