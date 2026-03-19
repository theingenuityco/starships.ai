import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import type { AuthUser } from '@starships/protocol';
import { BundleRegistryClient } from '@/clients/BundleRegistryClient';
import { ImportExportService } from '@/services/ImportExportService';
import { AgentService } from '@/services/AgentService';
import { RoomRepository } from '@starships/models';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { analyzeAgentBundleImport, applyAgentBundleImport } from '@/services/bundles/agent-bundle-import';
import { analyzeRoomBundleImport, applyRoomBundleImport, type RoomBundleDecisions } from '@/services/bundles/room-bundle-import';

const router: Router = Router();

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('close', () => resolve(Buffer.concat(chunks)));
  });
}

function requireInstanceAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
    sendError(res, 'FORBIDDEN', 'Only instance admins can access the bundle registry', 403);
    return;
  }
  next();
}

router.use('/registry', jwtAuthMiddleware, requireInstanceAdminMiddleware);

const CreateRegistryBundleSchema = z.object({
  slug: z.string().min(1).max(80),
  displayName: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  kind: z.enum(['agent_bundle', 'room_bundle']),
  visibility: z.enum(['private', 'public']).optional(),
});

router.get('/registry/bundles', async (_req: Request, res: Response): Promise<void> => {
  try {
    const client = new BundleRegistryClient();
    const bundles = await client.listBundles();
    sendSuccess(res, { bundles });
  } catch (e) {
    handleError(e, res, 'listing registry bundles');
  }
});

router.post('/registry/bundles', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(CreateRegistryBundleSchema, req.body, res, 'bundle create');
    if (!body) return;
    const client = new BundleRegistryClient();
    const bundle = await client.createBundle({
      slug: body.slug,
      displayName: body.displayName,
      description: body.description ?? '',
      kind: body.kind,
      visibility: body.visibility ?? 'private',
      createdByUserId: req.user?.id ? String(req.user.id) : null,
    });
    sendSuccess(res, { bundle }, 201);
  } catch (e) {
    handleError(e, res, 'creating registry bundle');
  }
});

router.get('/registry/bundles/:id/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: z.string().min(1) }), req.params, res, 'bundle id');
    if (!params) return;
    const client = new BundleRegistryClient();
    const versions = await client.listBundleVersions(params.id);
    sendSuccess(res, { versions });
  } catch (e) {
    handleError(e, res, 'listing registry bundle versions');
  }
});

router.post('/registry/bundles/:id/versions/upload/init', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: z.string().min(1) }), req.params, res, 'bundle id');
    if (!params) return;
    const query = validateData(
      z.object({
        version: z.string().min(1).max(80),
        contentType: z.string().min(1).max(200).optional(),
      }),
      req.query,
      res,
      'upload init query'
    );
    if (!query) return;

    const client = new BundleRegistryClient();
    const upload = await client.initBundleVersionUpload({
      bundleId: params.id,
      version: query.version,
      ...(query.contentType ? { contentType: query.contentType } : {}),
    });
    sendSuccess(res, { upload });
  } catch (e) {
    handleError(e, res, 'initializing registry version upload');
  }
});

router.post('/registry/bundles/:id/versions/upload/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ id: z.string().min(1) }), req.params, res, 'bundle id');
    if (!params) return;
    const body = validateData(
      z.object({
        version: z.string().min(1).max(80),
        s3Key: z.string().min(1).max(2048),
        artifactSizeBytes: z.number().int().min(1).max(2_000_000_000).optional(),
      }),
      req.body,
      res,
      'upload complete'
    );
    if (!body) return;

    const client = new BundleRegistryClient();
    const version = await client.completeBundleVersionUpload({
      bundleId: params.id,
      version: body.version,
      s3Key: body.s3Key,
      ...(typeof body.artifactSizeBytes === 'number' ? { artifactSizeBytes: body.artifactSizeBytes } : {}),
      createdByUserId: req.user?.id ? String(req.user.id) : null,
    });
    sendSuccess(res, { version }, 201);
  } catch (e) {
    handleError(e, res, 'completing registry version upload');
  }
});

router.get('/registry/bundle-versions/:versionId/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ versionId: z.string().min(1) }), req.params, res, 'version id');
    if (!params) return;
    const client = new BundleRegistryClient();
    const dl = await client.downloadBundleVersionStream(params.versionId);
    res.setHeader('Content-Type', dl.contentType ?? 'application/zip');
    if (dl.contentDisposition) res.setHeader('Content-Disposition', dl.contentDisposition);

    const reader = dl.body.getReader();
    res.on('close', () => {
      try {
        reader.cancel();
      } catch {
        // ignore
      }
    });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    handleError(e, res, 'downloading registry bundle version');
  }
});

// -----------------------------------------------------------------------------
// Install from registry into a starship (agent bundle)
// -----------------------------------------------------------------------------

const InstallAnalyzeSchema = z.object({
  starshipId: z.string().min(1),
  bundleVersionId: z.string().min(1),
});

router.post('/registry/install/agent-bundle/analyze', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(InstallAnalyzeSchema, req.body, res, 'install analyze');
    if (!body) return;
    const registry = new BundleRegistryClient();
    const zipBuffer = await registry.downloadBundleVersionBuffer(body.bundleVersionId);
    const analysis = await analyzeAgentBundleImport({ starshipId: body.starshipId, zipBuffer });
    sendSuccess(res, analysis);
  } catch (e) {
    handleError(e, res, 'analyzing registry agent bundle install');
  }
});

router.post('/registry/install/agent-bundle/apply', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(
      InstallAnalyzeSchema.extend({
        decisions: z.object({
          tools: z.record(z.string().min(1), z.object({ action: z.enum(['skip', 'copy', 'overwrite']), targetId: z.string().optional() })).default({}),
          agents: z.record(z.string().min(1), z.object({ action: z.enum(['skip', 'copy', 'overwrite']), targetId: z.string().optional() })).default({}),
        }),
      }),
      req.body,
      res,
      'install apply'
    );
    if (!body) return;

    const registry = new BundleRegistryClient();
    const zipBuffer = await registry.downloadBundleVersionBuffer(body.bundleVersionId);
    const result = await applyAgentBundleImport({ starshipId: body.starshipId, zipBuffer, decisions: body.decisions });
    sendSuccess(res, result, 201);
  } catch (e) {
    handleError(e, res, 'applying registry agent bundle install');
  }
});

router.post('/registry/install/room-bundle/analyze', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(InstallAnalyzeSchema, req.body, res, 'install room analyze');
    if (!body) return;
    const registry = new BundleRegistryClient();
    const zipBuffer = await registry.downloadBundleVersionBuffer(body.bundleVersionId);
    const analysis = await analyzeRoomBundleImport({ starshipId: body.starshipId, zipBuffer });
    sendSuccess(res, analysis);
  } catch (e) {
    handleError(e, res, 'analyzing registry room bundle install');
  }
});

router.post('/registry/install/room-bundle/apply', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = validateData(
      InstallAnalyzeSchema.extend({
        decisions: z
          .object({
            rooms: z.record(z.string().min(1), z.object({ action: z.enum(['skip', 'copy', 'overwrite']), targetId: z.string().optional() })).default({}),
            views: z.record(z.string().min(1), z.object({ action: z.enum(['skip', 'copy', 'overwrite']), targetId: z.string().optional() })).default({}),
            datasets: z.record(z.string().min(1), z.object({ action: z.enum(['skip', 'copy', 'overwrite']), targetId: z.string().optional() })).default({}),
            taskBoards: z.record(z.string().min(1), z.object({ action: z.enum(['skip', 'copy', 'overwrite']), targetId: z.string().optional() })).default({}),
            tools: z.record(z.string().min(1), z.object({ action: z.enum(['skip', 'copy', 'overwrite']), targetId: z.string().optional() })).default({}),
            agents: z.record(z.string().min(1), z.object({ action: z.enum(['skip', 'copy', 'overwrite']), targetId: z.string().optional() })).default({}),
          })
          .default({ rooms: {}, views: {}, datasets: {}, taskBoards: {}, tools: {}, agents: {} }),
      }),
      req.body,
      res,
      'install room apply'
    );
    if (!body) return;

    const registry = new BundleRegistryClient();
    const zipBuffer = await registry.downloadBundleVersionBuffer(body.bundleVersionId);
    const decisions = body.decisions as RoomBundleDecisions;
    const result = await applyRoomBundleImport({ starshipId: body.starshipId, userId: String(req.user!.id), zipBuffer, decisions });
    sendSuccess(res, result, 201);
  } catch (e) {
    handleError(e, res, 'applying registry room bundle install');
  }
});

// -----------------------------------------------------------------------------
// Publish-from-export (server streams a zip export to registry via presigned URL)
// -----------------------------------------------------------------------------

const PublishFromAgentSchema = z.object({
  bundleId: z.string().min(1),
  version: z.string().min(1).max(80),
});

router.post('/registry/publish/agent/:agentId', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ agentId: z.string().min(1) }), req.params, res, 'agent id');
    if (!params) return;
    const body = validateData(PublishFromAgentSchema, req.body, res, 'publish agent bundle');
    if (!body) return;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(params.agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404);
      return;
    }

    const ie = new ImportExportService();
    const bundle = await ie.exportAgentsBundle([params.agentId]);

    const registry = new BundleRegistryClient();
    const upload = await registry.initBundleVersionUpload({ bundleId: body.bundleId, version: body.version, contentType: 'application/zip' });

    const archive = archiver('zip', { zlib: { level: 9 } });
    const pass = new PassThrough();
    archive.on('error', (err) => {
      pass.destroy(err);
    });
    archive.pipe(pass);

    const safeFilenameSegment = (input: string): string => {
      const raw = String(input || '').trim();
      const sanitized = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
      return sanitized.length > 0 ? sanitized : 'export';
    };

    const usedAgentNames = new Set<string>();
    const agentEntries: Array<{ kind: 'agent'; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> = [];
    for (let i = 0; i < bundle.agents.length; i += 1) {
      const a = bundle.agents[i];
      const slug = typeof a.metadata?.fromSlug === 'string' ? a.metadata.fromSlug : `agent-${i + 1}`;
      const base = safeFilenameSegment(slug);
      let outName = base;
      let n = 2;
      while (usedAgentNames.has(outName)) {
        outName = `${base}-${n}`;
        n += 1;
      }
      usedAgentNames.add(outName);
      const file = `agents/${outName}.json`;
      agentEntries.push({ kind: 'agent', fromSlug: a.metadata?.fromSlug, fromStarshipSlug: a.metadata?.fromStarshipSlug, file });
      archive.append(JSON.stringify(a, null, 2), { name: file });
    }

    const usedToolNames = new Set<string>();
    const toolEntries: Array<{ kind: 'tool'; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> = [];
    for (let i = 0; i < bundle.tools.length; i += 1) {
      const t = bundle.tools[i];
      const slug = typeof t.metadata?.fromSlug === 'string' ? t.metadata.fromSlug : `tool-${i + 1}`;
      const base = safeFilenameSegment(slug);
      let outName = base;
      let n = 2;
      while (usedToolNames.has(outName)) {
        outName = `${base}-${n}`;
        n += 1;
      }
      usedToolNames.add(outName);
      const file = `tools/${outName}.json`;
      toolEntries.push({ kind: 'tool', fromSlug: t.metadata?.fromSlug, fromStarshipSlug: t.metadata?.fromStarshipSlug, file });
      archive.append(JSON.stringify(t, null, 2), { name: file });
    }

    const manifest = {
      schemaVersion: '1',
      kind: 'bundle',
      exportedAt: new Date().toISOString(),
      entities: {
        agents: agentEntries,
        tools: toolEntries,
      },
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    await archive.finalize();
    const zipBuffer = await streamToBuffer(pass);
    await registry.putBufferToPresignedUrl({
      uploadUrl: upload.uploadUrl,
      contentType: upload.requiredHeaders['Content-Type'] ?? 'application/zip',
      buffer: zipBuffer,
    });

    const version = await registry.completeBundleVersionUpload({
      bundleId: body.bundleId,
      version: body.version,
      s3Key: upload.s3Key,
      createdByUserId: req.user?.id ? String(req.user.id) : null,
    });

    sendSuccess(res, { version }, 201);
  } catch (e) {
    handleError(e, res, 'publishing agent bundle to registry');
  }
});

const PublishFromRoomSchema = z.object({
  bundleId: z.string().min(1),
  version: z.string().min(1).max(80),
});

router.post('/registry/publish/room/:roomId', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: z.string().min(1) }), req.params, res, 'room id');
    if (!params) return;
    const body = validateData(PublishFromRoomSchema, req.body, res, 'publish room bundle');
    if (!body) return;

    const roomRepo = new RoomRepository();
    const room = await roomRepo.findByConversationId(params.roomId);
    if (!room) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Room not found', 404);
      return;
    }

    const ie = new ImportExportService();
    const bundle = await ie.exportRoomBundle(params.roomId);

    const registry = new BundleRegistryClient();
    const upload = await registry.initBundleVersionUpload({ bundleId: body.bundleId, version: body.version, contentType: 'application/zip' });

    const archive = archiver('zip', { zlib: { level: 9 } });
    const pass = new PassThrough();
    archive.on('error', (err) => {
      pass.destroy(err);
    });
    archive.pipe(pass);

    const safeFilenameSegment = (input: string): string => {
      const raw = String(input || '').trim();
      const sanitized = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
      return sanitized.length > 0 ? sanitized : 'export';
    };

    const appendContainers = <K extends string>(
      items: Array<{ metadata?: { fromSlug?: unknown; fromStarshipSlug?: unknown } }>,
      dir: string,
      fallbackPrefix: string,
      kind: K
    ): Array<{ kind: K; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> => {
      const usedNames = new Set<string>();
      const entries: Array<{ kind: K; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const slug = typeof item.metadata?.fromSlug === 'string' ? item.metadata.fromSlug : `${fallbackPrefix}-${i + 1}`;
        const base = safeFilenameSegment(slug);
        let outName = base;
        let n = 2;
        while (usedNames.has(outName)) {
          outName = `${base}-${n}`;
          n += 1;
        }
        usedNames.add(outName);
        const file = `${dir}/${outName}.json`;
        entries.push({ kind, fromSlug: item.metadata?.fromSlug, fromStarshipSlug: item.metadata?.fromStarshipSlug, file });
        archive.append(JSON.stringify(item, null, 2), { name: file });
      }
      return entries;
    };

    const roomEntries = appendContainers([bundle.room], 'rooms', 'room', 'room');
    const agentEntries = appendContainers(bundle.agents, 'agents', 'agent', 'agent');
    const viewEntries = appendContainers(bundle.views, 'views', 'view', 'view');
    const datasetEntries = appendContainers(bundle.datasets, 'datasets', 'dataset', 'dataset');
    const taskBoardEntries = appendContainers(bundle.taskBoards, 'task-boards', 'task-board', 'task_board');
    const toolEntries = appendContainers(bundle.tools, 'tools', 'tool', 'tool');

    const manifest = {
      schemaVersion: '1',
      kind: 'bundle',
      exportedAt: new Date().toISOString(),
      entities: {
        rooms: roomEntries,
        agents: agentEntries,
        views: viewEntries,
        datasets: datasetEntries,
        taskBoards: taskBoardEntries,
        tools: toolEntries,
      },
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    await archive.finalize();
    const zipBuffer = await streamToBuffer(pass);
    await registry.putBufferToPresignedUrl({
      uploadUrl: upload.uploadUrl,
      contentType: upload.requiredHeaders['Content-Type'] ?? 'application/zip',
      buffer: zipBuffer,
    });

    const version = await registry.completeBundleVersionUpload({
      bundleId: body.bundleId,
      version: body.version,
      s3Key: upload.s3Key,
      createdByUserId: req.user?.id ? String(req.user.id) : null,
    });

    sendSuccess(res, { version }, 201);
  } catch (e) {
    handleError(e, res, 'publishing room bundle to registry');
  }
});

export default router;

