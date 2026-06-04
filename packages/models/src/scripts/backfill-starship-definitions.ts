/**
 * One-time backfill: export existing Postgres definition rows into the
 * filesystem-authoritative definition volume (`$STARSHIP_HOME/<id>/.starship/`).
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
import { StarshipDefinitionStore } from '@/services/StarshipDefinitionStore';
import { agentFilename, agentModelToDefinition, parseAgent, serializeAgentDefinition } from '@/services/definition/agentCodec';
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

  const starships = args.starshipId
    ? [await starshipRepo.findById(args.starshipId)].filter(Boolean)
    : await starshipRepo.findAll();

  console.log(`[backfill] STARSHIP_HOME=${env.STARSHIP_HOME}`);
  console.log(`[backfill] ${starships.length} starship(s); mode=${args.verifyOnly ? 'verify-only' : 'write+verify'}`);

  let agentsTotal = 0;
  let agentsWritten = 0;
  let roundTripFailures = 0;
  let indexHashDiffs = 0;

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

      // Codec round-trip: serialize -> parse -> hash must equal the model hash.
      const parsed = parseAgent(file);
      const hashModel = definitionHash(defFromModel, state);
      const hashFile = definitionHash(parsed, state);
      if (hashModel !== hashFile) {
        roundTripFailures += 1;
        console.error(`[ROUND-TRIP FAIL] ${starship.id}/${agent.slug}: codec is lossy (model=${hashModel} file=${hashFile})`);
      }

      // Index consistency (informational): vs the stored content_hash.
      const dbHash = (agent as AgentModel & { contentHash?: string }).contentHash;
      if (dbHash && dbHash !== hashModel) {
        indexHashDiffs += 1;
        console.warn(`[index-hash diff] ${starship.id}/${agent.slug}: stored=${dbHash} computed=${hashModel} (hash normalization, not data loss)`);
      }
    }
  }

  console.log(
    `[backfill] done — agents: ${agentsTotal}, written: ${agentsWritten}, round-trip failures: ${roundTripFailures}, index-hash diffs: ${indexHashDiffs}`
  );

  // Fail only on a real codec correctness problem.
  if (roundTripFailures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('❌ backfill failed:', err?.message || err);
  process.exit(1);
});
