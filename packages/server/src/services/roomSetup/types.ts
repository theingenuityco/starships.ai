/**
 * Room setup handlers — server-side, room-type-specific setup logic.
 *
 * A room provisioned from a bundle carries `provisionedByBundle` (the bundle tag, e.g.
 * "engineering"). When a handler is registered for that tag, the room gains a setup
 * process: it declares the connectors it requires and runs "post-connect" processing
 * (e.g. importing GitHub repositories into the room's `repos` Table) once they are
 * connected. This is plain code keyed by room type — not a declarative bundle DSL.
 */

import type { ConnectorProvider, RoomModel, RoomSetupStatus } from '@starships/protocol';

export type { RoomSetupStatus };

/**
 * The capabilities a handler is given to inspect and seed a room. Hides the underlying
 * connector executor / table repositories so handlers stay declarative about intent.
 */
export interface RoomSetupContext {
  readonly starshipId: string;
  readonly authUserId: string;
  readonly room: RoomModel;

  /** Run a connector action server-side and return its (already-authed) response body. */
  runConnectorAction(connector: ConnectorProvider, action: string, args?: Record<string, unknown>): Promise<unknown>;

  /** True when the given connector is currently `connected` for this starship. */
  isConnectorConnected(provider: ConnectorProvider): Promise<boolean>;

  /** Replace all rows of the named Table (by slug) with `rows`. Idempotent re-seed. */
  seedTable(slug: string, rows: Array<Record<string, unknown>>): Promise<{ inserted: number }>;

  /** Row count of the named Table (by slug); 0 if the Table does not exist. */
  tableCount(slug: string): Promise<number>;
}

/** Domain-specific portion of setup status, owned by the handler. */
export interface RoomSetupDomainStatus {
  /** Whether the room's data has been populated (handler-defined meaning). */
  seeded: boolean;
  /** Short human summary, e.g. "12 repositories imported". */
  summary?: string;
  details?: Record<string, unknown>;
}

/** A room-type setup handler, registered by bundle tag. */
export interface RoomSetupHandler {
  /** The `provisionedByBundle` tag this handler applies to (e.g. "engineering"). */
  readonly bundleTag: string;
  /**
   * Room slugs this handler also answers to, as a fallback when `provisionedByBundle`
   * is absent (e.g. seeded rooms that predate the tag). Matched case-insensitively.
   */
  readonly roomSlugs?: string[];
  /** Connectors that must be connected before setup can run. */
  readonly requiredConnectors: ConnectorProvider[];
  /** Inspect current setup state without mutating anything (for the setup gate). */
  inspect(ctx: RoomSetupContext): Promise<RoomSetupDomainStatus>;
  /** Run post-connection processing (seed data). Must be idempotent. */
  run(ctx: RoomSetupContext): Promise<RoomSetupDomainStatus>;
}

// RoomSetupStatus is the shared wire type, defined in @starships/protocol and re-exported above.
