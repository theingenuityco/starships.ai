/**
 * Legacy workflow (DAG) shapes.
 *
 * These structural types formerly came from the `@starships/autopilot` DAG engine,
 * which has been removed. They survive ONLY as inert JSON shapes for columns that
 * still exist (e.g. `tools.blueprint`, historical connector-template seed data) and
 * for the read-only blueprint viewer in the client. Nothing executes them anymore.
 *
 * Shapes mirror the former autopilot `Node`/`Edge`/`Blueprint` exactly so existing
 * consumers keep compiling unchanged.
 */

export type NodeParameters = Record<string, unknown>;

export interface Node {
  ref: string;
  /** Former NodeType union; kept as a string since nothing dispatches on it now. */
  type: string;
  name: string;
  description: string;
  parameters: NodeParameters;
  metadata?: Record<string, unknown>;
}

export interface Edge {
  ref: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface Blueprint {
  nodes: Node[];
  edges: Edge[];
  metadata?: Record<string, unknown>;
}

/** A transform/mutation step previously interpreted by the DAG engine. Inert. */
export interface TransformOperation {
  [key: string]: unknown;
}
