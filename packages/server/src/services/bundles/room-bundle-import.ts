import { z } from 'zod';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { ImportExportContainerV1, UpdateAgentRequest, UpdateToolRequest } from '@starships/protocol';
import {
  AgentRepository,
  ConversationParticipantRepository,
  ConversationRepository,
  getConnection,
  PostgresConnection,
  RoomDatasetsRepository,
  RoomRepository,
  RoomTaskBoardsRepository,
  RoomToolsRepository,
  RoomViewsRepository,
  StarshipDatasetRepository,
  StarshipDatasetRowRepository,
  TaskBoardRepository,
  TaskCardRepository,
  TaskColumnRepository,
  ToolRepository,
  ViewRepository,
  computeAgentContentHash,
  computeToolContentHash,
} from '@starships/models';
import { AgentService } from '@/services/AgentService';
import { ImportExportService } from '@/services/ImportExportService';

type UnknownRecord = Record<string, unknown>;

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const helper = (v: unknown): unknown => {
    if (v == null) return v;
    if (typeof v !== 'object') return v;
    if (seen.has(v as object)) return '[Circular]';
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(helper);
    const obj = v as UnknownRecord;
    const out: UnknownRecord = {};
    for (const k of Object.keys(obj).sort()) out[k] = helper(obj[k]);
    return out;
  };
  return JSON.stringify(helper(value));
}

function computeBundleHash(obj: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(obj), 'utf8').digest('hex');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readContentHash(value: unknown): string | undefined {
  return typeof value === 'string' && value.length === 64 ? value : undefined;
}

const ImportExportContainerSchemaV1RoomBundle = z.object({
  schemaVersion: z.literal('1'),
  kind: z.enum(['agent', 'tool', 'room', 'view', 'dataset', 'task_board']),
  exportedAt: z.string().min(1),
  metadata: z
    .object({
      fromSlug: z.string().optional(),
      fromStarshipSlug: z.string().optional(),
    })
    .passthrough()
    .optional(),
  source: z
    .object({
      app: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  payload: z.unknown(),
});

const ImportBundleManifestSchemaV1 = z.object({
  schemaVersion: z.literal('1'),
  kind: z.literal('bundle'),
  exportedAt: z.string().min(1),
  entities: z.object({
    agents: z
      .array(
        z.object({
          kind: z.literal('agent'),
          file: z.string().min(1),
          fromSlug: z.unknown().optional(),
          fromStarshipSlug: z.unknown().optional(),
        })
      )
      .default([]),
    tools: z
      .array(
        z.object({
          kind: z.literal('tool'),
          file: z.string().min(1),
          fromSlug: z.unknown().optional(),
          fromStarshipSlug: z.unknown().optional(),
        })
      )
      .default([]),
  }),
});

const ImportRoomBundleManifestSchemaV1 = z.object({
  schemaVersion: z.literal('1'),
  kind: z.literal('bundle'),
  exportedAt: z.string().min(1),
  entities: z.object({
    rooms: z
      .array(
        z.object({
          kind: z.literal('room'),
          file: z.string().min(1),
          fromSlug: z.unknown().optional(),
          fromStarshipSlug: z.unknown().optional(),
        })
      )
      .default([]),
    views: z
      .array(
        z.object({
          kind: z.literal('view'),
          file: z.string().min(1),
          fromSlug: z.unknown().optional(),
          fromStarshipSlug: z.unknown().optional(),
        })
      )
      .default([]),
    datasets: z
      .array(
        z.object({
          kind: z.literal('dataset'),
          file: z.string().min(1),
          fromSlug: z.unknown().optional(),
          fromStarshipSlug: z.unknown().optional(),
        })
      )
      .default([]),
    taskBoards: z
      .array(
        z.object({
          kind: z.literal('task_board'),
          file: z.string().min(1),
          fromSlug: z.unknown().optional(),
          fromStarshipSlug: z.unknown().optional(),
        })
      )
      .default([]),
    agents: ImportBundleManifestSchemaV1.shape.entities.shape.agents,
    tools: ImportBundleManifestSchemaV1.shape.entities.shape.tools,
  }),
});

const ROOM_BUNDLE_ENTRY_PATH_ALLOWLIST = /^(agents|tools|rooms|views|datasets|task-boards)\/[\w.-]+\.json$/;
function isAllowedRoomBundlePath(file: unknown): file is string {
  return typeof file === 'string' && ROOM_BUNDLE_ENTRY_PATH_ALLOWLIST.test(file);
}

function assertRoomBundleManifestPathsOrThrow(manifest: z.infer<typeof ImportRoomBundleManifestSchemaV1>): void {
  for (const t of manifest.entities.tools) {
    if (!isAllowedRoomBundlePath(t.file) || !t.file.startsWith('tools/')) throw new Error(`Invalid manifest path for tool entry: ${String(t.file)}`);
  }
  for (const a of manifest.entities.agents) {
    if (!isAllowedRoomBundlePath(a.file) || !a.file.startsWith('agents/')) throw new Error(`Invalid manifest path for agent entry: ${String(a.file)}`);
  }
  for (const r of manifest.entities.rooms) {
    if (!isAllowedRoomBundlePath(r.file) || !r.file.startsWith('rooms/')) throw new Error(`Invalid manifest path for room entry: ${String(r.file)}`);
  }
  for (const v of manifest.entities.views) {
    if (!isAllowedRoomBundlePath(v.file) || !v.file.startsWith('views/')) throw new Error(`Invalid manifest path for view entry: ${String(v.file)}`);
  }
  for (const d of manifest.entities.datasets) {
    if (!isAllowedRoomBundlePath(d.file) || !d.file.startsWith('datasets/')) throw new Error(`Invalid manifest path for dataset entry: ${String(d.file)}`);
  }
  for (const b of manifest.entities.taskBoards) {
    if (!isAllowedRoomBundlePath(b.file) || !b.file.startsWith('task-boards/')) throw new Error(`Invalid manifest path for task board entry: ${String(b.file)}`);
  }
}

function getBundleEntry(zip: AdmZip, file: string): AdmZip.IZipEntry | null {
  const direct = zip.getEntry(file);
  if (direct) return direct;
  const normalized = file.replace(/^[./]+/, '');
  const entries = zip.getEntries();
  for (const entry of entries) {
    const name = entry.entryName.replace(/^[./]+/, '');
    if (name === normalized || name.endsWith('/' + normalized)) {
      return entry;
    }
  }
  return null;
}

type RoomBundleDecision = { action: 'skip' | 'copy' | 'overwrite'; targetId?: string };
export type RoomBundleDecisions = {
  rooms: Record<string, RoomBundleDecision>;
  views: Record<string, RoomBundleDecision>;
  datasets: Record<string, RoomBundleDecision>;
  taskBoards: Record<string, RoomBundleDecision>;
  tools: Record<string, RoomBundleDecision>;
  agents: Record<string, RoomBundleDecision>;
};

function makeTransactionConnection(client: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
}): PostgresConnection {
  const txConn = {
    async connect() {},
    async disconnect() {},
    getPool() {
      throw new Error('Pool not available on transaction-scoped connection');
    },
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      const res = await client.query(text, params);
      return res.rows as T[];
    },
    async queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
      const res = await client.query(text, params);
      return (res.rows?.[0] ?? null) as T | null;
    },
    async queryCount(text: string, params: unknown[] = []): Promise<number> {
      const row = await txConn.queryOne<{ count: string }>(text, params);
      return row ? parseInt(row.count, 10) : 0;
    },
    async queryWithResult(text: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
      const res = await client.query(text, params);
      return { rows: res.rows, rowCount: res.rowCount ?? 0 };
    },
    async transaction() {
      throw new Error('Nested transactions are not supported here');
    },
    async batchQuery<T = Record<string, unknown>>(queries: Array<{ text: string; params?: unknown[] }>): Promise<T[][]> {
      const results: T[][] = [];
      for (const q of queries) {
        const res = await client.query(q.text, q.params || []);
        results.push(res.rows as T[]);
      }
      return results;
    },
    async getClient(): Promise<unknown> {
      return client;
    },
    async healthCheck(): Promise<boolean> {
      try {
        await client.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async getInfo() {
      throw new Error('Not available on transaction-scoped connection');
    },
    async initializeSchema() {},
  };
  return txConn as unknown as PostgresConnection;
}

function parseZipOrThrow(zipBuffer: Buffer): AdmZip {
  try {
    return new AdmZip(zipBuffer);
  } catch {
    throw new Error('Invalid zip bundle');
  }
}

function readRoomBundleManifestOrThrow(zip: AdmZip): z.infer<typeof ImportRoomBundleManifestSchemaV1> {
  const manifestEntry = getBundleEntry(zip, 'manifest.json');
  if (!manifestEntry) throw new Error('Bundle is missing manifest.json');
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch {
    throw new Error('Bundle manifest.json is not valid JSON');
  }
  const parsed = ImportRoomBundleManifestSchemaV1.safeParse(manifestRaw);
  if (!parsed.success) throw new Error('Bundle manifest.json has an unexpected shape');
  assertRoomBundleManifestPathsOrThrow(parsed.data);
  return parsed.data;
}

export async function analyzeRoomBundleImport(args: { starshipId: string; zipBuffer: Buffer }): Promise<any> {
  // Reuse the main server’s analysis semantics (copied from starships routes).
  const zip = parseZipOrThrow(args.zipBuffer);
  const manifestParsed = readRoomBundleManifestOrThrow(zip);
  const ContainerSchema = ImportExportContainerSchemaV1RoomBundle;
  const starshipId = args.starshipId;

  // Existing tools/agents use the same hashing logic as agent bundle import.
  const toolRepo = new ToolRepository();
  const agentRepo = new AgentRepository();
  const existingTools = await toolRepo.findByStarship(starshipId);
  const existingToolsByHash = new Map<string, (typeof existingTools)[number]>();
  const existingToolsByName = new Map<string, (typeof existingTools)[number]>();
  for (const t of existingTools) {
    const nameKey = String(t.name || '').trim().toLowerCase();
    if (nameKey) existingToolsByName.set(nameKey, t);
    const storedHash = readContentHash((t as unknown as { contentHash?: unknown }).contentHash);
    if (storedHash) existingToolsByHash.set(storedHash, t);
    const computedHash = computeToolContentHash({
      name: t.name,
      description: t.description,
      parameters: (t as any).parameters,
      blueprint: (t as any).blueprint,
      transforms: (t as any).transforms,
      mutations: (t as any).mutations,
      condition: (t as any).condition,
      isEnabled: (t as any).isEnabled,
      status: (t as any).status,
    });
    existingToolsByHash.set(computedHash, t);
  }

  const existingAgents = await agentRepo.findByStarship(starshipId);
  const assignedToolRows = await agentRepo.getAssignedToolSlugsForAgents(existingAgents.map((a) => a.id));
  const assignedToolSlugsByAgentId = new Map<string, string[]>();
  for (const row of assignedToolRows) {
    const list = assignedToolSlugsByAgentId.get(row.agentId) ?? [];
    list.push(row.toolSlug);
    assignedToolSlugsByAgentId.set(row.agentId, list);
  }
  const existingAgentsByHash = new Map<string, (typeof existingAgents)[number]>();
  const existingAgentsByName = new Map<string, (typeof existingAgents)[number]>();
  for (const a of existingAgents) {
    const nameKey = String(a.name || '').trim().toLowerCase();
    if (nameKey) existingAgentsByName.set(nameKey, a);
    const storedHash = readContentHash((a as unknown as { contentHash?: unknown }).contentHash);
    if (storedHash) existingAgentsByHash.set(storedHash, a);
    const slugs = assignedToolSlugsByAgentId.get(a.id) ?? [];
    const computed = computeAgentContentHash({
      name: a.name,
      role: a.role,
      description: a.description,
      model: a.model,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
      timeout: a.timeout,
      reasoning: (a as unknown as { reasoning?: unknown }).reasoning,
      systemPrompt: a.systemPrompt,
      state: a.state,
      blueprint: a.blueprint,
      category: a.category,
      previewPrompts: a.previewPrompts,
      assignedToolSlugs: slugs,
    });
    existingAgentsByHash.set(computed, a);
  }

  // Existing views/datasets/task boards/rooms (conflicts by hash + name where feasible).
  const viewRepo = new ViewRepository();
  const datasetRepo = new StarshipDatasetRepository();
  const taskBoardRepo = new TaskBoardRepository();
  const roomRepo = new RoomRepository();

  const existingViews = await viewRepo.findByStarshipId(starshipId);
  const existingViewsByHash = new Map<string, (typeof existingViews)[number]>();
  const existingViewsByName = new Map<string, (typeof existingViews)[number]>();
  for (const v of existingViews) {
    const nameKey = String(v.name || '').trim().toLowerCase();
    if (nameKey) existingViewsByName.set(nameKey, v);
    const h = computeBundleHash({ name: v.name, description: v.description, root: v.root, runtimeConfig: v.runtimeConfig });
    existingViewsByHash.set(h, v);
  }

  const existingDatasets = await datasetRepo.listByStarship(starshipId, { includeArchived: true });
  const existingDatasetsByHash = new Map<string, (typeof existingDatasets)[number]>();
  const existingDatasetsByName = new Map<string, (typeof existingDatasets)[number]>();
  for (const d of existingDatasets) {
    const nameKey = String(d.name || '').trim().toLowerCase();
    if (nameKey) existingDatasetsByName.set(nameKey, d);
    const h = computeBundleHash({ name: d.name, description: d.description, columns: d.columns, primaryKey: d.primaryKey ?? null });
    existingDatasetsByHash.set(h, d);
  }

  const existingBoards = await taskBoardRepo.listByStarship(starshipId, { includeArchived: true });
  const existingBoardsByHash = new Map<string, (typeof existingBoards)[number]>();
  const existingBoardsByName = new Map<string, (typeof existingBoards)[number]>();
  for (const b of existingBoards) {
    const nameKey = String(b.name || '').trim().toLowerCase();
    if (nameKey) existingBoardsByName.set(nameKey, b);
    const h = computeBundleHash({ name: b.name, description: b.description });
    existingBoardsByHash.set(h, b);
  }

  const existingRooms = await roomRepo.listByStarship(starshipId);
  const existingRoomsByHash = new Map<string, (typeof existingRooms)[number]>();
  const existingRoomsByName = new Map<string, (typeof existingRooms)[number]>();
  for (const r of existingRooms) {
    const nameKey = String(r.name || '').trim().toLowerCase();
    if (nameKey) existingRoomsByName.set(nameKey, r);
    const h = computeBundleHash({ name: r.name, isPrivate: r.isPrivate, topic: r.topic ?? null });
    existingRoomsByHash.set(h, r);
  }

  const toolsAnalysis: any[] = [];
  for (const t of manifestParsed.entities.tools) {
    const entry = getBundleEntry(zip, t.file);
    if (!entry) continue;
    let containerRaw: unknown;
    try {
      containerRaw = JSON.parse(entry.getData().toString('utf8'));
    } catch {
      continue;
    }
    const containerParsed = ContainerSchema.safeParse(containerRaw);
    if (!containerParsed.success || containerParsed.data.kind !== 'tool') continue;
    const payload = containerParsed.data.payload as unknown as { tool?: Record<string, unknown> };
    const toolPayload = payload?.tool ?? {};
    const bundleHash = computeToolContentHash({
      name: toolPayload?.name,
      description: toolPayload?.description,
      parameters: toolPayload?.parameters,
      blueprint: toolPayload?.blueprint,
      transforms: toolPayload?.transforms,
      mutations: toolPayload?.mutations,
      condition: toolPayload?.condition,
      isEnabled: toolPayload?.isEnabled,
      status: toolPayload?.status,
    });
    const name = String(toolPayload?.name || '').trim();
    const existingByHash = existingToolsByHash.get(bundleHash);
    const existingByName = name ? existingToolsByName.get(name.toLowerCase()) : undefined;
    const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
    const existing = existingByHash ?? existingByName;
    toolsAnalysis.push({
      kind: 'tool',
      file: t.file,
      name: name || '(unnamed tool)',
      bundleHash,
      status,
      existing: existing ? { id: existing.id, name: existing.name, slug: existing.slug, contentHash: readContentHash((existing as any).contentHash) } : undefined,
    });
  }

  const agentsAnalysis: any[] = [];
  for (const a of manifestParsed.entities.agents) {
    const entry = getBundleEntry(zip, a.file);
    if (!entry) continue;
    let containerRaw: unknown;
    try {
      containerRaw = JSON.parse(entry.getData().toString('utf8'));
    } catch {
      continue;
    }
    const containerParsed = ContainerSchema.safeParse(containerRaw);
    if (!containerParsed.success || containerParsed.data.kind !== 'agent') continue;
    const payload = containerParsed.data.payload as unknown as { agent?: Record<string, unknown>; assignedToolSlugs?: unknown };
    const agentPayload = payload?.agent ?? {};
    const assignedToolSlugs = Array.isArray(payload?.assignedToolSlugs) ? payload.assignedToolSlugs : [];
    const bundleHash = computeAgentContentHash({
      name: agentPayload?.name,
      role: agentPayload?.role,
      description: agentPayload?.description,
      model: agentPayload?.model,
      temperature: agentPayload?.temperature,
      maxTokens: agentPayload?.maxTokens,
      timeout: agentPayload?.timeout,
      reasoning: agentPayload?.reasoning,
      systemPrompt: agentPayload?.systemPrompt,
      state: agentPayload?.state,
      blueprint: agentPayload?.blueprint,
      category: agentPayload?.category,
      previewPrompts: agentPayload?.previewPrompts,
      assignedToolSlugs,
    });
    const name = String(agentPayload?.name || '').trim();
    const existingByHash = existingAgentsByHash.get(bundleHash);
    const existingByName = name ? existingAgentsByName.get(name.toLowerCase()) : undefined;
    const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
    const existing = existingByHash ?? existingByName;
    agentsAnalysis.push({
      kind: 'agent',
      file: a.file,
      name: name || '(unnamed agent)',
      bundleHash,
      status,
      existing: existing ? { id: existing.id, name: existing.name, slug: existing.slug, contentHash: readContentHash((existing as any).contentHash) } : undefined,
    });
  }

  const viewsAnalysis: any[] = [];
  for (const v of manifestParsed.entities.views) {
    const entry = getBundleEntry(zip, v.file);
    if (!entry) continue;
    let containerRaw: unknown;
    try {
      containerRaw = JSON.parse(entry.getData().toString('utf8'));
    } catch {
      continue;
    }
    const containerParsed = ContainerSchema.safeParse(containerRaw);
    if (!containerParsed.success || containerParsed.data.kind !== 'view') continue;
    const payload = containerParsed.data.payload as unknown as { view?: Record<string, unknown> };
    const viewPayload = payload?.view ?? {};
    const name = String(viewPayload?.name || '').trim();
    const bundleHash = computeBundleHash({ name: viewPayload?.name, description: viewPayload?.description, root: viewPayload?.root, runtimeConfig: viewPayload?.runtimeConfig });
    const existingByHash = existingViewsByHash.get(bundleHash);
    const existingByName = name ? existingViewsByName.get(name.toLowerCase()) : undefined;
    const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
    const existing = existingByHash ?? existingByName;
    viewsAnalysis.push({ kind: 'view', file: v.file, name: name || '(unnamed view)', bundleHash, status, existing: existing ? { id: existing.id, name: existing.name, slug: existing.slug } : undefined });
  }

  const datasetsAnalysis: any[] = [];
  for (const d of manifestParsed.entities.datasets) {
    const entry = getBundleEntry(zip, d.file);
    if (!entry) continue;
    let containerRaw: unknown;
    try {
      containerRaw = JSON.parse(entry.getData().toString('utf8'));
    } catch {
      continue;
    }
    const containerParsed = ContainerSchema.safeParse(containerRaw);
    if (!containerParsed.success || containerParsed.data.kind !== 'dataset') continue;
    const payload = containerParsed.data.payload as unknown as { dataset?: Record<string, unknown> };
    const datasetPayload = payload?.dataset ?? {};
    const name = String(datasetPayload?.name || '').trim();
    const bundleHash = computeBundleHash({ name: datasetPayload?.name, description: datasetPayload?.description, columns: datasetPayload?.columns, primaryKey: (datasetPayload as any)?.primaryKey ?? null });
    const existingByHash = existingDatasetsByHash.get(bundleHash);
    const existingByName = name ? existingDatasetsByName.get(name.toLowerCase()) : undefined;
    const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
    const existing = existingByHash ?? existingByName;
    datasetsAnalysis.push({ kind: 'dataset', file: d.file, name: name || '(unnamed dataset)', bundleHash, status, existing: existing ? { id: existing.id, name: existing.name, slug: existing.slug } : undefined });
  }

  const taskBoardsAnalysis: any[] = [];
  for (const b of manifestParsed.entities.taskBoards) {
    const entry = getBundleEntry(zip, b.file);
    if (!entry) continue;
    let containerRaw: unknown;
    try {
      containerRaw = JSON.parse(entry.getData().toString('utf8'));
    } catch {
      continue;
    }
    const containerParsed = ContainerSchema.safeParse(containerRaw);
    if (!containerParsed.success || containerParsed.data.kind !== 'task_board') continue;
    const payload = containerParsed.data.payload as unknown as { taskBoard?: Record<string, unknown> };
    const boardPayload = payload?.taskBoard ?? {};
    const name = String(boardPayload?.name || '').trim();
    const bundleHash = computeBundleHash({ name: boardPayload?.name, description: boardPayload?.description });
    const existingByHash = existingBoardsByHash.get(bundleHash);
    const existingByName = name ? existingBoardsByName.get(name.toLowerCase()) : undefined;
    const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
    const existing = existingByHash ?? existingByName;
    taskBoardsAnalysis.push({ kind: 'task_board', file: b.file, name: name || '(unnamed task board)', bundleHash, status, existing: existing ? { id: existing.id, name: existing.name, slug: existing.slug } : undefined });
  }

  const roomsAnalysis: any[] = [];
  for (const r of manifestParsed.entities.rooms) {
    const entry = getBundleEntry(zip, r.file);
    if (!entry) continue;
    let containerRaw: unknown;
    try {
      containerRaw = JSON.parse(entry.getData().toString('utf8'));
    } catch {
      continue;
    }
    const containerParsed = ContainerSchema.safeParse(containerRaw);
    if (!containerParsed.success || containerParsed.data.kind !== 'room') continue;
    const payload = containerParsed.data.payload as unknown as { room?: Record<string, unknown> };
    const roomPayload = payload?.room ?? {};
    const name = String(roomPayload?.name || '').trim();
    const bundleHash = computeBundleHash({ name: roomPayload?.name, isPrivate: roomPayload?.isPrivate, topic: roomPayload?.topic ?? null });
    const existingByHash = existingRoomsByHash.get(bundleHash);
    const existingByName = name ? existingRoomsByName.get(name.toLowerCase()) : undefined;
    const existing = existingByHash ?? existingByName;
    const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
    roomsAnalysis.push({ kind: 'room', file: r.file, name: name || '(unnamed room)', bundleHash, status, existing: existing ? { conversationId: existing.conversationId, name: existing.name, slug: existing.slug } : undefined });
  }

  return { rooms: roomsAnalysis, views: viewsAnalysis, datasets: datasetsAnalysis, taskBoards: taskBoardsAnalysis, tools: toolsAnalysis, agents: agentsAnalysis };
}

export async function applyRoomBundleImport(args: { starshipId: string; userId: string; zipBuffer: Buffer; decisions: RoomBundleDecisions }): Promise<{ imported: Record<string, number>; warnings?: string[] }> {
  const zip = parseZipOrThrow(args.zipBuffer);
  const manifest = readRoomBundleManifestOrThrow(zip);
  return await applyRoomBundleToStarship({ starshipId: args.starshipId, userId: args.userId, zip, manifest, decisions: args.decisions });
}

async function applyRoomBundleToStarship(_opts: {
  starshipId: string;
  userId: string;
  zip: AdmZip;
  manifest: z.infer<typeof ImportRoomBundleManifestSchemaV1>;
  decisions: RoomBundleDecisions;
}): Promise<{ imported: Record<string, number>; warnings?: string[] }> {
  const { starshipId, userId, zip, manifest, decisions } = _opts;
  const ContainerSchema = ImportExportContainerSchemaV1RoomBundle;
  const conn = getConnection();

  const applyResult = await conn.transaction(async (client) => {
    const txConn = makeTransactionConnection(client);
    const toolRepo = new ToolRepository(txConn);
    const agentRepo = new AgentRepository(txConn);
    const agentService = new AgentService(txConn);
    const svc = new ImportExportService(txConn);
    const viewRepo = new ViewRepository(txConn);
    const datasetRepo = new StarshipDatasetRepository(txConn);
    const datasetRowRepo = new StarshipDatasetRowRepository(txConn);
    const taskBoardRepo = new TaskBoardRepository(txConn);
    const taskColumnRepo = new TaskColumnRepository(txConn);
    const taskCardRepo = new TaskCardRepository(txConn);
    const roomRepo = new RoomRepository(txConn);
    const roomViewsRepo = new RoomViewsRepository(txConn);
    const roomDatasetsRepo = new RoomDatasetsRepository(txConn);
    const roomTaskBoardsRepo = new RoomTaskBoardsRepository(txConn);
    const roomToolsRepo = new RoomToolsRepository(txConn);
    const participantRepo = new ConversationParticipantRepository(txConn);
    const conversationRepo = new ConversationRepository(txConn);

    const warnings: string[] = [];
    const imported: Record<string, number> = { rooms: 0, views: 0, datasets: 0, taskBoards: 0, agents: 0, tools: 0 };

    const toolSlugMap = new Map<string, string>();
    const agentIdMap = new Map<string, string>(); // source slug -> created agent id
    const viewSlugMap = new Map<string, string>(); // source slug -> created slug
    const datasetSlugMap = new Map<string, string>();
    const taskBoardSlugMap = new Map<string, string>();

    // Index existing tools for overwrite/skip mapping.
    const existingTools = await toolRepo.findByStarship(starshipId);
    const toolsByHash = new Map<string, (typeof existingTools)[number]>();
    const toolsByName = new Map<string, (typeof existingTools)[number]>();
    const indexTool = (t: (typeof existingTools)[number]) => {
      const nameKey = String(t.name || '').trim().toLowerCase();
      if (nameKey) toolsByName.set(nameKey, t);
      const hash = readContentHash((t as unknown as { contentHash?: unknown }).contentHash);
      if (hash) toolsByHash.set(hash, t);
    };
    for (const t of existingTools) indexTool(t);

    // Tools first (same semantics as agent bundle import)
    for (const t of manifest.entities.tools) {
      const entry = getBundleEntry(zip, t.file);
      if (!entry) {
        warnings.push(`Bundle is missing tool file: ${t.file}`);
        continue;
      }
      let containerRaw: unknown;
      try {
        containerRaw = JSON.parse(entry.getData().toString('utf8'));
      } catch {
        warnings.push(`Tool file is not valid JSON: ${t.file}`);
        continue;
      }
      const containerParsed = ContainerSchema.safeParse(containerRaw);
      if (!containerParsed.success || containerParsed.data.kind !== 'tool') {
        warnings.push(`Tool file is not a valid tool container: ${t.file}`);
        continue;
      }

      const payload = containerParsed.data.payload as unknown as { tool?: Record<string, unknown> };
      const toolPayload = payload?.tool ?? {};
      const fromSlug = containerParsed.data.metadata?.fromSlug;
      const bundleHash = computeToolContentHash({
        name: toolPayload?.name,
        description: toolPayload?.description,
        parameters: toolPayload?.parameters,
        blueprint: toolPayload?.blueprint,
        transforms: toolPayload?.transforms,
        mutations: toolPayload?.mutations,
        condition: toolPayload?.condition,
        isEnabled: toolPayload?.isEnabled,
        status: toolPayload?.status,
      });

      const decision = decisions.tools[bundleHash] ?? { action: 'copy' as const };
      const toolNameKey = String(toolPayload?.name || '').trim().toLowerCase();
      const existingByHash = toolsByHash.get(bundleHash);
      const existingByName = toolNameKey ? toolsByName.get(toolNameKey) : undefined;
      const target = existingByHash ?? existingByName ?? null;

      const sourceSlug = typeof fromSlug === 'string' ? fromSlug.trim() : '';
      if (decision.action === 'skip') {
        if (sourceSlug && target?.slug) toolSlugMap.set(sourceSlug, target.slug);
        continue;
      }

      if (decision.action === 'overwrite') {
        const targetId = decision.targetId || target?.id;
        if (!targetId) {
          warnings.push(`No overwrite target found for tool: ${String(toolPayload?.name || t.file)}`);
          continue;
        }
        const updateReq: UpdateToolRequest = {
          name: typeof toolPayload?.name === 'string' ? toolPayload.name : undefined,
          description: typeof toolPayload?.description === 'string' ? toolPayload.description : '',
          parameters: toolPayload?.parameters as UpdateToolRequest['parameters'],
          blueprint: toolPayload?.blueprint as UpdateToolRequest['blueprint'],
          transforms: toolPayload?.transforms as UpdateToolRequest['transforms'],
          mutations: toolPayload?.mutations as UpdateToolRequest['mutations'],
          condition: typeof toolPayload?.condition === 'string' ? toolPayload.condition : undefined,
          isEnabled: typeof toolPayload?.isEnabled === 'boolean' ? toolPayload.isEnabled : undefined,
          status: toolPayload?.status === 'draft' || toolPayload?.status === 'active' ? toolPayload.status : undefined,
        };
        const updated = await toolRepo.update(targetId, updateReq);
        if (updated) {
          imported.tools += 1;
          indexTool(updated);
          if (sourceSlug) toolSlugMap.set(sourceSlug, updated.slug);
        }
        continue;
      }

      const result = await svc.importToStarship(starshipId, containerParsed.data as unknown as ImportExportContainerV1);
      if (result?.warnings?.length) warnings.push(...result.warnings);
      if (result?.kind === 'tool' && result.tool) {
        imported.tools += 1;
        indexTool(result.tool as any);
        if (sourceSlug && (result.tool as any).slug) toolSlugMap.set(sourceSlug, (result.tool as any).slug);
      }
    }

    // Index existing agents for skip/overwrite target discovery.
    const existingAgents = await agentRepo.findByStarship(starshipId);
    const agentsByName = new Map<string, (typeof existingAgents)[number]>();
    for (const a of existingAgents) {
      const nameKey = String(a.name || '').trim().toLowerCase();
      if (nameKey) agentsByName.set(nameKey, a);
    }

    // Agents (rewrite assigned tool slugs using toolSlugMap, and create agentIdMap).
    for (const a of manifest.entities.agents) {
      const entry = getBundleEntry(zip, a.file);
      if (!entry) {
        warnings.push(`Bundle is missing agent file: ${a.file}`);
        continue;
      }
      let containerRaw: unknown;
      try {
        containerRaw = JSON.parse(entry.getData().toString('utf8'));
      } catch {
        warnings.push(`Agent file is not valid JSON: ${a.file}`);
        continue;
      }
      const containerParsed = ContainerSchema.safeParse(containerRaw);
      if (!containerParsed.success || containerParsed.data.kind !== 'agent') {
        warnings.push(`Agent file is not a valid agent container: ${a.file}`);
        continue;
      }

      const fromSlug = containerParsed.data.metadata?.fromSlug;
      const sourceSlug = typeof fromSlug === 'string' ? fromSlug.trim() : '';

      const payload = containerParsed.data.payload as unknown as { agent?: Record<string, unknown>; assignedToolSlugs?: unknown };
      const agentPayload = payload?.agent ?? {};
      const assignedToolSlugsRaw = Array.isArray(payload?.assignedToolSlugs) ? payload.assignedToolSlugs : [];
      const assignedToolSlugs = assignedToolSlugsRaw.filter((s: unknown) => typeof s === 'string' && s.trim().length > 0) as string[];
      const rewrittenToolSlugs = assignedToolSlugs.map((s) => toolSlugMap.get(s) ?? s);

      const bundleHash = computeAgentContentHash({
        name: agentPayload?.name,
        role: agentPayload?.role,
        description: agentPayload?.description,
        model: agentPayload?.model,
        temperature: agentPayload?.temperature,
        maxTokens: agentPayload?.maxTokens,
        timeout: agentPayload?.timeout,
        reasoning: agentPayload?.reasoning,
        systemPrompt: agentPayload?.systemPrompt,
        state: agentPayload?.state,
        blueprint: agentPayload?.blueprint,
        category: agentPayload?.category,
        previewPrompts: agentPayload?.previewPrompts,
        assignedToolSlugs: assignedToolSlugs,
      });

      const decision = decisions.agents[bundleHash] ?? { action: 'copy' as const };
      const agentNameKey = String(agentPayload?.name || '').trim().toLowerCase();
      const target =
        (decision.targetId ? existingAgents.find((x) => x.id === decision.targetId) : null) ??
        (agentNameKey ? agentsByName.get(agentNameKey) : null);

      if (decision.action === 'skip') {
        if (sourceSlug && target?.id) agentIdMap.set(sourceSlug, target.id);
        continue;
      }

      if (decision.action === 'overwrite') {
        const targetId = decision.targetId || target?.id;
        if (!targetId) {
          warnings.push(`No overwrite target found for agent: ${String(agentPayload?.name || a.file)}`);
          continue;
        }

        const updateReq: UpdateAgentRequest = {
          name: typeof agentPayload?.name === 'string' ? agentPayload.name : undefined,
          role: typeof agentPayload?.role === 'string' ? agentPayload.role : undefined,
          description: typeof agentPayload?.description === 'string' ? agentPayload.description : undefined,
          model: typeof agentPayload?.model === 'string' ? agentPayload.model : undefined,
          temperature: typeof agentPayload?.temperature === 'number' ? agentPayload.temperature : undefined,
          maxTokens: typeof agentPayload?.maxTokens === 'number' ? agentPayload.maxTokens : undefined,
          timeout: typeof agentPayload?.timeout === 'number' ? agentPayload.timeout : undefined,
          reasoning: agentPayload?.reasoning as UpdateAgentRequest['reasoning'],
          systemPrompt: typeof agentPayload?.systemPrompt === 'string' ? agentPayload.systemPrompt : undefined,
          state: agentPayload?.state as UpdateAgentRequest['state'],
          blueprint: agentPayload?.blueprint as UpdateAgentRequest['blueprint'],
          category: typeof agentPayload?.category === 'string' ? (agentPayload.category as any) : undefined,
          previewPrompts: Array.isArray(agentPayload?.previewPrompts) ? (agentPayload.previewPrompts as any) : undefined,
        };
        const updated = await agentService.updateAgent(targetId, updateReq);
        if (updated) {
          try {
            await agentService.assignToolSlugs(targetId, rewrittenToolSlugs, starshipId);
          } catch (err) {
            warnings.push(`Agent tools partially applied for ${String(agentPayload?.name || targetId)}: ${String((err as any)?.message || err)}`);
          }
          imported.agents += 1;
          if (sourceSlug) agentIdMap.set(sourceSlug, updated.id);
        }
        continue;
      }

      const basePayloadObj = isPlainObject(containerParsed.data.payload) ? containerParsed.data.payload : {};
      const rewrittenContainer = {
        ...(containerParsed.data as unknown as ImportExportContainerV1),
        payload: {
          ...basePayloadObj,
          assignedToolSlugs: rewrittenToolSlugs,
        },
      } as unknown as ImportExportContainerV1;

      try {
        const result = await svc.importToStarship(starshipId, rewrittenContainer);
        if (result?.warnings?.length) warnings.push(...result.warnings);
        if (result?.kind === 'agent' && result.agent) {
          imported.agents += 1;
          if (sourceSlug) agentIdMap.set(sourceSlug, result.agent.id);
        }
      } catch (err) {
        const message = (err as any)?.message || String(err);
        warnings.push(`Agent import failed for ${String(agentPayload?.name || a.file)}: ${message}`);
        // Swallow agent import errors (e.g. agent limit reached) so that room provisioning can continue.
      }
    }

    // Views
    const existingViews = await viewRepo.findByStarshipId(starshipId);
    const viewsByHash = new Map<string, (typeof existingViews)[number]>();
    const viewsByName = new Map<string, (typeof existingViews)[number]>();
    for (const v of existingViews) {
      const nameKey = String(v.name || '').trim().toLowerCase();
      if (nameKey) viewsByName.set(nameKey, v);
      viewsByHash.set(computeBundleHash({ name: v.name, description: v.description, root: v.root, runtimeConfig: v.runtimeConfig }), v);
    }

    for (const v of manifest.entities.views) {
      const entry = getBundleEntry(zip, v.file);
      if (!entry) {
        warnings.push(`Bundle is missing view file: ${v.file}`);
        continue;
      }
      let containerRaw: unknown;
      try {
        containerRaw = JSON.parse(entry.getData().toString('utf8'));
      } catch {
        warnings.push(`View file is not valid JSON: ${v.file}`);
        continue;
      }
      const containerParsed = ContainerSchema.safeParse(containerRaw);
      if (!containerParsed.success || containerParsed.data.kind !== 'view') {
        warnings.push(`View file is not a valid view container: ${v.file}`);
        continue;
      }
      const fromSlug = containerParsed.data.metadata?.fromSlug;
      const sourceSlug = typeof fromSlug === 'string' ? fromSlug.trim() : '';
      const payload = containerParsed.data.payload as unknown as { view?: Record<string, unknown> };
      const viewPayload = payload?.view ?? {};
      const bundleHash = computeBundleHash({ name: viewPayload?.name, description: viewPayload?.description, root: viewPayload?.root, runtimeConfig: viewPayload?.runtimeConfig });
      const decision = decisions.views[bundleHash] ?? { action: 'copy' as const };
      const viewNameKey = String(viewPayload?.name || '').trim().toLowerCase();
      const existingByHash = viewsByHash.get(bundleHash);
      const existingByName = viewNameKey ? viewsByName.get(viewNameKey) : undefined;
      const target = existingByHash ?? existingByName ?? null;

      if (decision.action === 'skip') {
        if (sourceSlug && target?.slug) viewSlugMap.set(sourceSlug, target.slug);
        continue;
      }

      if (decision.action === 'overwrite') {
        const targetId = decision.targetId || target?.id;
        if (!targetId) {
          warnings.push(`No overwrite target found for view: ${String(viewPayload?.name || v.file)}`);
          continue;
        }
        const updated = await viewRepo.update(targetId, {
          name: typeof viewPayload?.name === 'string' ? String(viewPayload.name) : undefined,
          description: typeof viewPayload?.description === 'string' ? String(viewPayload.description) : undefined,
          root: viewPayload?.root as any,
          runtimeConfig: viewPayload?.runtimeConfig as any,
        });
        imported.views += 1;
        if (sourceSlug) viewSlugMap.set(sourceSlug, updated.slug);
        continue;
      }

      const created = await viewRepo.create({
        starshipId,
        name: String(viewPayload?.name || 'View'),
        description: typeof viewPayload?.description === 'string' ? String(viewPayload.description) : '',
        root: viewPayload?.root as any,
        runtimeConfig: viewPayload?.runtimeConfig as any,
      });
      imported.views += 1;
      if (sourceSlug) viewSlugMap.set(sourceSlug, created.slug);
    }

    // Datasets (include rows best-effort; overwrite clears rows).
    const existingDatasets = await datasetRepo.listByStarship(starshipId, { includeArchived: true });
    const datasetsByHash = new Map<string, (typeof existingDatasets)[number]>();
    const datasetsByName = new Map<string, (typeof existingDatasets)[number]>();
    for (const d of existingDatasets) {
      const nameKey = String(d.name || '').trim().toLowerCase();
      if (nameKey) datasetsByName.set(nameKey, d);
      datasetsByHash.set(computeBundleHash({ name: d.name, description: d.description, columns: d.columns, primaryKey: d.primaryKey ?? null }), d);
    }

    for (const d of manifest.entities.datasets) {
      const entry = getBundleEntry(zip, d.file);
      if (!entry) {
        warnings.push(`Bundle is missing dataset file: ${d.file}`);
        continue;
      }
      let containerRaw: unknown;
      try {
        containerRaw = JSON.parse(entry.getData().toString('utf8'));
      } catch {
        warnings.push(`Dataset file is not valid JSON: ${d.file}`);
        continue;
      }
      const containerParsed = ContainerSchema.safeParse(containerRaw);
      if (!containerParsed.success || containerParsed.data.kind !== 'dataset') {
        warnings.push(`Dataset file is not a valid dataset container: ${d.file}`);
        continue;
      }
      const fromSlug = containerParsed.data.metadata?.fromSlug;
      const sourceSlug = typeof fromSlug === 'string' ? fromSlug.trim() : '';
      const payload = containerParsed.data.payload as unknown as { dataset?: Record<string, unknown>; rows?: unknown };
      const datasetPayload = payload?.dataset ?? {};
      const rowsRaw = Array.isArray((payload as any)?.rows) ? ((payload as any).rows as unknown[]) : [];
      const rows = rowsRaw
        .map((r: any) => ({
          ...(typeof r?.rowKey === 'string' ? { rowKey: String(r.rowKey) } : r?.rowKey === null ? { rowKey: null } : {}),
          data: isPlainObject(r?.data) ? (r.data as Record<string, unknown>) : {},
        }))
        .filter((r: any) => isPlainObject(r?.data));

      const bundleHash = computeBundleHash({ name: datasetPayload?.name, description: datasetPayload?.description, columns: datasetPayload?.columns, primaryKey: (datasetPayload as any)?.primaryKey ?? null });
      const decision = decisions.datasets[bundleHash] ?? { action: 'copy' as const };
      const datasetNameKey = String(datasetPayload?.name || '').trim().toLowerCase();
      const existingByHash = datasetsByHash.get(bundleHash);
      const existingByName = datasetNameKey ? datasetsByName.get(datasetNameKey) : undefined;
      const target = existingByHash ?? existingByName ?? null;

      if (decision.action === 'skip') {
        if (sourceSlug && target?.slug) datasetSlugMap.set(sourceSlug, target.slug);
        continue;
      }

      const normalizedCreate = {
        starshipId,
        name: String(datasetPayload?.name || 'Dataset'),
        description: typeof datasetPayload?.description === 'string' ? String(datasetPayload.description) : '',
        columns: Array.isArray((datasetPayload as any)?.columns) ? ((datasetPayload as any).columns as any[]) : [],
        primaryKey:
          typeof (datasetPayload as any)?.primaryKey === 'string'
            ? String((datasetPayload as any).primaryKey)
            : (datasetPayload as any)?.primaryKey === null
              ? null
              : undefined,
      };

      if (decision.action === 'overwrite') {
        const targetId = decision.targetId || target?.id;
        if (!targetId) {
          warnings.push(`No overwrite target found for dataset: ${String(datasetPayload?.name || d.file)}`);
          continue;
        }
        const updated = await datasetRepo.update(targetId, {
          name: normalizedCreate.name,
          description: normalizedCreate.description,
          columns: normalizedCreate.columns as any,
          primaryKey: normalizedCreate.primaryKey as any,
          archived: false,
        });
        if (updated) {
          await txConn.query(`DELETE FROM starship_dataset_rows WHERE dataset_id = $1`, [updated.id]);
          if (rows.length > 0) {
            await datasetRowRepo.appendMany(updated.id, rows);
          }
          imported.datasets += 1;
          if (sourceSlug) datasetSlugMap.set(sourceSlug, updated.slug);
        }
        continue;
      }

      const created = await datasetRepo.create(normalizedCreate as any);
      if (rows.length > 0) {
        await datasetRowRepo.appendMany(created.id, rows);
      }
      imported.datasets += 1;
      if (sourceSlug) datasetSlugMap.set(sourceSlug, created.slug);
    }

    // Task boards (copy/skip; overwrite treated as copy)
    const existingBoards = await taskBoardRepo.listByStarship(starshipId, { includeArchived: true });
    const boardsByName = new Map<string, (typeof existingBoards)[number]>();
    for (const b of existingBoards) {
      const nameKey = String(b.name || '').trim().toLowerCase();
      if (nameKey) boardsByName.set(nameKey, b);
    }

    for (const b of manifest.entities.taskBoards) {
      const entry = getBundleEntry(zip, b.file);
      if (!entry) {
        warnings.push(`Bundle is missing task board file: ${b.file}`);
        continue;
      }
      let containerRaw: unknown;
      try {
        containerRaw = JSON.parse(entry.getData().toString('utf8'));
      } catch {
        warnings.push(`Task board file is not valid JSON: ${b.file}`);
        continue;
      }
      const containerParsed = ContainerSchema.safeParse(containerRaw);
      if (!containerParsed.success || containerParsed.data.kind !== 'task_board') {
        warnings.push(`Task board file is not a valid task board container: ${b.file}`);
        continue;
      }
      const fromSlug = containerParsed.data.metadata?.fromSlug;
      const sourceSlug = typeof fromSlug === 'string' ? fromSlug.trim() : '';
      const payload = containerParsed.data.payload as any;
      const boardPayload = payload?.taskBoard ?? {};
      const name = String(boardPayload?.name || '').trim();
      const bundleHash = computeBundleHash({ name: boardPayload?.name, description: boardPayload?.description });
      const decision = decisions.taskBoards[bundleHash] ?? { action: 'copy' as const };
      const target = name ? boardsByName.get(name.toLowerCase()) : null;

      if (decision.action === 'skip') {
        if (sourceSlug && target?.slug) taskBoardSlugMap.set(sourceSlug, target.slug);
        continue;
      }

      const createdBoard = await taskBoardRepo.create({
        starshipId,
        name: String(boardPayload?.name || 'Board'),
        description: typeof boardPayload?.description === 'string' ? String(boardPayload.description) : '',
        pos: typeof boardPayload?.pos === 'number' ? boardPayload.pos : undefined,
      });

      const columnsRaw = Array.isArray(payload?.columns) ? (payload.columns as any[]) : [];
      const createdColumnByTitle = new Map<string, string>();
      for (const c of columnsRaw) {
        const title = String(c?.title || '').trim();
        if (!title) continue;
        const createdCol = await taskColumnRepo.create({
          boardId: createdBoard.id,
          title,
          key: typeof c?.key === 'string' ? String(c.key) : c?.key === null ? null : undefined,
          pos: typeof c?.pos === 'number' ? c.pos : undefined,
          wipLimit: typeof c?.wipLimit === 'number' ? c.wipLimit : c?.wipLimit === null ? null : undefined,
        });
        createdColumnByTitle.set(title, createdCol.id);
      }

      const cardsRaw = Array.isArray(payload?.cards) ? (payload.cards as any[]) : [];
      for (const c of cardsRaw) {
        const colTitle = String(c?.columnTitle || '').trim();
        const colId = createdColumnByTitle.get(colTitle);
        if (!colId) continue;
        const sourceAssigneeSlug = typeof c?.assigneeAgentSlug === 'string' ? String(c.assigneeAgentSlug).trim() : '';
        const assigneeAgentId = sourceAssigneeSlug ? (agentIdMap.get(sourceAssigneeSlug) ?? null) : null;
        const assigneeUserSlug = typeof c?.assigneeUserSlug === 'string' ? String(c.assigneeUserSlug).trim() : '';
        const assigneeUserId = assigneeUserSlug.startsWith('u:') ? assigneeUserSlug.slice(2) : null;
        const createdCard = await taskCardRepo.create({
          boardId: createdBoard.id,
          columnId: colId,
          title: String(c?.title || 'Card'),
          description: typeof c?.description === 'string' ? String(c.description) : '',
          pos: typeof c?.pos === 'number' ? c.pos : undefined,
          priority: typeof c?.priority === 'number' ? c.priority : c?.priority === null ? null : undefined,
          assigneeAgentId,
          assigneeUserId,
        });
        if (c?.archived === true) {
          await taskCardRepo.update(createdCard.id, { archived: true });
        }
      }

      imported.taskBoards += 1;
      if (sourceSlug) taskBoardSlugMap.set(sourceSlug, createdBoard.slug);
    }

    // Rooms (copy/skip; overwrite treated as copy)
    for (const r of manifest.entities.rooms) {
      const entry = getBundleEntry(zip, r.file);
      if (!entry) {
        warnings.push(`Bundle is missing room file: ${r.file}`);
        continue;
      }
      let containerRaw: unknown;
      try {
        containerRaw = JSON.parse(entry.getData().toString('utf8'));
      } catch {
        warnings.push(`Room file is not valid JSON: ${r.file}`);
        continue;
      }
      const containerParsed = ContainerSchema.safeParse(containerRaw);
      if (!containerParsed.success || containerParsed.data.kind !== 'room') {
        warnings.push(`Room file is not a valid room container: ${r.file}`);
        continue;
      }

      const payload = containerParsed.data.payload as any;
      const roomPayload = payload?.room ?? {};
      const bundleHash = computeBundleHash({ name: roomPayload?.name, isPrivate: roomPayload?.isPrivate, topic: roomPayload?.topic ?? null });
      const decision = decisions.rooms[bundleHash] ?? { action: 'copy' as const };
      if (decision.action === 'skip') continue;

      const conversation = await conversationRepo.create({
        title: String(roomPayload?.name || 'Room'),
        status: 'active',
        starshipId,
      });
      const createdRoom = await roomRepo.create({
        conversationId: conversation.id,
        starshipId,
        name: String(roomPayload?.name || 'Room'),
        isPrivate: Boolean(roomPayload?.isPrivate),
        topic: roomPayload?.topic ?? null,
        provisionedByBundle: null,
      });

      // Creator becomes admin participant.
      await participantRepo.addUserParticipant({
        conversationId: createdRoom.conversationId,
        userId,
        role: 'admin',
        createdBy: userId,
      });

      // Agent participants (best-effort; skip missing agents)
      const agentSlugs = Array.isArray(payload?.agentParticipantSlugs) ? (payload.agentParticipantSlugs as unknown[]) : [];
      for (const s of agentSlugs) {
        const sourceSlug = typeof s === 'string' ? s.trim() : '';
        if (!sourceSlug) continue;
        const agentId = agentIdMap.get(sourceSlug);
        if (!agentId) {
          warnings.push(`Skipped missing room agent participant: ${sourceSlug}`);
          continue;
        }
        await participantRepo.addAgentParticipant({ conversationId: createdRoom.conversationId, agentId, createdBy: userId });
      }

      // Tool assignments (map source tool slug -> created tool slug -> tool id)
      const toolAssignments = Array.isArray(payload?.toolAssignments) ? (payload.toolAssignments as any[]) : [];
      if (toolAssignments.length > 0) {
        for (const ta of toolAssignments) {
          const sourceToolSlug = typeof ta?.toolSlug === 'string' ? ta.toolSlug.trim() : '';
          const permission = ta?.permission;
          if (!sourceToolSlug) continue;
          if (permission !== 'allow' && permission !== 'ask' && permission !== 'deny') continue;
          const destToolSlug = toolSlugMap.get(sourceToolSlug) ?? sourceToolSlug;
          const found = await toolRepo.findBySlugs([destToolSlug], starshipId);
          const tool = found?.[0] ?? null;
          if (!tool) {
            warnings.push(`Skipped missing room tool assignment: ${destToolSlug}`);
            continue;
          }
          await roomToolsRepo.upsert({ roomConversationId: createdRoom.conversationId, toolId: tool.id, permission });
        }
      }

      // Pins (views/datasets/task boards)
      const viewPins = Array.isArray(payload?.viewPins) ? (payload.viewPins as any[]) : [];
      for (const p of viewPins) {
        const sourceViewSlug = typeof p?.viewSlug === 'string' ? p.viewSlug.trim() : '';
        if (!sourceViewSlug) continue;
        const destSlug = viewSlugMap.get(sourceViewSlug) ?? sourceViewSlug;
        const view = await viewRepo.findBySlug(destSlug, starshipId);
        if (!view) {
          warnings.push(`Skipped missing pinned view: ${destSlug}`);
          continue;
        }
        await roomViewsRepo.upsert({
          roomConversationId: createdRoom.conversationId,
          viewId: view.id,
          position: typeof p?.position === 'number' ? p.position : undefined,
          createdBy: userId,
        });
      }

      const datasetPins = Array.isArray(payload?.datasetPins) ? (payload.datasetPins as any[]) : [];
      for (const p of datasetPins) {
        const sourceDatasetSlug = typeof p?.datasetSlug === 'string' ? p.datasetSlug.trim() : '';
        if (!sourceDatasetSlug) continue;
        const destSlug = datasetSlugMap.get(sourceDatasetSlug) ?? sourceDatasetSlug;
        const dataset = await datasetRepo.findBySlug(destSlug, starshipId);
        if (!dataset) {
          warnings.push(`Skipped missing pinned dataset: ${destSlug}`);
          continue;
        }
        await roomDatasetsRepo.upsert({
          roomConversationId: createdRoom.conversationId,
          datasetId: dataset.id,
          position: typeof p?.position === 'number' ? p.position : undefined,
          createdBy: userId,
        });
      }

      const taskBoardPins = Array.isArray(payload?.taskBoardPins) ? (payload.taskBoardPins as any[]) : [];
      for (const p of taskBoardPins) {
        const sourceBoardSlug = typeof p?.taskBoardSlug === 'string' ? p.taskBoardSlug.trim() : '';
        if (!sourceBoardSlug) continue;
        const destSlug = taskBoardSlugMap.get(sourceBoardSlug) ?? sourceBoardSlug;
        const board = await taskBoardRepo.findBySlug(destSlug, starshipId);
        if (!board) {
          warnings.push(`Skipped missing pinned task board: ${destSlug}`);
          continue;
        }
        await roomTaskBoardsRepo.upsert({
          roomConversationId: createdRoom.conversationId,
          boardId: board.id,
          position: typeof p?.position === 'number' ? p.position : undefined,
          createdBy: userId,
        });
      }

      imported.rooms += 1;
    }

    return { imported, warnings: warnings.length ? warnings : undefined };
  });

  return applyResult;
}

