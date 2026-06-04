import { AgentEntity } from '@/entities/AgentEntity';
import { AgentRepository } from '@/repositories/AgentRepository';
import { computeAgentContentHash } from '@/utils/contentHash';
import { StarshipDefinitionStore } from '@/services/StarshipDefinitionStore';
import { StarshipVolumeProvisioner } from '@/services/StarshipVolumeProvisioner';
import { agentSlugFromFilename, parseAgent } from '@/services/definition/agentCodec';
import type { AgentDefinition } from '@/services/definition/types';
import type { DefinitionEntityDir } from '@/services/StarshipVolumeProvisioner';
import type { AgentModel } from '@starships/protocol';

/**
 * Folds the filesystem-authoritative definition plane into the Postgres index.
 *
 * Files in `.starship/` are the source of truth; the existing tables (`agents`,
 * ...) are a derived, rebuildable index. `reconcile` reads definition files,
 * validates them through the existing entity validators, and upserts the index
 * keyed by each entity's immutable `id`. Drift is detected via the same
 * `content_hash` the DB write path computes; an in-sync row is a no-op.
 *
 * The reconcile is idempotent and safe to re-run — the foundation for repair
 * and (later) git-pull-then-reconcile. It currently implements the AGENT path;
 * connectors/rooms/tables/schedules slot into the same dispatch in later stages.
 */

const DEFAULT_AGENT_STATE: Record<string, unknown> = { messages: [], tools: [] };

export interface AgentReconcileResult {
  upserted: number;
  unchanged: number;
  pruned: number;
}

export interface ReconcileResult {
  starshipId: string;
  agents: AgentReconcileResult;
}

export interface ReconcileTarget {
  /** Limit reconcile to one entity bucket. Omit to reconcile all. */
  entity?: DefinitionEntityDir;
  /** Limit to a single file within the entity bucket (fast path after one write). */
  filename?: string;
  /**
   * Delete index rows whose id has no backing file. Only safe after a full
   * backfill (otherwise un-backfilled DB rows would be pruned). Default false.
   */
  pruneOrphans?: boolean;
}

export class StarshipDefinitionReconciler {
  private readonly store: StarshipDefinitionStore;
  private readonly provisioner: StarshipVolumeProvisioner;
  private readonly agentRepository: AgentRepository;

  constructor(opts?: { store?: StarshipDefinitionStore; agentRepository?: AgentRepository; home?: string }) {
    this.store = opts?.store ?? new StarshipDefinitionStore(opts?.home);
    this.provisioner = new StarshipVolumeProvisioner(opts?.home);
    this.agentRepository = opts?.agentRepository ?? new AgentRepository();
  }

  /** The content hash for a definition combined with the (preserved) index state. */
  private agentHash(def: AgentDefinition, state: Record<string, unknown>): string {
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

  /**
   * Reconcile one agent file into the index. Returns the (possibly updated)
   * index row plus whether it changed, or null if the file no longer exists.
   */
  async reconcileAgentFile(starshipId: string, filename: string): Promise<{ changed: boolean; agent: AgentModel } | null> {
    const raw = await this.store.read(starshipId, 'agents', filename);
    if (raw === null) return null;

    const def = parseAgent(raw);

    // The slug is authoritative from frontmatter; keep filename and slug aligned.
    const expectedSlug = agentSlugFromFilename(filename);
    if (def.slug !== expectedSlug) {
      throw new Error(`agent file '${filename}' has frontmatter slug '${def.slug}' that does not match its filename`);
    }

    // Full validation through the existing entity validator (starshipId known here).
    await AgentEntity.validate(
      {
        id: def.id,
        slug: def.slug,
        starshipId,
        name: def.name,
        role: def.role,
        description: def.description,
        model: def.model,
        category: def.category,
        temperature: def.temperature,
        maxTokens: def.maxTokens,
        timeout: def.timeout,
        reasoning: def.reasoning,
        systemPrompt: def.systemPrompt,
        previewPrompts: def.previewPrompts,
        version: def.version,
      },
      'create'
    );

    const existing = await this.agentRepository.findById(def.id);
    const state = (existing?.state as Record<string, unknown> | undefined) ?? DEFAULT_AGENT_STATE;
    const hash = this.agentHash(def, state);

    // contentHash lives on the AgentEntity row but is absent from the protocol type.
    const existingHash = existing ? (existing as AgentModel & { contentHash?: string }).contentHash : undefined;
    if (existing && existingHash === hash) {
      return { changed: false, agent: existing };
    }

    const agent = await this.agentRepository.upsertIndexFromDefinition({ def, starshipId, state, contentHash: hash });
    return { changed: true, agent };
  }

  /** Reconcile every agent file for a starship; optionally prune orphan index rows. */
  async reconcileAgents(starshipId: string, opts?: { pruneOrphans?: boolean }): Promise<AgentReconcileResult> {
    const filenames = await this.store.list(starshipId, 'agents', '.md');
    const result: AgentReconcileResult = { upserted: 0, unchanged: 0, pruned: 0 };
    const fileIds = new Set<string>();

    for (const filename of filenames) {
      const outcome = await this.reconcileAgentFile(starshipId, filename);
      if (!outcome) continue;
      fileIds.add(outcome.agent.id);
      if (outcome.changed) result.upserted += 1;
      else result.unchanged += 1;
    }

    if (opts?.pruneOrphans) {
      const indexed = await this.agentRepository.findByStarship(starshipId);
      for (const row of indexed) {
        if (!fileIds.has(row.id)) {
          await this.agentRepository.delete(row.id);
          result.pruned += 1;
        }
      }
    }

    return result;
  }

  /**
   * Reconcile a starship's definitions. With no target, reconciles all entities
   * (currently agents). With `{ entity, filename }`, reconciles a single file —
   * the fast path invoked right after a CRUD write.
   */
  async reconcile(starshipId: string, target?: ReconcileTarget): Promise<ReconcileResult> {
    await this.provisioner.ensureProvisioned(starshipId);
    const agents: AgentReconcileResult = { upserted: 0, unchanged: 0, pruned: 0 };

    const wantsAgents = !target?.entity || target.entity === 'agents';
    if (wantsAgents) {
      if (target?.filename) {
        const outcome = await this.reconcileAgentFile(starshipId, target.filename);
        if (outcome?.changed) agents.upserted += 1;
        else if (outcome) agents.unchanged += 1;
      } else {
        const r = await this.reconcileAgents(starshipId, { pruneOrphans: target?.pruneOrphans });
        agents.upserted = r.upserted;
        agents.unchanged = r.unchanged;
        agents.pruned = r.pruned;
      }
    }

    // NOTE: connectors/rooms/tables/schedules reconcile lands in later stages.
    return { starshipId, agents };
  }
}

export default StarshipDefinitionReconciler;
