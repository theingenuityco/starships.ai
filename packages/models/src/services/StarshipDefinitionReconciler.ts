import { AgentEntity } from '@/entities/AgentEntity';
import { ScheduleEntity } from '@/entities/ScheduleEntity';
import { ConnectorEntity } from '@/entities/ConnectorEntity';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ScheduleRepository } from '@/repositories/ScheduleRepository';
import { ConnectorRepository } from '@/repositories/ConnectorRepository';
import { StarshipTableRepository } from '@/repositories/StarshipTableRepository';
import { computeAgentContentHash, sha256Hex, stableStringify } from '@/utils/contentHash';
import { StarshipDefinitionStore } from '@/services/StarshipDefinitionStore';
import { StarshipVolumeProvisioner } from '@/services/StarshipVolumeProvisioner';
import { agentSlugFromFilename, parseAgent } from '@/services/definition/agentCodec';
import { parseSchedule, scheduleModelToDefinition } from '@/services/definition/scheduleCodec';
import { parseConnector, connectorModelToDefinition } from '@/services/definition/connectorCodec';
import { parseTable, tableRecordToDefinition } from '@/services/definition/tableCodec';
import type { AgentDefinition, ScheduleDefinition, ConnectorDefinition, TableDefinition } from '@/services/definition/types';
import type { DefinitionEntityDir } from '@/services/StarshipVolumeProvisioner';
import type { AgentModel, ConnectorProvider } from '@starships/protocol';

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

export interface EntityReconcileResult {
  upserted: number;
  unchanged: number;
  pruned: number;
}
/** @deprecated use EntityReconcileResult */
export type AgentReconcileResult = EntityReconcileResult;

export interface ReconcileResult {
  starshipId: string;
  agents: EntityReconcileResult;
  connectors: EntityReconcileResult;
  tables: EntityReconcileResult;
  schedules: EntityReconcileResult;
}

function emptyEntityResult(): EntityReconcileResult {
  return { upserted: 0, unchanged: 0, pruned: 0 };
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
  private readonly scheduleRepository: ScheduleRepository;
  private readonly connectorRepository: ConnectorRepository;
  private readonly tableRepository: StarshipTableRepository;

  constructor(opts?: {
    store?: StarshipDefinitionStore;
    agentRepository?: AgentRepository;
    scheduleRepository?: ScheduleRepository;
    connectorRepository?: ConnectorRepository;
    tableRepository?: StarshipTableRepository;
    home?: string;
  }) {
    this.store = opts?.store ?? new StarshipDefinitionStore(opts?.home);
    this.provisioner = new StarshipVolumeProvisioner(opts?.home);
    this.agentRepository = opts?.agentRepository ?? new AgentRepository();
    this.scheduleRepository = opts?.scheduleRepository ?? new ScheduleRepository();
    this.connectorRepository = opts?.connectorRepository ?? new ConnectorRepository();
    this.tableRepository = opts?.tableRepository ?? new StarshipTableRepository();
  }

  /** Stable hash of an authored object, for in-memory drift detection. */
  private authoredHash(authored: Record<string, unknown>): string {
    return sha256Hex(stableStringify(authored));
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

  /** The authored hash for a connector definition (drift detection). */
  private connectorHash(def: ConnectorDefinition): string {
    return this.authoredHash({
      provider: def.provider,
      templateId: def.templateId ?? null,
      version: def.version ?? null,
      metadata: def.metadata ?? {},
    });
  }

  /** Reconcile one connector file into the index. */
  async reconcileConnectorFile(starshipId: string, filename: string): Promise<{ changed: boolean; id: string } | null> {
    const raw = await this.store.read(starshipId, 'connectors', filename);
    if (raw === null) return null;
    const def = parseConnector(raw);

    await ConnectorEntity.validate(
      { provider: def.provider, metadata: def.metadata, templateId: def.templateId, version: def.version },
      'update'
    );

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, def.provider as ConnectorProvider);
    if (existing && this.connectorHash(connectorModelToDefinition(existing)) === this.connectorHash(def)) {
      return { changed: false, id: existing.id };
    }
    // Keep the file id aligned with the existing row's id (provider is unique per starship).
    const upserted = await this.connectorRepository.upsertIndexFromDefinition({
      def: { ...def, id: existing?.id ?? def.id },
      starshipId,
    });
    return { changed: true, id: upserted.id };
  }

  /** Reconcile every connector file for a starship; optionally prune orphans. */
  async reconcileConnectors(starshipId: string, opts?: { pruneOrphans?: boolean }): Promise<EntityReconcileResult> {
    const filenames = await this.store.list(starshipId, 'connectors', '.yaml');
    const result = emptyEntityResult();
    const fileIds = new Set<string>();
    for (const filename of filenames) {
      const outcome = await this.reconcileConnectorFile(starshipId, filename);
      if (!outcome) continue;
      fileIds.add(outcome.id);
      if (outcome.changed) result.upserted += 1;
      else result.unchanged += 1;
    }
    if (opts?.pruneOrphans) {
      const indexed = await this.connectorRepository.findByStarship(starshipId);
      for (const row of indexed) {
        if (!fileIds.has(row.id)) {
          await this.connectorRepository.delete(row.id);
          result.pruned += 1;
        }
      }
    }
    return result;
  }

  /** The authored hash for a table definition (drift detection). */
  private tableHash(def: TableDefinition): string {
    return this.authoredHash({
      name: def.name,
      description: def.description ?? '',
      primaryKey: def.primaryKey ?? null,
      columns: def.columns ?? [],
    });
  }

  /** Reconcile one table file into the index (+ DDL via the repository). */
  async reconcileTableFile(starshipId: string, filename: string): Promise<{ changed: boolean; id: string } | null> {
    const raw = await this.store.read(starshipId, 'tables', filename);
    if (raw === null) return null;
    const def = parseTable(raw);

    const existing = await this.tableRepository.findById(def.id);
    if (existing && this.tableHash(tableRecordToDefinition(existing)) === this.tableHash(def)) {
      return { changed: false, id: existing.id };
    }
    const upserted = await this.tableRepository.upsertIndexFromDefinition({ def, starshipId });
    return { changed: true, id: upserted.id };
  }

  /**
   * Reconcile every table file for a starship. Orphans (index rows with no file)
   * are ARCHIVED, never dropped — the per-starship physical table holds row data.
   */
  async reconcileTables(starshipId: string, opts?: { pruneOrphans?: boolean }): Promise<EntityReconcileResult> {
    const filenames = await this.store.list(starshipId, 'tables', '.yaml');
    const result = emptyEntityResult();
    const fileIds = new Set<string>();
    for (const filename of filenames) {
      const outcome = await this.reconcileTableFile(starshipId, filename);
      if (!outcome) continue;
      fileIds.add(outcome.id);
      if (outcome.changed) result.upserted += 1;
      else result.unchanged += 1;
    }
    if (opts?.pruneOrphans) {
      const indexed = await this.tableRepository.listByStarship(starshipId);
      for (const row of indexed) {
        if (!fileIds.has(row.id) && !row.archived) {
          await this.tableRepository.archive(row.id);
          result.pruned += 1;
        }
      }
    }
    return result;
  }

  /** The authored hash for a schedule definition (drift detection). */
  private scheduleHash(def: ScheduleDefinition): string {
    return this.authoredHash({
      agentId: def.agentId,
      prompt: def.prompt,
      cronExpression: def.cronExpression,
      timezone: def.timezone,
      isActive: def.isActive,
      isRecurring: def.isRecurring,
      endsAt: def.endsAt ?? null,
      maxOccurrences: def.maxOccurrences ?? null,
    });
  }

  /** Reconcile one schedule file into the index. */
  async reconcileScheduleFile(starshipId: string, filename: string): Promise<{ changed: boolean; id: string } | null> {
    const raw = await this.store.read(starshipId, 'schedules', filename);
    if (raw === null) return null;
    const def = parseSchedule(raw);

    await ScheduleEntity.validate(
      {
        agentId: def.agentId,
        prompt: def.prompt,
        cronExpression: def.cronExpression,
        timezone: def.timezone,
        isActive: def.isActive,
        isRecurring: def.isRecurring,
        endsAt: def.endsAt ?? undefined,
        maxOccurrences: def.maxOccurrences ?? undefined,
      },
      'update'
    );

    const existing = await this.scheduleRepository.findById(def.id);
    if (existing && this.scheduleHash(scheduleModelToDefinition(existing)) === this.scheduleHash(def)) {
      return { changed: false, id: def.id };
    }
    await this.scheduleRepository.upsertIndexFromDefinition({ def, starshipId });
    return { changed: true, id: def.id };
  }

  /** Reconcile every schedule file for a starship; optionally prune orphans. */
  async reconcileSchedules(starshipId: string, opts?: { pruneOrphans?: boolean }): Promise<EntityReconcileResult> {
    const filenames = await this.store.list(starshipId, 'schedules', '.yaml');
    const result = emptyEntityResult();
    const fileIds = new Set<string>();
    for (const filename of filenames) {
      const outcome = await this.reconcileScheduleFile(starshipId, filename);
      if (!outcome) continue;
      fileIds.add(outcome.id);
      if (outcome.changed) result.upserted += 1;
      else result.unchanged += 1;
    }
    if (opts?.pruneOrphans) {
      const indexed = await this.scheduleRepository.findByStarship(starshipId);
      for (const row of indexed) {
        if (!fileIds.has(row.id)) {
          await this.scheduleRepository.delete(row.id);
          result.pruned += 1;
        }
      }
    }
    return result;
  }

  /**
   * Reconcile a starship's definitions. With no target, reconciles all entity
   * buckets. With `{ entity, filename }`, reconciles a single file — the fast
   * path invoked right after a CRUD write.
   */
  async reconcile(starshipId: string, target?: ReconcileTarget): Promise<ReconcileResult> {
    await this.provisioner.ensureProvisioned(starshipId);
    const result: ReconcileResult = {
      starshipId,
      agents: emptyEntityResult(),
      connectors: emptyEntityResult(),
      tables: emptyEntityResult(),
      schedules: emptyEntityResult(),
    };

    const wants = (entity: DefinitionEntityDir) => !target?.entity || target.entity === entity;

    if (wants('agents')) {
      if (target?.entity === 'agents' && target.filename) {
        const outcome = await this.reconcileAgentFile(starshipId, target.filename);
        if (outcome?.changed) result.agents.upserted += 1;
        else if (outcome) result.agents.unchanged += 1;
      } else {
        result.agents = await this.reconcileAgents(starshipId, { pruneOrphans: target?.pruneOrphans });
      }
    }

    if (wants('connectors')) {
      if (target?.entity === 'connectors' && target.filename) {
        const outcome = await this.reconcileConnectorFile(starshipId, target.filename);
        if (outcome?.changed) result.connectors.upserted += 1;
        else if (outcome) result.connectors.unchanged += 1;
      } else {
        result.connectors = await this.reconcileConnectors(starshipId, { pruneOrphans: target?.pruneOrphans });
      }
    }

    if (wants('tables')) {
      if (target?.entity === 'tables' && target.filename) {
        const outcome = await this.reconcileTableFile(starshipId, target.filename);
        if (outcome?.changed) result.tables.upserted += 1;
        else if (outcome) result.tables.unchanged += 1;
      } else {
        result.tables = await this.reconcileTables(starshipId, { pruneOrphans: target?.pruneOrphans });
      }
    }

    if (wants('schedules')) {
      if (target?.entity === 'schedules' && target.filename) {
        const outcome = await this.reconcileScheduleFile(starshipId, target.filename);
        if (outcome?.changed) result.schedules.upserted += 1;
        else if (outcome) result.schedules.unchanged += 1;
      } else {
        result.schedules = await this.reconcileSchedules(starshipId, { pruneOrphans: target?.pruneOrphans });
      }
    }

    // NOTE: rooms reconcile lands in Stage 3.
    return result;
  }
}

export default StarshipDefinitionReconciler;
