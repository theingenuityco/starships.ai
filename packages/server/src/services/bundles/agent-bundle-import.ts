import { z } from 'zod';
import AdmZip from 'adm-zip';
import type { ImportExportContainerV1 } from '@starships/protocol';
import { AgentService } from '@/services/AgentService';
import { ImportExportService } from '@/services/ImportExportService';
import {
  AgentRepository,
  ToolRepository,
  computeAgentContentHash,
  computeToolContentHash,
  getConnection,
  PostgresConnection,
} from '@starships/models';

const ImportExportContainerSchemaV1 = z.object({
  schemaVersion: z.literal('1'),
  kind: z.enum(['agent', 'tool']),
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

const BUNDLE_ENTRY_PATH_ALLOWLIST = /^(agents|tools)\/[\w.-]+\.json$/;
function isAllowedBundlePath(file: unknown): file is string {
  return typeof file === 'string' && BUNDLE_ENTRY_PATH_ALLOWLIST.test(file);
}
function assertBundleManifestPathsOrThrow(manifest: z.infer<typeof ImportBundleManifestSchemaV1>): void {
  for (const t of manifest.entities.tools) {
    if (!isAllowedBundlePath(t.file) || !t.file.startsWith('tools/')) {
      throw new Error(`Invalid manifest path for tool entry: ${String(t.file)}`);
    }
  }
  for (const a of manifest.entities.agents) {
    if (!isAllowedBundlePath(a.file) || !a.file.startsWith('agents/')) {
      throw new Error(`Invalid manifest path for agent entry: ${String(a.file)}`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readContentHash(value: unknown): string | undefined {
  return typeof value === 'string' && value.length === 64 ? value : undefined;
}

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

function readAgentBundleManifestOrThrow(zip: AdmZip): z.infer<typeof ImportBundleManifestSchemaV1> {
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) throw new Error('Bundle is missing manifest.json');
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch {
    throw new Error('Bundle manifest.json is not valid JSON');
  }
  const parsed = ImportBundleManifestSchemaV1.safeParse(manifestRaw);
  if (!parsed.success) throw new Error('Bundle manifest.json has an unexpected shape');
  assertBundleManifestPathsOrThrow(parsed.data);
  return parsed.data;
}

export async function analyzeAgentBundleImport(args: {
  starshipId: string;
  zipBuffer: Buffer;
}): Promise<{
  tools: Array<{
    kind: 'tool';
    file: string;
    name: string;
    bundleHash: string;
    status: 'new' | 'same' | 'conflict';
    existing?: { id: string; name: string; slug: string; contentHash?: string };
  }>;
  agents: Array<{
    kind: 'agent';
    file: string;
    name: string;
    bundleHash: string;
    status: 'new' | 'same' | 'conflict';
    existing?: { id: string; name: string; slug: string; contentHash?: string };
  }>;
}> {
  const zip = parseZipOrThrow(args.zipBuffer);
  const manifest = readAgentBundleManifestOrThrow(zip);
  const ContainerSchema = ImportExportContainerSchemaV1;

  const toolRepo = new ToolRepository();
  const agentRepo = new AgentRepository();

  const existingTools = await toolRepo.findByStarship(args.starshipId);
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

  const existingAgents = await agentRepo.findByStarship(args.starshipId);
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

  const toolsAnalysis: Array<{
    kind: 'tool';
    file: string;
    name: string;
    bundleHash: string;
    status: 'new' | 'same' | 'conflict';
    existing?: { id: string; name: string; slug: string; contentHash?: string };
  }> = [];

  for (const t of manifest.entities.tools) {
    const entry = zip.getEntry(t.file);
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
      existing: existing
        ? { id: existing.id, name: existing.name, slug: existing.slug, contentHash: readContentHash((existing as any).contentHash) }
        : undefined,
    });
  }

  const agentsAnalysis: Array<{
    kind: 'agent';
    file: string;
    name: string;
    bundleHash: string;
    status: 'new' | 'same' | 'conflict';
    existing?: { id: string; name: string; slug: string; contentHash?: string };
  }> = [];

  for (const a of manifest.entities.agents) {
    const entry = zip.getEntry(a.file);
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
      existing: existing
        ? { id: existing.id, name: existing.name, slug: existing.slug, contentHash: readContentHash((existing as any).contentHash) }
        : undefined,
    });
  }

  return { tools: toolsAnalysis, agents: agentsAnalysis };
}

export async function applyAgentBundleImport(args: {
  starshipId: string;
  zipBuffer: Buffer;
  decisions: {
    tools: Record<string, { action: 'skip' | 'copy' | 'overwrite'; targetId?: string }>;
    agents: Record<string, { action: 'skip' | 'copy' | 'overwrite'; targetId?: string }>;
  };
}): Promise<{
  imported: { tools: number; agents: number };
  tools?: unknown[];
  agents?: unknown[];
  warnings?: string[];
}> {
  const zip = parseZipOrThrow(args.zipBuffer);
  const manifestParsed = readAgentBundleManifestOrThrow(zip);
  const ContainerSchema = ImportExportContainerSchemaV1;
  const conn = getConnection();

  const applyResult = await conn.transaction(async (client) => {
    const txConn = makeTransactionConnection(client);
    const toolRepo = new ToolRepository(txConn);
    const agentRepo = new AgentRepository(txConn);
    const agentService = new AgentService(txConn);
    const svc = new ImportExportService(txConn);

    const warnings: string[] = [];
    const importedTools: unknown[] = [];
    const importedAgents: unknown[] = [];
    const toolSlugMap = new Map<string, string>();

    const existingTools = await toolRepo.findByStarship(args.starshipId);
    const toolsByHash = new Map<string, (typeof existingTools)[number]>();
    const toolsByName = new Map<string, (typeof existingTools)[number]>();
    const indexTool = (t: (typeof existingTools)[number]) => {
      const nameKey = String(t.name || '').trim().toLowerCase();
      if (nameKey) toolsByName.set(nameKey, t);
      const hash = readContentHash((t as unknown as { contentHash?: unknown }).contentHash);
      if (hash) toolsByHash.set(hash, t);
    };
    for (const t of existingTools) indexTool(t);

    for (const t of manifestParsed.entities.tools) {
      const entry = zip.getEntry(t.file);
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

      const decision = args.decisions.tools[bundleHash] ?? { action: 'copy' as const };
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
        // Overwrite: use ToolRepository.update (shape matches main route implementation).
        const updated = await toolRepo.update(targetId, {
          name: typeof toolPayload?.name === 'string' ? toolPayload.name : undefined,
          description: typeof toolPayload?.description === 'string' ? toolPayload.description : '',
          parameters: toolPayload?.parameters as any,
          blueprint: toolPayload?.blueprint as any,
          transforms: toolPayload?.transforms as any,
          mutations: toolPayload?.mutations as any,
          condition: typeof toolPayload?.condition === 'string' ? toolPayload.condition : undefined,
          isEnabled: typeof toolPayload?.isEnabled === 'boolean' ? toolPayload.isEnabled : undefined,
          status: toolPayload?.status === 'draft' || toolPayload?.status === 'active' ? toolPayload.status : undefined,
        });
        if (updated) {
          importedTools.push(updated);
          indexTool(updated);
          if (sourceSlug) toolSlugMap.set(sourceSlug, updated.slug);
        }
        continue;
      }

      const result = await svc.importToStarship(args.starshipId, containerParsed.data as unknown as ImportExportContainerV1);
      if (result?.warnings?.length) warnings.push(...result.warnings);
      if (result?.kind === 'tool' && result.tool) {
        importedTools.push(result.tool);
        indexTool(result.tool as any);
        if (sourceSlug && (result.tool as any).slug) toolSlugMap.set(sourceSlug, (result.tool as any).slug);
      }
    }

    const existingAgents = await agentRepo.findByStarship(args.starshipId);
    const agentsByHash = new Map<string, (typeof existingAgents)[number]>();
    const agentsByName = new Map<string, (typeof existingAgents)[number]>();
    const indexAgent = (a: (typeof existingAgents)[number]) => {
      const nameKey = String(a.name || '').trim().toLowerCase();
      if (nameKey) agentsByName.set(nameKey, a);
      const hash = readContentHash((a as unknown as { contentHash?: unknown }).contentHash);
      if (hash) agentsByHash.set(hash, a);
    };
    for (const a of existingAgents) indexAgent(a);

    for (const a of manifestParsed.entities.agents) {
      const entry = zip.getEntry(a.file);
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

      const decision = args.decisions.agents[bundleHash] ?? { action: 'copy' as const };
      const agentNameKey = String(agentPayload?.name || '').trim().toLowerCase();
      const target =
        (decision.targetId ? existingAgents.find((x) => x.id === decision.targetId) : null) ?? (agentNameKey ? agentsByName.get(agentNameKey) : null);

      if (decision.action === 'skip') continue;

      if (decision.action === 'overwrite') {
        const targetId = decision.targetId || target?.id;
        if (!targetId) {
          warnings.push(`No overwrite target found for agent: ${String(agentPayload?.name || a.file)}`);
          continue;
        }
        const updated = await agentService.updateAgent(targetId, {
          name: typeof agentPayload?.name === 'string' ? agentPayload.name : undefined,
          role: typeof agentPayload?.role === 'string' ? agentPayload.role : undefined,
          description: typeof agentPayload?.description === 'string' ? agentPayload.description : undefined,
          model: typeof agentPayload?.model === 'string' ? agentPayload.model : undefined,
          temperature: typeof agentPayload?.temperature === 'number' ? agentPayload.temperature : undefined,
          maxTokens: typeof agentPayload?.maxTokens === 'number' ? agentPayload.maxTokens : undefined,
          timeout: typeof agentPayload?.timeout === 'number' ? agentPayload.timeout : undefined,
          reasoning: agentPayload?.reasoning as any,
          systemPrompt: typeof agentPayload?.systemPrompt === 'string' ? agentPayload.systemPrompt : undefined,
          state: agentPayload?.state as any,
          blueprint: agentPayload?.blueprint as any,
          category: typeof agentPayload?.category === 'string' ? (agentPayload.category as any) : undefined,
          previewPrompts: Array.isArray(agentPayload?.previewPrompts) ? (agentPayload.previewPrompts as any) : undefined,
        });
        if (updated) {
          try {
            await agentService.assignToolSlugs(targetId, rewrittenToolSlugs, args.starshipId);
          } catch (err) {
            warnings.push(`Agent tools partially applied for ${String(agentPayload?.name || targetId)}: ${String((err as any)?.message || err)}`);
          }
          importedAgents.push(updated);
          indexAgent(updated as any);
        }
        continue;
      }

      const basePayloadObj = isPlainObject(containerParsed.data.payload) ? containerParsed.data.payload : {};
      const rewrittenContainer: ImportExportContainerV1 = {
        ...(containerParsed.data as unknown as ImportExportContainerV1),
        payload: {
          ...basePayloadObj,
          assignedToolSlugs: rewrittenToolSlugs,
        } as unknown as ImportExportContainerV1['payload'],
      };

      const result = await svc.importToStarship(args.starshipId, rewrittenContainer);
      if (result?.warnings?.length) warnings.push(...result.warnings);
      if (result?.kind === 'agent' && result.agent) {
        importedAgents.push(result.agent);
        indexAgent(result.agent as any);
      }
    }

    return {
      imported: { tools: importedTools.length, agents: importedAgents.length },
      tools: importedTools.length ? importedTools : undefined,
      agents: importedAgents.length ? importedAgents : undefined,
      warnings: warnings.length ? warnings : undefined,
    };
  });

  return applyResult;
}

