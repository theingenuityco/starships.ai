/**
 * RoomSetupService — orchestrates room-type setup handlers.
 *
 * Responsibilities:
 *  - getStatus(room): compute connector readiness + domain state for the setup gate.
 *  - runSetup(room): manually (re-)run a room's post-connect processing.
 *  - onConnectorConnected(...): fan out from a just-completed connection to every room
 *    in the starship whose handler requires that connector, and run their processing.
 *
 * Dependency direction is one-way: ConnectorService calls into this service; this
 * service never imports ConnectorService (it reads connector status via the repository),
 * so there is no import cycle.
 */

import type { ConnectorProvider, RoomModel } from '@starships/protocol';
import { AppError } from '@starships/errors';
import {
  ConnectorRepository,
  RoomRepository,
  StarshipTableRepository,
  StarshipTableRowRepository,
  type StarshipTableRecord,
  type TableRef,
} from '@starships/models';
import { connectorActionExecutor } from './ConnectorActionExecutor';
import { findHandlerForRoom } from './roomSetup/registry';
import type { RoomSetupContext, RoomSetupHandler, RoomSetupStatus } from './roomSetup/types';

function tableRefOf(record: StarshipTableRecord): TableRef {
  return {
    starshipId: record.starshipId,
    physicalTable: record.physicalTable,
    columns: record.columns,
    primaryKey: record.primaryKey,
  };
}

export class RoomSetupService {
  private readonly connectorRepository = new ConnectorRepository();
  private readonly roomRepository = new RoomRepository();
  private readonly tableRepository = new StarshipTableRepository();
  private readonly rowRepository = new StarshipTableRowRepository();

  /** The setup handler for a room (by bundle tag, falling back to slug), or null. */
  handlerForRoom(room: RoomModel): RoomSetupHandler | null {
    return findHandlerForRoom(room);
  }

  private buildContext(room: RoomModel, authUserId: string): RoomSetupContext {
    const starshipId = room.starshipId;

    const findTable = async (slug: string): Promise<StarshipTableRecord | null> =>
      this.tableRepository.findBySlug(slug, starshipId);

    return {
      starshipId,
      authUserId,
      room,

      runConnectorAction: async (connector, action, args) => {
        const envelope = await connectorActionExecutor.execute({
          connector,
          action,
          args: args ?? {},
          starshipId,
          authUserId,
        });
        if (envelope.status >= 400) {
          throw new AppError(
            `Connector ${connector}.${action} failed with status ${envelope.status}`,
            'CONNECTOR_ACTION_FAILED',
            502
          );
        }
        return envelope.body;
      },

      isConnectorConnected: async (provider) => {
        const connector = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
        return connector?.status === 'connected';
      },

      seedTable: async (slug, rows) => {
        const record = await findTable(slug);
        if (!record) {
          throw new AppError(`Table "${slug}" not found for this starship`, 'TABLE_NOT_FOUND', 404);
        }
        return this.rowRepository.replaceAll(
          tableRefOf(record),
          rows.map((data) => ({ data }))
        );
      },

      tableCount: async (slug) => {
        const record = await findTable(slug);
        if (!record) return 0;
        return this.rowRepository.countByTable(tableRefOf(record));
      },
    };
  }

  private async connectorReadiness(
    handler: RoomSetupHandler,
    ctx: RoomSetupContext
  ): Promise<Array<{ provider: ConnectorProvider; connected: boolean }>> {
    return Promise.all(
      handler.requiredConnectors.map(async (provider) => ({
        provider,
        connected: await ctx.isConnectorConnected(provider),
      }))
    );
  }

  /** Compute setup status for the gate. Returns null if the room has no setup process. */
  async getStatus(room: RoomModel, authUserId: string): Promise<RoomSetupStatus | null> {
    const handler = this.handlerForRoom(room);
    if (!handler) return null;
    const ctx = this.buildContext(room, authUserId);
    const connectors = await this.connectorReadiness(handler, ctx);
    const domain = await handler.inspect(ctx);
    return {
      bundleTag: handler.bundleTag,
      connectors,
      ready: connectors.every((c) => c.connected),
      seeded: domain.seeded,
      summary: domain.summary,
      details: domain.details,
    };
  }

  /** Manually (re-)run a room's setup. Throws if connectors are missing. */
  async runSetup(room: RoomModel, authUserId: string): Promise<RoomSetupStatus> {
    const handler = this.handlerForRoom(room);
    if (!handler) {
      throw new AppError('This room has no setup process', 'SETUP_NOT_SUPPORTED', 400);
    }
    const ctx = this.buildContext(room, authUserId);
    const connectors = await this.connectorReadiness(handler, ctx);
    const missing = connectors.filter((c) => !c.connected).map((c) => c.provider);
    if (missing.length > 0) {
      throw new AppError(
        `Connect required integrations first: ${missing.join(', ')}`,
        'SETUP_CONNECTORS_MISSING',
        409
      );
    }
    const domain = await handler.run(ctx);
    return {
      bundleTag: handler.bundleTag,
      connectors,
      ready: true,
      seeded: domain.seeded,
      summary: domain.summary,
      details: domain.details,
    };
  }

  /**
   * Fan out from a completed connection: for every room in the starship whose handler
   * requires this provider and whose required connectors are now all connected, run the
   * handler's post-connect processing. Best-effort: per-room failures are logged, never
   * thrown, so a connect flow is never blocked by setup.
   */
  async onConnectorConnected(args: {
    starshipId: string;
    authUserId: string;
    provider: ConnectorProvider;
  }): Promise<void> {
    const { starshipId, authUserId, provider } = args;
    const rooms = await this.roomRepository.listByStarship(starshipId);
    for (const room of rooms) {
      const handler = this.handlerForRoom(room);
      if (!handler || !handler.requiredConnectors.includes(provider)) continue;
      try {
        const ctx = this.buildContext(room, authUserId);
        const connectors = await this.connectorReadiness(handler, ctx);
        if (!connectors.every((c) => c.connected)) continue;
        await handler.run(ctx);
      } catch (err) {
        console.error('[room-setup] post-connect processing failed', {
          starshipId,
          provider,
          bundleTag: handler.bundleTag,
          roomConversationId: room.conversationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

export const roomSetupService = new RoomSetupService();
