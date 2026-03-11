/**
 * Starship management routes for Aether Core
 */

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { StarshipService } from '@/services/StarshipService';
import { rateLimiters } from '@/middleware/rateLimiter';
import { AgentService } from '@/services/AgentService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import { verifyResourceAccess, verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import type { StarshipModel, UpdateAgentRequest, UpdateToolRequest } from '@starships/protocol';
import type { AuthUser, ImportExportContainerV1 } from '@starships/protocol';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { ImportExportService } from '@/services/ImportExportService';
import { SubscriptionCheckoutService } from '@/services/SubscriptionCheckoutService';
import { SubscriptionManagementService } from '@/services/SubscriptionManagementService';
import {
  AgentRepository,
  ConversationRepository,
  ConversationParticipantRepository,
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
  getConnection,
} from '@starships/models';
import { getEnvConfig } from '@starships/env';
import Stripe from 'stripe';
import OpenAI from 'openai';
import multer from 'multer';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router: Router = Router();
const envConfig = getEnvConfig();
const stripe = new Stripe(envConfig.STRIPE_SECRET_KEY);
const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});
const openRouterClient =
  envConfig.OPENROUTER_API_KEY && envConfig.OPENROUTER_API_KEY.trim().length > 0
    ? new OpenAI({
        apiKey: envConfig.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://starships.ai',
          'X-Title': 'Starships.ai',
        },
      })
    : null;

const LEADGEN_ROOM_SLUG = 'leadgen';

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

// ----------------------------------------------------------------------------
// Room bundle manifest/container schema (rooms + resources)
// ----------------------------------------------------------------------------

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
    if (!isAllowedRoomBundlePath(t.file) || !t.file.startsWith('tools/'))
      throw new Error(`Invalid manifest path for tool entry: ${String(t.file)}`);
  }
  for (const a of manifest.entities.agents) {
    if (!isAllowedRoomBundlePath(a.file) || !a.file.startsWith('agents/'))
      throw new Error(`Invalid manifest path for agent entry: ${String(a.file)}`);
  }
  for (const r of manifest.entities.rooms) {
    if (!isAllowedRoomBundlePath(r.file) || !r.file.startsWith('rooms/'))
      throw new Error(`Invalid manifest path for room entry: ${String(r.file)}`);
  }
  for (const v of manifest.entities.views) {
    if (!isAllowedRoomBundlePath(v.file) || !v.file.startsWith('views/'))
      throw new Error(`Invalid manifest path for view entry: ${String(v.file)}`);
  }
  for (const d of manifest.entities.datasets) {
    if (!isAllowedRoomBundlePath(d.file) || !d.file.startsWith('datasets/'))
      throw new Error(`Invalid manifest path for dataset entry: ${String(d.file)}`);
  }
  for (const b of manifest.entities.taskBoards) {
    if (!isAllowedRoomBundlePath(b.file) || !b.file.startsWith('task-boards/'))
      throw new Error(`Invalid manifest path for task board entry: ${String(b.file)}`);
  }
}

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

const RoomBundleDecisionSchema = z.object({
  action: z.enum(['skip', 'copy', 'overwrite']),
  targetId: z.string().optional(),
});

const RoomBundleDecisionsSchema = z.object({
  rooms: z.record(z.string().min(1), RoomBundleDecisionSchema).default({}),
  views: z.record(z.string().min(1), RoomBundleDecisionSchema).default({}),
  datasets: z.record(z.string().min(1), RoomBundleDecisionSchema).default({}),
  taskBoards: z.record(z.string().min(1), RoomBundleDecisionSchema).default({}),
  tools: z.record(z.string().min(1), RoomBundleDecisionSchema).default({}),
  agents: z.record(z.string().min(1), RoomBundleDecisionSchema).default({}),
});

type RoomBundleDecisions = z.infer<typeof RoomBundleDecisionsSchema>;

function makeTransactionConnection(client: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
}): PostgresConnection {
  const txConn = {
    // Pool lifecycle is handled by the outer connection; no-op here.
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

async function applyRoomBundleToStarship(opts: {
  starshipId: string;
  userId: string;
  zip: AdmZip;
  manifest: z.infer<typeof ImportRoomBundleManifestSchemaV1>;
  decisions: RoomBundleDecisions;
  /**
   * Optional provenance tag to stamp on any rooms created by this bundle
   * application (e.g. "lead-generation"). This allows callers to later
   * identify bundle-provisioned rooms even if their slugs change.
   */
  provisionedByBundleTag?: string | null;
}): Promise<{
  imported: Record<string, number>;
  warnings?: string[];
}> {
  const { starshipId, userId, zip, manifest, decisions, provisionedByBundleTag } = opts;
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
      const nameKey = String(t.name || '')
        .trim()
        .toLowerCase();
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
      const toolNameKey = String(toolPayload?.name || '')
        .trim()
        .toLowerCase();
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
        if (sourceSlug && result.tool.slug) toolSlugMap.set(sourceSlug, result.tool.slug);
      }
    }

    // Index existing agents for skip/overwrite target discovery.
    const existingAgents = await agentRepo.findByStarship(starshipId);
    const agentsByName = new Map<string, (typeof existingAgents)[number]>();
    for (const a of existingAgents) {
      const nameKey = String(a.name || '')
        .trim()
        .toLowerCase();
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
      const agentNameKey = String(agentPayload?.name || '')
        .trim()
        .toLowerCase();
      const target =
        (decision.targetId ? existingAgents.find((x) => x.id === decision.targetId) : null) ??
        (agentNameKey ? agentsByName.get(agentNameKey) : null);

      // eslint-disable-next-line no-console
      console.debug('[leadgen] Agent bundle decision', {
        starshipId,
        fromSlug: sourceSlug,
        agentName: agentPayload?.name,
        decision: decision.action,
        hasExistingTarget: Boolean(target?.id),
      });

      if (decision.action === 'skip') {
        if (sourceSlug && target?.id) agentIdMap.set(sourceSlug, target.id);
        // eslint-disable-next-line no-console
        console.debug('[leadgen] Agent import skipped', {
          starshipId,
          fromSlug: sourceSlug,
          agentName: agentPayload?.name,
        });
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
            warnings.push(
              `Agent tools partially applied for ${String(agentPayload?.name || targetId)}: ${String((err as any)?.message || err)}`
            );
          }
          imported.agents += 1;
          if (sourceSlug) agentIdMap.set(sourceSlug, updated.id);
          // eslint-disable-next-line no-console
          console.debug('[leadgen] Agent overwritten from bundle', {
            starshipId,
            fromSlug: sourceSlug,
            agentName: agentPayload?.name,
            agentId: updated.id,
          });
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
          // eslint-disable-next-line no-console
          console.debug('[leadgen] Agent imported from bundle', {
            starshipId,
            fromSlug: sourceSlug,
            agentName: agentPayload?.name,
            agentId: result.agent.id,
          });
        }
      } catch (err) {
        const message = (err as any)?.message || String(err);
        warnings.push(`Agent import failed for ${String(agentPayload?.name || a.file)}: ${message}`);
        // eslint-disable-next-line no-console
        console.error('[leadgen] Agent import failed from bundle', {
          starshipId,
          fromSlug: sourceSlug,
          agentName: agentPayload?.name,
          error: message,
        });
        // Swallow agent import errors (e.g. agent limit reached) so that room provisioning can continue.
      }
    }

    // Views
    const existingViews = await viewRepo.findByStarshipId(starshipId);
    const viewsByHash = new Map<string, (typeof existingViews)[number]>();
    const viewsByName = new Map<string, (typeof existingViews)[number]>();
    for (const v of existingViews) {
      const nameKey = String(v.name || '')
        .trim()
        .toLowerCase();
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
      const bundleHash = computeBundleHash({
        name: viewPayload?.name,
        description: viewPayload?.description,
        root: viewPayload?.root,
        runtimeConfig: viewPayload?.runtimeConfig,
      });
      const decision = decisions.views[bundleHash] ?? { action: 'copy' as const };
      const viewNameKey = String(viewPayload?.name || '')
        .trim()
        .toLowerCase();
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
      const nameKey = String(d.name || '')
        .trim()
        .toLowerCase();
      if (nameKey) datasetsByName.set(nameKey, d);
      datasetsByHash.set(
        computeBundleHash({ name: d.name, description: d.description, columns: d.columns, primaryKey: d.primaryKey ?? null }),
        d
      );
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

      const bundleHash = computeBundleHash({
        name: datasetPayload?.name,
        description: datasetPayload?.description,
        columns: datasetPayload?.columns,
        primaryKey: datasetPayload?.primaryKey ?? null,
      });
      const decision = decisions.datasets[bundleHash] ?? { action: 'copy' as const };
      const datasetNameKey = String(datasetPayload?.name || '')
        .trim()
        .toLowerCase();
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
      const nameKey = String(b.name || '')
        .trim()
        .toLowerCase();
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
      const bundleHash = computeBundleHash({
        name: roomPayload?.name,
        isPrivate: roomPayload?.isPrivate,
        topic: roomPayload?.topic ?? null,
      });
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
        provisionedByBundle: provisionedByBundleTag ?? null,
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

    return {
      imported,
      warnings: warnings.length ? warnings : undefined,
    };
  });

  return applyResult;
}

function extractTextFromHtml(html: string): string {
  // Very lightweight extraction to avoid extra deps.
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readContentHash(value: unknown): string | undefined {
  return typeof value === 'string' && value.length === 64 ? value : undefined;
}

function resolvePublicDocsRoot(): string {
  const fromEnv = process.env.STARSHIPS_PUBLIC_DOCS_DIR;
  if (fromEnv && fs.existsSync(fromEnv) && fs.statSync(fromEnv).isDirectory()) {
    return fromEnv;
  }

  const candidates = [
    // When server is started from repo root
    path.resolve(process.cwd(), 'public-docs'),
    // When server cwd is packages/server (monorepo root up one or two levels)
    path.resolve(process.cwd(), '..', '..', 'public-docs'),
    path.resolve(process.cwd(), '..', 'public-docs'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }

  // Fallback to original default (will error later with clear message)
  return path.resolve(process.cwd(), 'public-docs');
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

function requireAuthUser(req: Request, res: Response): AuthUser | null {
  const user = req.user as AuthUser | null | undefined;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return user;
}

function requireInstanceAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
    sendError(res, 'FORBIDDEN', 'Only instance admins can import/export agents and tools', 403);
    return;
  }
  next();
}

// POST /starships - Create new starship (OpenAPI pattern)
router.post('/starships', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;
    const { name } = req.body;

    console.log('[STARSHIP-CREATE] Starting starship creation for user:', userId);

    // Validate required fields
    if (!name) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Missing required fields', 400, {
        required_fields: ['name'],
        provided: { name: !!name },
      });
      return;
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, {
        field: 'name',
      });
      return;
    }

    const starshipService = new StarshipService();

    // First workspace gets welcome credits (same as legacy ensure-default flow); invite-joiners never hit this.
    const existing = await starshipService.getStarshipsForUser(userId);
    const initialCredits = existing.length === 0 ? 200 : 0;

    console.log('[STARSHIP-CREATE] Creating starship in database...');
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: name.trim(),
      shipClass: 'scout',
      initialCredits,
    });
    console.log('[STARSHIP-CREATE] Starship created with ID:', starship.id);

    sendSuccess(res, starship, 201);
  } catch (error) {
    handleError(error, res, 'creating starship');
  }
});

/**
 * POST /starships/:id/subscribe
 * Starts a Stripe subscription checkout for a given Stripe Price ID.
 *
 * Plan definitions live in Stripe Price metadata (Option A).
 * Request body: { priceId: string }
 */
router.post('/starships/:id/subscribe', rateLimiters.financial, jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    const bodyValidation = validateData(
      z.object({
        priceId: z.string().min(1, 'priceId is required'),
      }),
      req.body,
      res,
      'subscription checkout'
    );
    if (!bodyValidation) return;
    const { priceId } = bodyValidation;

    const starshipService = new StarshipService();
    const hasAccess = await starshipService.hasOwnerAccess(userId, starshipId);
    if (!hasAccess) {
      sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
      return;
    }

    const service = new SubscriptionCheckoutService();
    const { checkoutUrl } = await service.createCheckoutSession({ userId, starshipId, priceId });
    sendSuccess(res, { checkoutUrl }, 201);
  } catch (error) {
    handleError(error, res, 'creating subscription checkout');
  }
});

/**
 * POST /starships/:id/subscription/change
 * Change the starship's subscription plan to the provided Stripe priceId.
 *
 * If no subscription exists yet, falls back to starting a Checkout Session (mode=subscription).
 */
router.post(
  '/starships/:id/subscription/change',
  rateLimiters.financial,
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const starshipId = req.params.id;
      const user = requireAuthUser(req, res);
      if (!user) return;
      const userId = user.id;

      const bodyValidation = validateData(
        z.object({
          priceId: z.string().min(1, 'priceId is required'),
        }),
        req.body,
        res,
        'subscription plan change'
      );
      if (!bodyValidation) return;
      const { priceId } = bodyValidation;

      const starshipService = new StarshipService();
      const hasAccess = await starshipService.hasOwnerAccess(userId, starshipId);
      if (!hasAccess) {
        sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
        return;
      }

      const svc = new SubscriptionManagementService();
      const result = await svc.changePlan({ userId, starshipId, priceId });
      sendSuccess(res, result, 200);
    } catch (error) {
      handleError(error, res, 'changing subscription plan');
    }
  }
);

/**
 * POST /starships/:id/subscription/cancel-downgrade
 * If a subscription is set to end at period end (pending downgrade-to-scout), undo that and keep it renewing.
 */
router.post(
  '/starships/:id/subscription/cancel-downgrade',
  rateLimiters.financial,
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const starshipId = req.params.id;
      const user = requireAuthUser(req, res);
      if (!user) return;
      const userId = user.id;

      const paramValidation = validateData(z.object({ id: IdSchema }), { id: starshipId }, res, 'cancel downgrade');
      if (!paramValidation) return;

      const starshipService = new StarshipService();
      const hasAccess = await starshipService.hasOwnerAccess(userId, starshipId);
      if (!hasAccess) {
        sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
        return;
      }

      const connection = getConnection();
      const row = await connection.queryOne<{ stripe_subscription_id: string }>(
        `SELECT stripe_subscription_id
           FROM starship_subscriptions
          WHERE starship_id = $1
            AND status NOT IN ('canceled')
          ORDER BY updated_at DESC
          LIMIT 1`,
        [starshipId]
      );

      if (!row?.stripe_subscription_id) {
        sendSuccess(res, { ok: true }, 200);
        return;
      }

      const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ['items.data'] });
      const scheduleId = typeof subscription.schedule === 'string' ? subscription.schedule : (subscription.schedule?.id ?? null);

      if (scheduleId) {
        // Detach schedule so we can update cancellation behavior on the subscription.
        await stripe.subscriptionSchedules.release(scheduleId);
      }

      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        proration_behavior: 'none',
        metadata: {
          ...(subscription.metadata || {}),
          pending_downgrade_to: '',
          requested_price_id: '',
        },
      });

      // Best-effort update local mirror.
      await connection.query(
        `UPDATE starship_subscriptions
            SET cancel_at_period_end = false,
                updated_at = NOW()
          WHERE starship_id = $1`,
        [starshipId]
      );

      sendSuccess(res, { ok: true }, 200);
    } catch (error) {
      handleError(error, res, 'cancelling downgrade');
    }
  }
);

/**
 * GET /starships/:id/subscription/status
 * Returns the starship's Stripe subscription renewal/cancellation state for billing UI.
 */
router.get(
  '/starships/:id/subscription/status',
  rateLimiters.apiAuthenticated,
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const starshipId = req.params.id;
      const user = requireAuthUser(req, res);
      if (!user) return;
      const userId = user.id;

      const paramValidation = validateData(z.object({ id: IdSchema }), { id: starshipId }, res, 'subscription status');
      if (!paramValidation) return;

      const starshipService = new StarshipService();
      const hasAccess = await starshipService.hasOwnerAccess(userId, starshipId);
      if (!hasAccess) {
        sendError(res, 'FORBIDDEN', 'Access denied to this starship', 403);
        return;
      }

      const connection = getConnection();
      const row = await connection.queryOne<{ stripe_subscription_id: string }>(
        `SELECT stripe_subscription_id
           FROM starship_subscriptions
          WHERE starship_id = $1
            AND status NOT IN ('canceled')
          ORDER BY updated_at DESC
          LIMIT 1`,
        [starshipId]
      );

      if (!row?.stripe_subscription_id) {
        sendSuccess(res, { subscriptionId: null, status: null, cancelAtPeriodEnd: false, renewAt: null }, 200);
        return;
      }

      const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id, { expand: ['items.data'] });
      // If the subscription is managed by a schedule, Stripe may block direct cancel_at_period_end updates.
      // In that case, interpret end_behavior=cancel as "cancel at period end" for UI purposes.
      const scheduleId =
        typeof (subscription as unknown as { schedule?: unknown }).schedule === 'string'
          ? ((subscription as unknown as { schedule?: string }).schedule as string)
          : ((subscription as unknown as { schedule?: { id: string } | null }).schedule?.id ?? null);
      const schedule = scheduleId ? await stripe.subscriptionSchedules.retrieve(scheduleId) : null;
      const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end) || Boolean(schedule && schedule.end_behavior === 'cancel');
      const status = subscription.status ?? null;

      const item0 = subscription.items?.data?.[0];
      const currentPeriodEndSeconds =
        (subscription as unknown as { current_period_end?: unknown }).current_period_end ??
        (item0 as unknown as { current_period_end?: unknown } | undefined)?.current_period_end ??
        null;
      const currentPeriodStartSeconds =
        (subscription as unknown as { current_period_start?: unknown }).current_period_start ??
        (item0 as unknown as { current_period_start?: unknown } | undefined)?.current_period_start ??
        null;

      const cpe = typeof currentPeriodEndSeconds === 'number' ? currentPeriodEndSeconds : null;
      const cps = typeof currentPeriodStartSeconds === 'number' ? currentPeriodStartSeconds : null;
      const renewAt = cpe ? new Date(cpe * 1000).toISOString() : null;

      // Best-effort cache into DB for other consumers.
      await connection.query(
        `UPDATE starship_subscriptions
            SET status = COALESCE($2, status),
                cancel_at_period_end = $3,
                current_period_start = COALESCE(to_timestamp($4::double precision), current_period_start),
                current_period_end = COALESCE(to_timestamp($5::double precision), current_period_end),
                updated_at = NOW()
          WHERE starship_id = $1`,
        [starshipId, status, cancelAtPeriodEnd, cps, cpe]
      );

      sendSuccess(res, { subscriptionId: subscription.id, status, cancelAtPeriodEnd, renewAt }, 200);
    } catch (error) {
      handleError(error, res, 'fetching subscription status');
    }
  }
);

// GET /starships/:id - Get specific starship (supports both ID and slug) (OpenAPI pattern)
router.get('/starships/:idOrSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { idOrSlug } = req.params;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    const starshipService = new StarshipService();
    // Try to find by ID first, then by slug
    const starship = await starshipService.getStarship(idOrSlug, userId);

    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: idOrSlug,
      });
      return;
    }

    // Check collaborator access (owner/admin/member)
    if (!(await starshipService.hasCollaboratorAccess(userId, starship.id))) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Return just the starship model
    // Note: For detailed agent info and available slots, use GET /starships/:id/agents endpoint
    sendSuccess(res, starship);
  } catch (error) {
    handleError(error, res, 'fetching starship');
  }
});

// POST /starships/:id/agents/:agentId - Deploy agent to starship (OpenAPI pattern)
router.post('/starships/:id/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, agentId } = req.params;

    // Validate IDs
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        agentId: IdSchema,
      }),
      { id: starshipId, agentId },
      res,
      'starship and agent parameters'
    );
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    const user = requireAuthUser(req, res);
    if (!user) return;
    if (starship.ownerId !== user.id) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Authorization: verify user owns the agent (or agent has no starship assigned)
    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);

    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: agentId,
      });
      return;
    }

    // If agent is already assigned to a starship, verify user owns that starship
    if (agent.starshipId) {
      if (!(await verifyResourceAccess(agent.starshipId, user.id, 'agent', agentId, res))) {
        return;
      }
    }

    // Deploy agent (service will verify agent exists)
    await starshipService.deployAgent(starshipId, agentId);

    sendSuccess(res, { message: 'Agent deployed successfully' }, 201);
  } catch (error) {
    console.error('Error deploying agent:', error);

    if (error instanceof Error) {
      if (error.message.includes('No available agent slots')) {
        sendError(res, 'OPERATION_NOT_ALLOWED', error.message, 400);
        return;
      }
      if (error.message.includes('already deployed')) {
        sendError(res, 'RESOURCE_CONFLICT', error.message, 409);
        return;
      }
    }

    handleError(error, res, 'deploying agent');
  }
});

// DELETE /starships/:id/agents/:agentId - Remove agent from starship (OpenAPI pattern)
router.delete('/starships/:id/agents/:agentId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId, agentId } = req.params;

    // Validate IDs
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        agentId: IdSchema,
      }),
      { id: starshipId, agentId },
      res,
      'starship and agent parameters'
    );
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    const user = requireAuthUser(req, res);
    if (!user) return;
    if (starship.ownerId !== user.id) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Remove agent
    const removed = await starshipService.removeAgent(starshipId, agentId);
    if (!removed) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not deployed on this starship', 404, {
        resource: 'deployed_agent',
        starshipId,
        agentId,
      });
      return;
    }

    // Return 204 No Content for successful deletion
    res.status(204).send();
  } catch (error) {
    handleError(error, res, 'removing agent');
  }
});

// PUT /starships/:id - Update starship (name, status, maxAgents) (OpenAPI pattern)
router.put('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;
    const { name, status, maxAgents, description, websiteUrl } = req.body;

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Validate allowed updates
    const allowedUpdates: Partial<StarshipModel> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        sendError(res, 'VALIDATION_ERROR', 'Name must be a non-empty string', 400, {
          field: 'name',
        });
        return;
      }
      const nextName = name.trim();
      // Only update name (and thus trigger slug regeneration) when the name actually changes.
      if (nextName !== starship.name) {
        allowedUpdates.name = nextName;
      }
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        sendError(res, 'INVALID_INPUT', 'Invalid status value', 400, {
          field: 'status',
          allowed_values: ['active', 'inactive'],
          provided: status,
        });
        return;
      }
      allowedUpdates.status = status;
    }

    if (maxAgents !== undefined) {
      if (typeof maxAgents !== 'number' || maxAgents < 1 || maxAgents > 50) {
        sendError(res, 'VALIDATION_ERROR', 'maxAgents must be a number between 1 and 50', 400, {
          field: 'maxAgents',
        });
        return;
      }

      // Check if there are deployed agents that exceed new maxAgents limits
      const deployedAgents = await starshipService.getDeployedAgents(starshipId);
      if (deployedAgents.length > maxAgents) {
        sendError(res, 'OPERATION_NOT_ALLOWED', 'Cannot reduce maxAgents below current deployed agent count', 400, {
          message: 'Current deployed agents exceed the new maxAgents limit',
          current_deployed: deployedAgents.length,
          new_max_agents: maxAgents,
        });
        return;
      }

      allowedUpdates.maxAgents = maxAgents;
    }

    if (description !== undefined) {
      if (description === null) {
        allowedUpdates.description = '';
      } else if (typeof description !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'description must be a string', 400, { field: 'description' });
        return;
      } else {
        const trimmed = description.trim();
        // Allow empty to clear.
        allowedUpdates.description = trimmed;
        if (trimmed.length > 2000) {
          sendError(res, 'VALIDATION_ERROR', 'description must be 2000 characters or less', 400, { field: 'description' });
          return;
        }
      }
    }

    if (websiteUrl !== undefined) {
      if (websiteUrl === null) {
        allowedUpdates.websiteUrl = '';
      } else if (typeof websiteUrl !== 'string') {
        sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be a string', 400, { field: 'websiteUrl' });
        return;
      } else {
        const trimmed = websiteUrl.trim();
        // Allow empty to clear.
        if (trimmed.length === 0) {
          allowedUpdates.websiteUrl = '';
        } else {
          if (trimmed.length > 2048) {
            sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be 2048 characters or less', 400, { field: 'websiteUrl' });
            return;
          }
          try {
            const u = new URL(trimmed);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') {
              sendError(res, 'VALIDATION_ERROR', 'websiteUrl must start with http:// or https://', 400, { field: 'websiteUrl' });
              return;
            }
          } catch {
            sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be a valid URL', 400, { field: 'websiteUrl' });
            return;
          }
          allowedUpdates.websiteUrl = trimmed;
        }
      }
    }

    if (Object.keys(allowedUpdates).length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'No valid updates provided', 400, {
        message: 'At least one valid field must be provided for update',
        allowed_fields: ['name', 'description', 'websiteUrl', 'status', 'maxAgents'],
      });
      return;
    }

    const updatedStarship = await starshipService.updateStarship(starshipId, allowedUpdates);
    if (!updatedStarship) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update starship in database');
      return;
    }

    sendSuccess(res, updatedStarship);
  } catch (error) {
    handleError(error, res, 'updating starship');
  }
});

/**
 * POST /starships/:id/generate-description-from-website
 *
 * Fetches the provided (or saved) website URL and uses an LLM to draft a long-form description.
 * This does NOT save the description; the client should call PUT /starships/:id to persist.
 */
router.post(
  '/starships/:id/generate-description-from-website',
  rateLimiters.apiAuthenticated,
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const starshipId = req.params.id;
      const user = requireAuthUser(req, res);
      if (!user) return;
      const userId = user.id;

      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      if (!openRouterClient) {
        sendError(res, 'CONFIGURATION_ERROR', 'OPENROUTER_API_KEY is not configured on server', 500);
        return;
      }

      const BodySchema = z.object({
        websiteUrl: z.string().trim().max(2048).optional(),
      });
      const body = validateData(BodySchema, req.body, res, 'generate description payload');
      if (!body) return;

      const starshipService = new StarshipService();
      const starship = await starshipService.getStarship(starshipId);
      if (!starship) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, { resource: 'starship', id: starshipId });
        return;
      }
      if (starship.ownerId !== userId) {
        sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
        return;
      }

      const url = (body.websiteUrl ?? starship.websiteUrl ?? '').trim();
      if (!url) {
        sendError(res, 'VALIDATION_ERROR', 'websiteUrl is required (either provide it or save it on the starship first)', 400, {
          field: 'websiteUrl',
        });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          sendError(res, 'VALIDATION_ERROR', 'websiteUrl must start with http:// or https://', 400, { field: 'websiteUrl' });
          return;
        }
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'websiteUrl must be a valid URL', 400, { field: 'websiteUrl' });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let html = '';
      try {
        const resp = await fetch(parsed.toString(), {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'starships.ai',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        html = await resp.text();
      } catch {
        sendError(res, 'NETWORK_ERROR', 'Failed to fetch website content', 400, { websiteUrl: parsed.toString() });
        return;
      } finally {
        clearTimeout(timeout);
      }

      const extracted = extractTextFromHtml(String(html || '')).slice(0, 40000);
      if (!extracted) {
        sendError(res, 'NETWORK_ERROR', 'Website content was empty or could not be parsed', 400, { websiteUrl: parsed.toString() });
        return;
      }

      const model = 'openai/gpt-5.2';
      const system = [
        'You write clear, accurate, professional company/project descriptions.',
        'Given a website URL and extracted website text, draft a description the user can paste into a product profile.',
        'Constraints:',
        '- Output plain text (no markdown headings).',
        '- HARD LIMIT: 2000 characters maximum (including spaces). Never exceed 2000 characters.',
        '- Focus on: what they do, who it is for, key features/capabilities, differentiators, and tone/voice matching the site.',
        '- Do not invent claims that are not supported by the text.',
      ].join('\n');

      const userPrompt = [
        `Website: ${parsed.toString()}`,
        '',
        'Extracted website text (may be truncated):',
        extracted,
        '',
        'Write the description now. Return only the description text.',
      ].join('\n');

      const MAX_CHARS = 2000;
      const generateOnce = async (extraUserInstruction?: string): Promise<string> => {
        const completion = await openRouterClient.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userPrompt + (extraUserInstruction ? `\n\n${extraUserInstruction}` : '') },
          ],
          temperature: 0.2,
          max_tokens: 800,
        });
        return String(completion.choices?.[0]?.message?.content ?? '').trim();
      };

      // First attempt.
      let description = await generateOnce();
      if (!description) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to generate description', 500);
        return;
      }

      // Retry once if the model violated the hard character limit.
      if (description.length > MAX_CHARS) {
        description = await generateOnce(
          `Your previous output was ${description.length} characters. Rewrite it to be ${MAX_CHARS} characters or fewer while preserving key details. Return only the description text.`
        );
      }

      if (!description) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to generate description', 500);
        return;
      }
      if (description.length > MAX_CHARS) {
        sendError(res, 'INTERNAL_SERVER_ERROR', `Generated description exceeded ${MAX_CHARS} characters`, 500, {
          maxChars: MAX_CHARS,
          actualChars: description.length,
        });
        return;
      }

      sendSuccess(res, { description }, 200);
    } catch (error) {
      handleError(error, res, 'generating starship description from website');
    }
  }
);

// DELETE /starships/:id - Cancel subscription first, then delete starship (OpenAPI pattern)
router.delete('/starships/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    console.log(`[STARSHIPS] Delete request for starship ${starshipId} by user ${userId}`);

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const starshipService = new StarshipService();

    // Verify starship exists and ownership
    const starship = await starshipService.getStarship(starshipId);
    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Delete starship directly - no subscription logic needed
    console.log(`[STARSHIPS] Deleting starship ${starshipId}`);
    const deleted = await starshipService.deleteStarship(starshipId);

    if (!deleted) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete starship', 500);
      return;
    }

    console.log(`[STARSHIPS] Successfully deleted starship ${starshipId}`);

    // Return success
    sendSuccess(res, {
      message: 'Starship deleted successfully',
      starshipId,
    });
  } catch (error) {
    handleError(error, res, 'deleting starship');
  }
});

// GET /starships/:id/agents - Get deployed agents for starship (collaborator access)
router.get('/starships/:id/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const starshipId = req.params.id;
    const user = requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    // Validate starship ID
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Authorization: collaborators can view deployed agents (needed for DM + conversation UI).
    const accessOk = await verifyStarshipAccess(starshipId, userId, res);
    if (!accessOk) return;

    const starshipService = new StarshipService();

    // Get deployed agents
    const deployedAgents = await starshipService.getDeployedAgents(starshipId);

    // NOTE: This endpoint returns an AgentModel[] directly (wrapped in ApiResponse),
    // because the client expects a list in many places.
    sendSuccess(res, deployedAgents);
  } catch (error) {
    handleError(error, res, 'fetching starship agents');
  }
});

/**
 * POST /starships/:id/import
 * Import a single agent or tool into the given starship using the shared JSON container schema.
 *
 * Instance-admin only.
 */
router.post(
  '/starships/:id/import',
  jwtAuthMiddleware,
  requireInstanceAdminMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      const bodyValidation = validateData(ImportExportContainerSchemaV1, req.body, res, 'import container');
      if (!bodyValidation) return;

      const svc = new ImportExportService();
      const result = await svc.importToStarship(paramValidation.id, bodyValidation as unknown as ImportExportContainerV1);
      sendSuccess(res, result, 201);
    } catch (error) {
      handleError(error, res, 'importing into starship');
    }
  }
);

/**
 * POST /starships/:id/import-bundle
 * Import a zipped agent bundle (manifest.json + agents/*.json + tools/*.json) into the given starship.
 *
 * Instance-admin only.
 */
router.post(
  '/starships/:id/import-bundle',
  jwtAuthMiddleware,
  requireInstanceAdminMiddleware,
  bundleUpload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      if (!req.file?.buffer) {
        sendError(res, 'VALIDATION_ERROR', 'No bundle file provided', 400);
        return;
      }

      let zip: AdmZip;
      try {
        zip = new AdmZip(req.file.buffer);
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Invalid zip bundle', 400);
        return;
      }

      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle is missing manifest.json', 400);
        return;
      }

      let manifestRaw: unknown;
      try {
        manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json is not valid JSON', 400);
        return;
      }

      const manifestParsed = ImportBundleManifestSchemaV1.safeParse(manifestRaw);
      if (!manifestParsed.success) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json has an unexpected shape', 400, {
          issues: manifestParsed.error.issues,
        });
        return;
      }

      try {
        assertBundleManifestPathsOrThrow(manifestParsed.data);
      } catch (err) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest contains invalid file paths', 400, {
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const starshipId = paramValidation.id;
      const conn = getConnection();

      const importResult = await conn.transaction(async (client) => {
        const txConn = makeTransactionConnection(client);
        const svc = new ImportExportService(txConn);

        const warnings: string[] = [];
        const importedTools: unknown[] = [];
        const importedAgents: unknown[] = [];
        const toolSlugMap = new Map<string, string>();

        // Import tools first so agent tool assignment can be remapped.
        for (const t of manifestParsed.data.entities.tools) {
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

          const containerParsed = ImportExportContainerSchemaV1.safeParse(containerRaw);
          if (!containerParsed.success || containerParsed.data.kind !== 'tool') {
            warnings.push(`Tool file is not a valid tool container: ${t.file}`);
            continue;
          }

          const result = await svc.importToStarship(starshipId, containerParsed.data as unknown as ImportExportContainerV1);
          if (result?.warnings?.length) warnings.push(...result.warnings);
          if (result?.kind === 'tool' && result.tool) {
            importedTools.push(result.tool);
            const fromSlug = containerParsed.data.metadata?.fromSlug;
            const createdSlug = result.tool?.slug;
            if (
              typeof fromSlug === 'string' &&
              fromSlug.trim().length > 0 &&
              typeof createdSlug === 'string' &&
              createdSlug.trim().length > 0
            ) {
              toolSlugMap.set(fromSlug, createdSlug);
            }
          }
        }

        for (const a of manifestParsed.data.entities.agents) {
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

          const containerParsed = ImportExportContainerSchemaV1.safeParse(containerRaw);
          if (!containerParsed.success || containerParsed.data.kind !== 'agent') {
            warnings.push(`Agent file is not a valid agent container: ${a.file}`);
            continue;
          }

          const payload = containerParsed.data.payload as unknown as { assignedToolSlugs?: unknown };
          const assignedToolSlugsRaw = Array.isArray(payload?.assignedToolSlugs) ? payload.assignedToolSlugs : [];
          const assignedToolSlugs = assignedToolSlugsRaw.filter((s: unknown) => typeof s === 'string' && s.trim().length > 0) as string[];
          const rewrittenToolSlugs = assignedToolSlugs.map((s) => toolSlugMap.get(s) ?? s);

          const basePayloadObj = isPlainObject(containerParsed.data.payload) ? containerParsed.data.payload : {};
          const rewrittenContainer: ImportExportContainerV1 = {
            ...(containerParsed.data as unknown as ImportExportContainerV1),
            payload: {
              ...basePayloadObj,
              assignedToolSlugs: rewrittenToolSlugs,
            } as unknown as ImportExportContainerV1['payload'],
          };

          const result = await svc.importToStarship(starshipId, rewrittenContainer);
          if (result?.warnings?.length) warnings.push(...result.warnings);
          if (result?.kind === 'agent' && result.agent) {
            importedAgents.push(result.agent);
          }
        }

        return {
          imported: { tools: importedTools.length, agents: importedAgents.length },
          tools: importedTools.length ? importedTools : undefined,
          agents: importedAgents.length ? importedAgents : undefined,
          warnings: warnings.length ? warnings : undefined,
        };
      });

      sendSuccess(res, importResult, 201);
    } catch (error) {
      handleError(error, res, 'importing bundle into starship');
    }
  }
);

/**
 * POST /starships/:id/import-bundle/analyze
 * Analyze a zipped agent bundle and return conflicts vs the destination starship.
 *
 * Instance-admin only.
 */
router.post(
  '/starships/:id/import-bundle/analyze',
  jwtAuthMiddleware,
  requireInstanceAdminMiddleware,
  bundleUpload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      if (!req.file?.buffer) {
        sendError(res, 'VALIDATION_ERROR', 'No bundle file provided', 400);
        return;
      }

      let zip: AdmZip;
      try {
        zip = new AdmZip(req.file.buffer);
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Invalid zip bundle', 400);
        return;
      }

      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle is missing manifest.json', 400);
        return;
      }

      let manifestRaw: unknown;
      try {
        manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json is not valid JSON', 400);
        return;
      }

      const manifestParsed = ImportBundleManifestSchemaV1.safeParse(manifestRaw);
      if (!manifestParsed.success) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json has an unexpected shape', 400, { issues: manifestParsed.error.issues });
        return;
      }
      try {
        assertBundleManifestPathsOrThrow(manifestParsed.data);
      } catch (err) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest contains invalid file paths', 400, {
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const ContainerSchema = ImportExportContainerSchemaV1;

      const starshipId = paramValidation.id;
      const toolRepo = new ToolRepository();
      const agentRepo = new AgentRepository();

      const existingTools = await toolRepo.findByStarship(starshipId);
      const existingToolsByHash = new Map<string, (typeof existingTools)[number]>();
      const existingToolsByName = new Map<string, (typeof existingTools)[number]>();
      for (const t of existingTools) {
        const nameKey = String(t.name || '')
          .trim()
          .toLowerCase();
        if (nameKey) existingToolsByName.set(nameKey, t);
        const storedHash = readContentHash((t as unknown as { contentHash?: unknown }).contentHash);
        if (storedHash) existingToolsByHash.set(storedHash, t);
        // Also index a freshly computed hash to remain robust if the hashing algorithm evolves.
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
        const nameKey = String(a.name || '')
          .trim()
          .toLowerCase();
        if (nameKey) existingAgentsByName.set(nameKey, a);
        const storedHash = readContentHash((a as unknown as { contentHash?: unknown }).contentHash);
        if (storedHash) existingAgentsByHash.set(storedHash, a);
        // Always index the freshly computed hash too (contentHash may be stale from older versions).
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

      for (const t of manifestParsed.data.entities.tools) {
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
            ? {
                id: existing.id,
                name: existing.name,
                slug: existing.slug,
                contentHash: readContentHash((existing as unknown as { contentHash?: unknown }).contentHash),
              }
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

      for (const a of manifestParsed.data.entities.agents) {
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
            ? {
                id: existing.id,
                name: existing.name,
                slug: existing.slug,
                contentHash: readContentHash((existing as unknown as { contentHash?: unknown }).contentHash),
              }
            : undefined,
        });
      }

      sendSuccess(res, { tools: toolsAnalysis, agents: agentsAnalysis });
    } catch (error) {
      handleError(error, res, 'analyzing bundle import conflicts');
    }
  }
);

/**
 * POST /starships/:id/import-bundle/apply
 * Apply a zipped agent bundle import using user-selected conflict strategies.
 *
 * Form-data:
 * - file: zip bundle
 * - decisions: JSON string
 *
 * Instance-admin only.
 */
router.post(
  '/starships/:id/import-bundle/apply',
  jwtAuthMiddleware,
  requireInstanceAdminMiddleware,
  bundleUpload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      const decisionsRaw = (req.body as any)?.decisions;
      if (typeof decisionsRaw !== 'string' || decisionsRaw.trim().length === 0) {
        sendError(res, 'VALIDATION_ERROR', 'Missing decisions', 400);
        return;
      }

      let decisionsJson: unknown;
      try {
        decisionsJson = JSON.parse(decisionsRaw);
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Decisions must be valid JSON', 400);
        return;
      }

      const DecisionSchema = z.object({
        action: z.enum(['skip', 'copy', 'overwrite']),
        targetId: z.string().optional(),
      });
      const DecisionsSchema = z.object({
        tools: z.record(z.string().min(1), DecisionSchema).default({}),
        agents: z.record(z.string().min(1), DecisionSchema).default({}),
      });
      const decisionsParsed = DecisionsSchema.safeParse(decisionsJson);
      if (!decisionsParsed.success) {
        sendError(res, 'VALIDATION_ERROR', 'Decisions have an unexpected shape', 400, { issues: decisionsParsed.error.issues });
        return;
      }

      if (!req.file?.buffer) {
        sendError(res, 'VALIDATION_ERROR', 'No bundle file provided', 400);
        return;
      }

      let zip: AdmZip;
      try {
        zip = new AdmZip(req.file.buffer);
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Invalid zip bundle', 400);
        return;
      }

      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle is missing manifest.json', 400);
        return;
      }

      let manifestRaw: unknown;
      try {
        manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json is not valid JSON', 400);
        return;
      }

      const manifestParsed = ImportBundleManifestSchemaV1.safeParse(manifestRaw);
      if (!manifestParsed.success) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json has an unexpected shape', 400, { issues: manifestParsed.error.issues });
        return;
      }
      try {
        assertBundleManifestPathsOrThrow(manifestParsed.data);
      } catch (err) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest contains invalid file paths', 400, {
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const ContainerSchema = ImportExportContainerSchemaV1;

      const starshipId = paramValidation.id;
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

        // Snapshot + index existing tools once (update maps as we create/overwrite).
        const existingTools = await toolRepo.findByStarship(starshipId);
        const toolsByHash = new Map<string, (typeof existingTools)[number]>();
        const toolsByName = new Map<string, (typeof existingTools)[number]>();
        const indexTool = (t: (typeof existingTools)[number]) => {
          const nameKey = String(t.name || '')
            .trim()
            .toLowerCase();
          if (nameKey) toolsByName.set(nameKey, t);
          const hash = readContentHash((t as unknown as { contentHash?: unknown }).contentHash);
          if (hash) toolsByHash.set(hash, t);
        };
        for (const t of existingTools) indexTool(t);

        // Tools first
        for (const t of manifestParsed.data.entities.tools) {
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

          const decision = decisionsParsed.data.tools[bundleHash] ?? { action: 'copy' as const };
          const toolNameKey = String(toolPayload?.name || '')
            .trim()
            .toLowerCase();

          const existingByHash = toolsByHash.get(bundleHash);
          const existingByName = toolNameKey ? toolsByName.get(toolNameKey) : undefined;
          const target = existingByHash ?? existingByName ?? null;

          if (decision.action === 'skip') {
            if (typeof fromSlug === 'string' && fromSlug.trim().length > 0 && target?.slug) {
              toolSlugMap.set(fromSlug, target.slug);
            }
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
              importedTools.push(updated);
              indexTool(updated);
              if (typeof fromSlug === 'string' && fromSlug.trim().length > 0) toolSlugMap.set(fromSlug, updated.slug);
            }
            continue;
          }

          // copy (default)
          const result = await svc.importToStarship(starshipId, containerParsed.data as unknown as ImportExportContainerV1);
          if (result?.warnings?.length) warnings.push(...result.warnings);
          if (result?.kind === 'tool' && result.tool) {
            importedTools.push(result.tool);
            indexTool(result.tool);
            const createdSlug = result.tool?.slug;
            if (
              typeof fromSlug === 'string' &&
              fromSlug.trim().length > 0 &&
              typeof createdSlug === 'string' &&
              createdSlug.trim().length > 0
            ) {
              toolSlugMap.set(fromSlug, createdSlug);
            }
          }
        }

        // Snapshot + index existing agents once (update maps as we create/overwrite).
        const existingAgents = await agentRepo.findByStarship(starshipId);
        const agentsByHash = new Map<string, (typeof existingAgents)[number]>();
        const agentsByName = new Map<string, (typeof existingAgents)[number]>();
        const indexAgent = (a: (typeof existingAgents)[number]) => {
          const nameKey = String(a.name || '')
            .trim()
            .toLowerCase();
          if (nameKey) agentsByName.set(nameKey, a);
          const hash = readContentHash((a as unknown as { contentHash?: unknown }).contentHash);
          if (hash) agentsByHash.set(hash, a);
        };
        for (const a of existingAgents) indexAgent(a);

        // Agents
        for (const a of manifestParsed.data.entities.agents) {
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

          const payload = containerParsed.data.payload as unknown as {
            agent?: Record<string, unknown>;
            assignedToolSlugs?: unknown;
          };
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

          const decision = decisionsParsed.data.agents[bundleHash] ?? { action: 'copy' as const };
          const agentNameKey = String(agentPayload?.name || '')
            .trim()
            .toLowerCase();

          const existingByHash = agentsByHash.get(bundleHash);
          const existingByName = agentNameKey ? agentsByName.get(agentNameKey) : undefined;
          const target = existingByHash ?? existingByName ?? null;

          if (decision.action === 'skip') {
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
                warnings.push(
                  `Agent tools partially applied for ${String(agentPayload?.name || targetId)}: ${String((err as any)?.message || err)}`
                );
              }
              importedAgents.push(updated);
              indexAgent(updated);
            }
            continue;
          }

          // copy (default)
          const basePayloadObj = isPlainObject(containerParsed.data.payload) ? containerParsed.data.payload : {};
          const rewrittenContainer = {
            ...(containerParsed.data as unknown as ImportExportContainerV1),
            payload: {
              ...basePayloadObj,
              assignedToolSlugs: rewrittenToolSlugs,
            },
          } as unknown as ImportExportContainerV1;

          const result = await svc.importToStarship(starshipId, rewrittenContainer);
          if (result?.warnings?.length) warnings.push(...result.warnings);
          if (result?.kind === 'agent' && result.agent) {
            importedAgents.push(result.agent);
            indexAgent(result.agent);
          }
        }

        return {
          imported: { tools: importedTools.length, agents: importedAgents.length },
          tools: importedTools.length ? importedTools : undefined,
          agents: importedAgents.length ? importedAgents : undefined,
          warnings: warnings.length ? warnings : undefined,
        };
      });

      sendSuccess(res, applyResult, 201);
    } catch (error) {
      handleError(error, res, 'applying bundle import');
    }
  }
);

/**
 * POST /starships/:id/import-room-bundle/analyze
 *
 * Analyze a room bundle (room + resources + agents/tools) and return conflicts vs the destination starship.
 *
 * Starship owner / instance-admin only.
 */
router.post(
  '/starships/:id/import-room-bundle/analyze',
  jwtAuthMiddleware,
  bundleUpload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      const user = requireAuthUser(req, res);
      if (!user) return;
      if (!(await verifyStarshipOwnerAccess(paramValidation.id, user.id, res))) return;

      if (!req.file?.buffer) {
        sendError(res, 'VALIDATION_ERROR', 'No bundle file provided', 400);
        return;
      }

      let zip: AdmZip;
      try {
        zip = new AdmZip(req.file.buffer);
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Invalid zip bundle', 400);
        return;
      }

      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle is missing manifest.json', 400);
        return;
      }

      let manifestRaw: unknown;
      try {
        manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json is not valid JSON', 400);
        return;
      }

      const manifestParsed = ImportRoomBundleManifestSchemaV1.safeParse(manifestRaw);
      if (!manifestParsed.success) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json has an unexpected shape', 400, { issues: manifestParsed.error.issues });
        return;
      }
      try {
        assertRoomBundleManifestPathsOrThrow(manifestParsed.data);
      } catch (err) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest contains invalid file paths', 400, {
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const ContainerSchema = ImportExportContainerSchemaV1RoomBundle;
      const starshipId = paramValidation.id;

      // Existing tools/agents use the same hashing logic as agent bundle import.
      const toolRepo = new ToolRepository();
      const agentRepo = new AgentRepository();
      const existingTools = await toolRepo.findByStarship(starshipId);
      const existingToolsByHash = new Map<string, (typeof existingTools)[number]>();
      const existingToolsByName = new Map<string, (typeof existingTools)[number]>();
      for (const t of existingTools) {
        const nameKey = String(t.name || '')
          .trim()
          .toLowerCase();
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
        const nameKey = String(a.name || '')
          .trim()
          .toLowerCase();
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
        const nameKey = String(v.name || '')
          .trim()
          .toLowerCase();
        if (nameKey) existingViewsByName.set(nameKey, v);
        const h = computeBundleHash({ name: v.name, description: v.description, root: v.root, runtimeConfig: v.runtimeConfig });
        existingViewsByHash.set(h, v);
      }

      const existingDatasets = await datasetRepo.listByStarship(starshipId, { includeArchived: true });
      const existingDatasetsByHash = new Map<string, (typeof existingDatasets)[number]>();
      const existingDatasetsByName = new Map<string, (typeof existingDatasets)[number]>();
      for (const d of existingDatasets) {
        const nameKey = String(d.name || '')
          .trim()
          .toLowerCase();
        if (nameKey) existingDatasetsByName.set(nameKey, d);
        const h = computeBundleHash({
          name: d.name,
          description: d.description,
          columns: d.columns,
          primaryKey: d.primaryKey ?? null,
        });
        existingDatasetsByHash.set(h, d);
      }

      const existingBoards = await taskBoardRepo.listByStarship(starshipId, { includeArchived: true });
      const existingBoardsByHash = new Map<string, (typeof existingBoards)[number]>();
      const existingBoardsByName = new Map<string, (typeof existingBoards)[number]>();
      for (const b of existingBoards) {
        const nameKey = String(b.name || '')
          .trim()
          .toLowerCase();
        if (nameKey) existingBoardsByName.set(nameKey, b);
        const h = computeBundleHash({ name: b.name, description: b.description });
        existingBoardsByHash.set(h, b);
      }

      const existingRooms = await roomRepo.listByStarship(starshipId);
      const existingRoomsByHash = new Map<string, (typeof existingRooms)[number]>();
      const existingRoomsByName = new Map<string, (typeof existingRooms)[number]>();
      for (const r of existingRooms) {
        const nameKey = String(r.name || '')
          .trim()
          .toLowerCase();
        if (nameKey) existingRoomsByName.set(nameKey, r);
        const h = computeBundleHash({ name: r.name, isPrivate: r.isPrivate, topic: r.topic ?? null });
        existingRoomsByHash.set(h, r);
      }

      const toolsAnalysis: Array<{
        kind: 'tool';
        file: string;
        name: string;
        bundleHash: string;
        status: 'new' | 'same' | 'conflict';
        existing?: { id: string; name: string; slug: string; contentHash?: string };
      }> = [];
      for (const t of manifestParsed.data.entities.tools) {
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
            ? {
                id: existing.id,
                name: existing.name,
                slug: existing.slug,
                contentHash: readContentHash((existing as unknown as { contentHash?: unknown }).contentHash),
              }
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
      for (const a of manifestParsed.data.entities.agents) {
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
            ? {
                id: existing.id,
                name: existing.name,
                slug: existing.slug,
                contentHash: readContentHash((existing as unknown as { contentHash?: unknown }).contentHash),
              }
            : undefined,
        });
      }

      const viewsAnalysis: Array<{
        kind: 'view';
        file: string;
        name: string;
        bundleHash: string;
        status: 'new' | 'same' | 'conflict';
        existing?: { id: string; name: string; slug: string };
      }> = [];
      for (const v of manifestParsed.data.entities.views) {
        const entry = zip.getEntry(v.file);
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
        const bundleHash = computeBundleHash({
          name: viewPayload?.name,
          description: viewPayload?.description,
          root: viewPayload?.root,
          runtimeConfig: viewPayload?.runtimeConfig,
        });
        const existingByHash = existingViewsByHash.get(bundleHash);
        const existingByName = name ? existingViewsByName.get(name.toLowerCase()) : undefined;
        const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
        const existing = existingByHash ?? existingByName;
        viewsAnalysis.push({
          kind: 'view',
          file: v.file,
          name: name || '(unnamed view)',
          bundleHash,
          status,
          existing: existing ? { id: existing.id, name: existing.name, slug: existing.slug } : undefined,
        });
      }

      const datasetsAnalysis: Array<{
        kind: 'dataset';
        file: string;
        name: string;
        bundleHash: string;
        status: 'new' | 'same' | 'conflict';
        existing?: { id: string; name: string; slug: string };
      }> = [];
      for (const d of manifestParsed.data.entities.datasets) {
        const entry = zip.getEntry(d.file);
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
        const bundleHash = computeBundleHash({
          name: datasetPayload?.name,
          description: datasetPayload?.description,
          columns: datasetPayload?.columns,
          primaryKey: datasetPayload?.primaryKey ?? null,
        });
        const existingByHash = existingDatasetsByHash.get(bundleHash);
        const existingByName = name ? existingDatasetsByName.get(name.toLowerCase()) : undefined;
        const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
        const existing = existingByHash ?? existingByName;
        datasetsAnalysis.push({
          kind: 'dataset',
          file: d.file,
          name: name || '(unnamed dataset)',
          bundleHash,
          status,
          existing: existing ? { id: existing.id, name: existing.name, slug: existing.slug } : undefined,
        });
      }

      const taskBoardsAnalysis: Array<{
        kind: 'task_board';
        file: string;
        name: string;
        bundleHash: string;
        status: 'new' | 'same' | 'conflict';
        existing?: { id: string; name: string; slug: string };
      }> = [];
      for (const b of manifestParsed.data.entities.taskBoards) {
        const entry = zip.getEntry(b.file);
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
        taskBoardsAnalysis.push({
          kind: 'task_board',
          file: b.file,
          name: name || '(unnamed task board)',
          bundleHash,
          status,
          existing: existing ? { id: existing.id, name: existing.name, slug: existing.slug } : undefined,
        });
      }

      const roomsAnalysis: Array<{
        kind: 'room';
        file: string;
        name: string;
        bundleHash: string;
        status: 'new' | 'same' | 'conflict';
        existing?: { conversationId: string; name: string; slug: string };
      }> = [];
      for (const r of manifestParsed.data.entities.rooms) {
        const entry = zip.getEntry(r.file);
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
        const bundleHash = computeBundleHash({
          name: roomPayload?.name,
          isPrivate: roomPayload?.isPrivate,
          topic: roomPayload?.topic ?? null,
        });
        const existingByHash = existingRoomsByHash.get(bundleHash);
        const existingByName = name ? existingRoomsByName.get(name.toLowerCase()) : undefined;
        const existing = existingByHash ?? existingByName;
        const status: 'new' | 'same' | 'conflict' = existingByHash ? 'same' : existingByName ? 'conflict' : 'new';
        roomsAnalysis.push({
          kind: 'room',
          file: r.file,
          name: name || '(unnamed room)',
          bundleHash,
          status,
          existing: existing ? { conversationId: existing.conversationId, name: existing.name, slug: existing.slug } : undefined,
        });
      }

      sendSuccess(res, {
        rooms: roomsAnalysis,
        views: viewsAnalysis,
        datasets: datasetsAnalysis,
        taskBoards: taskBoardsAnalysis,
        tools: toolsAnalysis,
        agents: agentsAnalysis,
      });
    } catch (error) {
      handleError(error, res, 'analyzing room bundle import conflicts');
    }
  }
);

/**
 * POST /starships/:id/ensure-leadgen-room
 *
 * Ensure that the lead generation room bundle is applied for the given starship and return the room.
 * This is used by the lead-generation landing flow to provision a dedicated workspace.
 *
 * Starship owner / instance-admin only (same access model as generic bundle import).
 */
router.post('/starships/:id/ensure-leadgen-room', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const user = requireAuthUser(req, res);
    if (!user) return;
    if (!(await verifyStarshipOwnerAccess(paramValidation.id, user.id, res))) return;

    const roomRepo = new RoomRepository();
    const starshipId = paramValidation.id;

    // If a leadgen bundle-provisioned room already exists for this starship, reuse it,
    // regardless of its slug. This prevents collisions with user-created rooms that
    // happen to use the same slug.
    const existingRoom = await roomRepo.findLeadGenBundleRoom(starshipId);
    if (existingRoom) {
      // Best-effort: ensure caller is a participant.
      try {
        const participantRepo = new ConversationParticipantRepository();
        await participantRepo.addUserParticipant({
          conversationId: existingRoom.conversationId,
          userId: user.id,
          role: 'admin',
          createdBy: user.id,
        });
      } catch {
        // Ignore if already a participant or if a constraint is hit.
      }

      // Best-effort: ensure all leadgen bundle agents are already room participants so that
      // mentions like <@a:nora> do not trigger an "Add to room" approval banner.
      try {
        const agentRepo = new AgentRepository();
        const participantRepo = new ConversationParticipantRepository();
        const leadgenAgentSlugs = ['atlas', 'vera', 'hunter', 'mira', 'nora'];
        for (const slug of leadgenAgentSlugs) {
          const agent = await agentRepo.findBySlugAndStarship(slug, starshipId).catch(() => null);
          if (!agent?.id) continue;
          try {
            await participantRepo.addAgentParticipant({
              conversationId: existingRoom.conversationId,
              agentId: agent.id,
              createdBy: user.id,
            });
          } catch {
            // Ignore if agent is already a participant or if a constraint is hit.
          }
        }
      } catch {
        // Best-effort only; if this fails we still return the room.
      }

      // eslint-disable-next-line no-console
      console.debug('[leadgen] Reusing existing leadgen room', {
        starshipId,
        roomSlug: existingRoom.slug,
        conversationId: existingRoom.conversationId,
      });

      sendSuccess(res, { room: existingRoom });
      return;
    }

    // No existing room; apply the lead-generation bundle from disk.
    const docsRoot = resolvePublicDocsRoot();
    const zipPath = path.join(docsRoot, 'room-bundles', 'lead-generation.zip');
    if (!fs.existsSync(zipPath)) {
      // eslint-disable-next-line no-console
      console.error('[leadgen] Bundle zip not found', { docsRoot, zipPath });
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Lead generation room bundle is not available on the server', 500);
      return;
    }

    let zip: AdmZip;
    try {
      const buffer = fs.readFileSync(zipPath);
      zip = new AdmZip(buffer);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[leadgen] Failed to read lead-generation bundle', { zipPath, error: (err as Error)?.message });
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to read lead generation room bundle', 500);
      return;
    }

    let manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      // Some bundles may be zipped with a top-level folder (e.g. "lead-generation/manifest.json").
      const entries = zip.getEntries();
      const alt = entries.find((e) => e.entryName.toLowerCase().endsWith('/manifest.json'));
      if (alt) {
        manifestEntry = alt;
      }
    }
    if (!manifestEntry) {
      // eslint-disable-next-line no-console
      console.error('[leadgen] manifest.json missing from bundle', {
        zipPath,
        entries: zip.getEntries().map((e) => e.entryName),
      });
      sendError(res, 'VALIDATION_ERROR', 'Lead generation room bundle is missing manifest.json', 500);
      return;
    }

    let manifestRaw: unknown;
    try {
      manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
    } catch {
      // eslint-disable-next-line no-console
      console.error('[leadgen] manifest.json is not valid JSON', { zipPath });
      sendError(res, 'VALIDATION_ERROR', 'Lead generation room bundle manifest.json is not valid JSON', 500);
      return;
    }

    const manifestParsed = ImportRoomBundleManifestSchemaV1.safeParse(manifestRaw);
    if (!manifestParsed.success) {
      // eslint-disable-next-line no-console
      console.error('[leadgen] manifest.json shape is invalid', {
        zipPath,
        issues: manifestParsed.error.issues,
      });
      sendError(res, 'VALIDATION_ERROR', 'Lead generation room bundle manifest.json has an unexpected shape', 500, {
        issues: manifestParsed.error.issues,
      });
      return;
    }

    try {
      assertRoomBundleManifestPathsOrThrow(manifestParsed.data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[leadgen] manifest.json contains invalid file paths', {
        zipPath,
        error: err instanceof Error ? err.message : String(err),
      });
      sendError(res, 'VALIDATION_ERROR', 'Lead generation room bundle manifest contains invalid file paths', 500, {
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const emptyDecisions: RoomBundleDecisions = {
      rooms: {},
      views: {},
      datasets: {},
      taskBoards: {},
      tools: {},
      agents: {},
    };

    const importSummary = await applyRoomBundleToStarship({
      starshipId,
      userId: user.id,
      zip,
      manifest: manifestParsed.data,
      decisions: emptyDecisions,
      provisionedByBundleTag: 'lead-generation',
    });

    const createdRoom = await roomRepo.findLeadGenBundleRoom(starshipId);
    if (!createdRoom) {
      // eslint-disable-next-line no-console
      console.error('[leadgen] Leadgen room not found after import', {
        starshipId,
        imported: importSummary.imported,
      });
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Lead generation room was not created from bundle', 500, {
        imported: importSummary.imported,
      });
      return;
    }

    // Best-effort: ensure all leadgen bundle agents are added as room participants for the
    // newly created room so user messages mentioning them do not require manual approval.
    try {
      const agentRepo = new AgentRepository();
      const participantRepo = new ConversationParticipantRepository();
      const leadgenAgentSlugs = ['atlas', 'vera', 'hunter', 'mira', 'nora'];
      for (const slug of leadgenAgentSlugs) {
        const agent = await agentRepo.findBySlugAndStarship(slug, starshipId).catch(() => null);
        if (!agent?.id) continue;
        try {
          await participantRepo.addAgentParticipant({
            conversationId: createdRoom.conversationId,
            agentId: agent.id,
            createdBy: user.id,
          });
        } catch {
          // Ignore if agent is already a participant or if a constraint is hit.
        }
      }
    } catch {
      // Best-effort only; room provisioning should still succeed even if this step fails.
    }

    // eslint-disable-next-line no-console
    console.debug('[leadgen] Leadgen room created from bundle', {
      starshipId,
      roomSlug: createdRoom.slug,
      conversationId: createdRoom.conversationId,
      imported: importSummary.imported,
    });

    sendSuccess(res, { room: createdRoom, importSummary });
  } catch (error) {
    handleError(error, res, 'ensuring leadgen room for starship');
  }
});

/**
 * POST /starships/:id/import-room-bundle/apply
 *
 * Apply a room bundle import using user-selected conflict strategies.
 *
 * Starship owner / instance-admin only.
 */
router.post(
  '/starships/:id/import-room-bundle/apply',
  jwtAuthMiddleware,
  bundleUpload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      const user = requireAuthUser(req, res);
      if (!user) return;
      if (!(await verifyStarshipOwnerAccess(paramValidation.id, user.id, res))) return;

      const decisionsRaw = (req.body as any)?.decisions;
      if (typeof decisionsRaw !== 'string' || decisionsRaw.trim().length === 0) {
        sendError(res, 'VALIDATION_ERROR', 'Missing decisions', 400);
        return;
      }
      let decisionsJson: unknown;
      try {
        decisionsJson = JSON.parse(decisionsRaw);
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Decisions must be valid JSON', 400);
        return;
      }

      const DecisionSchema = z.object({
        action: z.enum(['skip', 'copy', 'overwrite']),
        targetId: z.string().optional(),
      });
      const DecisionsSchema = z.object({
        rooms: z.record(z.string().min(1), DecisionSchema).default({}),
        views: z.record(z.string().min(1), DecisionSchema).default({}),
        datasets: z.record(z.string().min(1), DecisionSchema).default({}),
        taskBoards: z.record(z.string().min(1), DecisionSchema).default({}),
        tools: z.record(z.string().min(1), DecisionSchema).default({}),
        agents: z.record(z.string().min(1), DecisionSchema).default({}),
      });
      const decisionsParsed = DecisionsSchema.safeParse(decisionsJson);
      if (!decisionsParsed.success) {
        sendError(res, 'VALIDATION_ERROR', 'Decisions have an unexpected shape', 400, { issues: decisionsParsed.error.issues });
        return;
      }

      if (!req.file?.buffer) {
        sendError(res, 'VALIDATION_ERROR', 'No bundle file provided', 400);
        return;
      }

      let zip: AdmZip;
      try {
        zip = new AdmZip(req.file.buffer);
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Invalid zip bundle', 400);
        return;
      }

      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle is missing manifest.json', 400);
        return;
      }

      let manifestRaw: unknown;
      try {
        manifestRaw = JSON.parse(manifestEntry.getData().toString('utf8'));
      } catch {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json is not valid JSON', 400);
        return;
      }

      const manifestParsed = ImportRoomBundleManifestSchemaV1.safeParse(manifestRaw);
      if (!manifestParsed.success) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest.json has an unexpected shape', 400, { issues: manifestParsed.error.issues });
        return;
      }
      try {
        assertRoomBundleManifestPathsOrThrow(manifestParsed.data);
      } catch (err) {
        sendError(res, 'VALIDATION_ERROR', 'Bundle manifest contains invalid file paths', 400, {
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const ContainerSchema = ImportExportContainerSchemaV1RoomBundle;
      const starshipId = paramValidation.id;
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
          const nameKey = String(t.name || '')
            .trim()
            .toLowerCase();
          if (nameKey) toolsByName.set(nameKey, t);
          const hash = readContentHash((t as unknown as { contentHash?: unknown }).contentHash);
          if (hash) toolsByHash.set(hash, t);
        };
        for (const t of existingTools) indexTool(t);

        // Tools first (same semantics as agent bundle import)
        for (const t of manifestParsed.data.entities.tools) {
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

          const decision = decisionsParsed.data.tools[bundleHash] ?? { action: 'copy' as const };
          const toolNameKey = String(toolPayload?.name || '')
            .trim()
            .toLowerCase();
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
            if (sourceSlug && result.tool.slug) toolSlugMap.set(sourceSlug, result.tool.slug);
          }
        }

        // Index existing agents for skip/overwrite target discovery.
        const existingAgents = await agentRepo.findByStarship(starshipId);
        const agentsByName = new Map<string, (typeof existingAgents)[number]>();
        for (const a of existingAgents) {
          const nameKey = String(a.name || '')
            .trim()
            .toLowerCase();
          if (nameKey) agentsByName.set(nameKey, a);
        }

        // Agents (rewrite assigned tool slugs using toolSlugMap, and create agentIdMap).
        for (const a of manifestParsed.data.entities.agents) {
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

          const decision = decisionsParsed.data.agents[bundleHash] ?? { action: 'copy' as const };
          const agentNameKey = String(agentPayload?.name || '')
            .trim()
            .toLowerCase();
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
                warnings.push(
                  `Agent tools partially applied for ${String(agentPayload?.name || targetId)}: ${String((err as any)?.message || err)}`
                );
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
          const result = await svc.importToStarship(starshipId, rewrittenContainer);
          if (result?.warnings?.length) warnings.push(...result.warnings);
          if (result?.kind === 'agent' && result.agent) {
            imported.agents += 1;
            if (sourceSlug) agentIdMap.set(sourceSlug, result.agent.id);
          }
        }

        // Views
        const existingViews = await viewRepo.findByStarshipId(starshipId);
        const viewsByHash = new Map<string, (typeof existingViews)[number]>();
        const viewsByName = new Map<string, (typeof existingViews)[number]>();
        for (const v of existingViews) {
          const nameKey = String(v.name || '')
            .trim()
            .toLowerCase();
          if (nameKey) viewsByName.set(nameKey, v);
          viewsByHash.set(computeBundleHash({ name: v.name, description: v.description, root: v.root, runtimeConfig: v.runtimeConfig }), v);
        }

        for (const v of manifestParsed.data.entities.views) {
          const entry = zip.getEntry(v.file);
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
          const bundleHash = computeBundleHash({
            name: viewPayload?.name,
            description: viewPayload?.description,
            root: viewPayload?.root,
            runtimeConfig: viewPayload?.runtimeConfig,
          });
          const decision = decisionsParsed.data.views[bundleHash] ?? { action: 'copy' as const };
          const viewNameKey = String(viewPayload?.name || '')
            .trim()
            .toLowerCase();
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
          const nameKey = String(d.name || '')
            .trim()
            .toLowerCase();
          if (nameKey) datasetsByName.set(nameKey, d);
          datasetsByHash.set(
            computeBundleHash({ name: d.name, description: d.description, columns: d.columns, primaryKey: d.primaryKey ?? null }),
            d
          );
        }

        for (const d of manifestParsed.data.entities.datasets) {
          const entry = zip.getEntry(d.file);
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

          const bundleHash = computeBundleHash({
            name: datasetPayload?.name,
            description: datasetPayload?.description,
            columns: datasetPayload?.columns,
            primaryKey: datasetPayload?.primaryKey ?? null,
          });
          const decision = decisionsParsed.data.datasets[bundleHash] ?? { action: 'copy' as const };
          const datasetNameKey = String(datasetPayload?.name || '')
            .trim()
            .toLowerCase();
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
          const nameKey = String(b.name || '')
            .trim()
            .toLowerCase();
          if (nameKey) boardsByName.set(nameKey, b);
        }

        for (const b of manifestParsed.data.entities.taskBoards) {
          const entry = zip.getEntry(b.file);
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
          const decision = decisionsParsed.data.taskBoards[bundleHash] ?? { action: 'copy' as const };
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
        for (const r of manifestParsed.data.entities.rooms) {
          const entry = zip.getEntry(r.file);
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
          const bundleHash = computeBundleHash({
            name: roomPayload?.name,
            isPrivate: roomPayload?.isPrivate,
            topic: roomPayload?.topic ?? null,
          });
          const decision = decisionsParsed.data.rooms[bundleHash] ?? { action: 'copy' as const };
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
          });

          // Creator becomes admin participant.
          await participantRepo.addUserParticipant({
            conversationId: createdRoom.conversationId,
            userId: user.id,
            role: 'admin',
            createdBy: user.id,
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
            await participantRepo.addAgentParticipant({ conversationId: createdRoom.conversationId, agentId, createdBy: user.id });
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
              createdBy: user.id,
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
              createdBy: user.id,
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
              createdBy: user.id,
            });
          }

          imported.rooms += 1;
        }

        return {
          imported,
          warnings: warnings.length ? warnings : undefined,
        };
      });

      sendSuccess(res, applyResult, 201);
    } catch (error) {
      handleError(error, res, 'applying room bundle import');
    }
  }
);

export default router;
