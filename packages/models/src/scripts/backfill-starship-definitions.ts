/**
 * One-time backfill: export existing Postgres definition rows into the
 * filesystem-authoritative definition volume (`$STARSHIP_HOME/<id>/.autopilot/`).
 *
 * Run this before flipping STARSHIP_FS_AUTHORITY on so existing starships keep
 * their agents. It is idempotent, NON-destructive (only writes files; never
 * mutates or deletes DB rows), and re-runnable.
 *
 * Verification (always run): for every agent it asserts the codec round-trip is
 * lossless (serialize -> parse -> hash is stable) — a hard correctness signal —
 * and reports any difference between that hash and the stored `content_hash`
 * (informational: differences are hash normalizations, not data loss).
 *
 *   pnpm --filter @starships/models backfill:definitions            # write + verify all
 *   pnpm --filter @starships/models backfill:definitions --verify-only
 *   pnpm --filter @starships/models backfill:definitions --starship <id>
 *
 * Stage 1 covers AGENTS; connectors/rooms/tables/schedules are added with their
 * stages.
 */
import { getEnvConfig } from '@starships/env';
import { createConnection } from '@/helpers/database';
import { StarshipRepository } from '@/repositories/StarshipRepository';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ScheduleRepository } from '@/repositories/ScheduleRepository';
import { ConnectorRepository } from '@/repositories/ConnectorRepository';
import { StarshipTableRepository } from '@/repositories/StarshipTableRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { StarshipDefinitionStore } from '@/services/StarshipDefinitionStore';
import { agentFilename, agentModelToDefinition, parseAgent, serializeAgentDefinition } from '@/services/definition/agentCodec';
import { parseSchedule, scheduleFilename, serializeSchedule, serializeScheduleDefinition } from '@/services/definition/scheduleCodec';
import { connectorFilename, parseConnector, serializeConnector, serializeConnectorDefinition } from '@/services/definition/connectorCodec';
import { parseTable, serializeTable, serializeTableDefinition, tableFilename } from '@/services/definition/tableCodec';
import { parseRoom, roomFilename, serializeRoomDefinition } from '@/services/definition/roomCodec';
import { assembleRoomDefinition } from '@/services/definition/roomAssembler';
import { computeAgentContentHash } from '@/utils/contentHash';
import type { AgentDefinition } from '@/services/definition/types';
import type { AgentModel } from '@starships/protocol';

interface Args {
  verifyOnly: boolean;
  starshipId?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { verifyOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--verify-only') args.verifyOnly = true;
    else if (argv[i] === '--starship') args.starshipId = argv[++i];
  }
  return args;
}

/** The hash the reconciler computes for a definition + (preserved) state. */
function definitionHash(def: AgentDefinition, state: Record<string, unknown>): string {
  return computeAgentContentHash({
    name: def.name,
    role: def.role || 'Assistant',
    description: def.description,
    model: def.model,
    temperature: def.temperature,
    maxTokens: def.maxTokens,
    timeout: def.timeout,
    reasoning: def.reasoning,
    systemPrompt: def.systemPrompt,
    state,
    category: def.category ?? 'general',
    previewPrompts: def.previewPrompts,
    assignedToolSlugs: [],
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = getEnvConfig();

  const db = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });
  await db.connect();

  const store = new StarshipDefinitionStore();
  const starshipRepo = new StarshipRepository();
  const agentRepo = new AgentRepository();
  const scheduleRepo = new ScheduleRepository();
  const connectorRepo = new ConnectorRepository();
  const tableRepo = new StarshipTableRepository();
  const roomRepo = new RoomRepository();

  const starships = args.starshipId
    ? [await starshipRepo.findById(args.starshipId)].filter(Boolean)
    : await starshipRepo.findAll();

  console.log(`[backfill] STARSHIP_HOME=${env.STARSHIP_HOME}`);
  console.log(`[backfill] ${starships.length} starship(s); mode=${args.verifyOnly ? 'verify-only' : 'write+verify'}`);

  let agentsTotal = 0;
  let agentsWritten = 0;
  let roundTripFailures = 0;
  let indexHashDiffs = 0;
  let schedulesTotal = 0;
  let schedulesWritten = 0;
  let connectorsTotal = 0;
  let connectorsWritten = 0;
  let tablesTotal = 0;
  let tablesWritten = 0;
  let roomsTotal = 0;
  let roomsWritten = 0;

  for (const starship of starships) {
    if (!starship) continue;
    if (!args.verifyOnly) await store.ensureProvisioned(starship.id);

    const agents = await agentRepo.findByStarship(starship.id);
    for (const agent of agents) {
      agentsTotal += 1;

      const defFromModel = agentModelToDefinition(agent);
      const file = serializeAgentDefinition(defFromModel);

      if (!args.verifyOnly) {
        await store.write(starship.id, 'agents', agentFilename(agent.slug), file);
        agentsWritten += 1;
      }

      const state = (agent.state as Record<string, unknown> | undefined) ?? { messages: [], tools: [] };

      // Codec round-trip: serialize -> parse -> serialize must reproduce the file
      // exactly (the codec is faithful / idempotent for the authored fields).
      if (serializeAgentDefinition(parseAgent(file)) !== file) {
        roundTripFailures += 1;
        console.error(`[ROUND-TRIP FAIL] ${starship.id}/${agent.slug}: agent codec is lossy`);
      }

      // Index consistency (informational): the hash the reconciler will compute
      // from the file vs the stored content_hash. A difference is a one-time
      // normalization (system-prompt whitespace / empty previewPrompts), not data
      // loss — the first reconcile will refresh content_hash + updated_at.
      const dbHash = (agent as AgentModel & { contentHash?: string }).contentHash;
      const fileHash = definitionHash(parseAgent(file), state);
      if (dbHash && dbHash !== fileHash) {
        indexHashDiffs += 1;
      }
    }

    const schedules = await scheduleRepo.findByStarship(starship.id);
    for (const schedule of schedules) {
      schedulesTotal += 1;
      const file = serializeSchedule(schedule);
      if (!args.verifyOnly) {
        await store.write(starship.id, 'schedules', scheduleFilename(schedule.id), file);
        schedulesWritten += 1;
      }
      // Round-trip: parse the file then re-serialize; must be identical.
      if (serializeScheduleDefinition(parseSchedule(file)) !== file) {
        roundTripFailures += 1;
        console.error(`[ROUND-TRIP FAIL] ${starship.id}/schedule:${schedule.id}: schedule codec is lossy`);
      }
    }

    const connectors = await connectorRepo.findByStarship(starship.id);
    for (const connector of connectors) {
      connectorsTotal += 1;
      const file = serializeConnector(connector);
      if (!args.verifyOnly) {
        await store.write(starship.id, 'connectors', connectorFilename(connector.provider), file);
        connectorsWritten += 1;
      }
      if (serializeConnectorDefinition(parseConnector(file)) !== file) {
        roundTripFailures += 1;
        console.error(`[ROUND-TRIP FAIL] ${starship.id}/connector:${connector.provider}: connector codec is lossy`);
      }
    }

    const tables = await tableRepo.listByStarship(starship.id, { includeArchived: true });
    for (const table of tables) {
      tablesTotal += 1;
      const file = serializeTable(table);
      if (!args.verifyOnly) {
        await store.write(starship.id, 'tables', tableFilename(table.slug), file);
        tablesWritten += 1;
      }
      if (serializeTableDefinition(parseTable(file)) !== file) {
        roundTripFailures += 1;
        console.error(`[ROUND-TRIP FAIL] ${starship.id}/table:${table.slug}: table codec is lossy`);
      }
    }

    const rooms = await roomRepo.listByStarship(starship.id);
    for (const room of rooms) {
      const def = await assembleRoomDefinition(room.conversationId);
      if (!def) continue;
      roomsTotal += 1;
      const file = serializeRoomDefinition(def);
      if (!args.verifyOnly) {
        await store.write(starship.id, 'rooms', roomFilename(room.slug), file);
        roomsWritten += 1;
      }
      if (serializeRoomDefinition(parseRoom(file)) !== file) {
        roundTripFailures += 1;
        console.error(`[ROUND-TRIP FAIL] ${starship.id}/room:${room.slug}: room codec is lossy`);
      }
    }
  }

  console.log(
    `[backfill] done — agents: ${agentsTotal}/${agentsWritten}, schedules: ${schedulesTotal}/${schedulesWritten}, connectors: ${connectorsTotal}/${connectorsWritten}, tables: ${tablesTotal}/${tablesWritten}, rooms: ${roomsTotal}/${roomsWritten} (total/written), round-trip failures: ${roundTripFailures}, index-hash diffs: ${indexHashDiffs}`
  );

  // Fail only on a real codec correctness problem.
  if (roundTripFailures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('❌ backfill failed:', err?.message || err);
  process.exit(1);
});
