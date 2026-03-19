import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { getBundleRegistryEnv } from '@/env';
import { requireRegistryInternalAuth } from '@/auth';
import { computeZipContentHash } from '@/utils/zipHash';
import { generatePresignedZipUploadUrl, getObjectBuffer, getObjectStream } from '@/s3';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import {
  BundleRegistryRepository,
  createConnection,
  getBundleRegistryDbEnv,
  migrationRunner,
  type BundleKind,
  type BundleVisibility,
} from '@starships/bundle-registry-models';

function randomId(): string {
  return crypto.randomUUID();
}

function tryReadBundleCounts(zipBuffer: Buffer): {
  schemaVersion?: string;
  counts: {
    agents: number;
    tools: number;
    rooms: number;
    views: number;
    datasets: number;
    taskBoards: number;
  };
} {
  const counts = { agents: 0, tools: 0, rooms: 0, views: 0, datasets: 0, taskBoards: 0 };
  try {
    const zip = new AdmZip(zipBuffer);
    const entry = zip.getEntry('manifest.json');
    if (!entry) return { counts };
    const raw = JSON.parse(entry.getData().toString('utf8')) as any;
    const schemaVersion = typeof raw?.schemaVersion === 'string' ? raw.schemaVersion : undefined;
    const entities = raw?.entities ?? {};
    counts.agents = Array.isArray(entities.agents) ? entities.agents.length : 0;
    counts.tools = Array.isArray(entities.tools) ? entities.tools.length : 0;
    counts.rooms = Array.isArray(entities.rooms) ? entities.rooms.length : 0;
    counts.views = Array.isArray(entities.views) ? entities.views.length : 0;
    counts.datasets = Array.isArray(entities.datasets) ? entities.datasets.length : 0;
    counts.taskBoards = Array.isArray(entities.taskBoards) ? entities.taskBoards.length : 0;
    return { schemaVersion, counts };
  } catch {
    return { counts };
  }
}

const CreateBundleSchema = z.object({
  slug: z.string().min(1).max(80),
  displayName: z.string().min(1).max(200),
  description: z.string().max(4000).default(''),
  kind: z.enum(['agent_bundle', 'room_bundle']),
  visibility: z.enum(['private', 'public']).default('private'),
  createdByUserId: z.string().min(1).optional().nullable(),
});

const PublishVersionQuerySchema = z.object({
  version: z.string().min(1).max(80),
  createdByUserId: z.string().min(1).optional().nullable(),
});

const UploadInitQuerySchema = PublishVersionQuerySchema.extend({
  contentType: z.string().min(1).max(200).default('application/zip'),
});

const UploadCompleteBodySchema = z.object({
  version: z.string().min(1).max(80),
  s3Key: z.string().min(1).max(2048),
  artifactSizeBytes: z.number().int().min(1).max(2_000_000_000).optional(),
  createdByUserId: z.string().min(1).optional().nullable(),
});

async function main() {
  const env = getBundleRegistryEnv();
  const dbEnv = getBundleRegistryDbEnv();
  const conn = createConnection({
    host: dbEnv.BUNDLE_REGISTRY_POSTGRES_HOST,
    port: dbEnv.BUNDLE_REGISTRY_POSTGRES_PORT,
    user: dbEnv.BUNDLE_REGISTRY_POSTGRES_USER,
    password: dbEnv.BUNDLE_REGISTRY_POSTGRES_PASSWORD,
    database: dbEnv.BUNDLE_REGISTRY_POSTGRES_DATABASE,
    ssl: dbEnv.BUNDLE_REGISTRY_POSTGRES_SSL,
  });
  await conn.connect();
  await migrationRunner.runAllPendingMigrations();
  const repo = new BundleRegistryRepository(conn);

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: true, credentials: false }));

  // Health should be open (k8s probes).
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Internal API (token protected).
  app.use('/api', requireRegistryInternalAuth);
  app.use('/api', express.json({ limit: '5mb' }));

  app.post('/api/bundles', (req, res) => {
    const parsed = CreateBundleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      return;
    }
    const id = randomId();
    repo
      .createBundle({
        id,
        slug: parsed.data.slug,
        displayName: parsed.data.displayName,
        description: parsed.data.description,
        kind: parsed.data.kind as BundleKind,
        visibility: parsed.data.visibility as BundleVisibility,
        createdByUserId: parsed.data.createdByUserId ?? null,
      })
      .then((bundle) => res.status(201).json({ bundle }))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (/unique/i.test(msg) || /duplicate/i.test(msg)) {
          res.status(409).json({ error: 'CONFLICT', message: 'Bundle slug already exists' });
          return;
        }
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
      });
  });

  app.get('/api/bundles', (_req, res) => {
    repo
      .listBundles()
      .then((bundles) => res.json({ bundles }))
      .catch(() => res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' }));
  });

  app.get('/api/bundles/:id', (req, res) => {
    const id = String(req.params.id || '');
    repo
      .findBundleById(id)
      .then((bundle) => {
        if (!bundle) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }
        res.json({ bundle });
      })
      .catch(() => res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' }));
  });

  app.get('/api/bundles/:id/versions', (req, res) => {
    const id = String(req.params.id || '');
    repo
      .findBundleById(id)
      .then((bundle) => {
        if (!bundle) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }
        return repo.listVersionsByBundle(id).then((versions) => res.json({ versions }));
      })
      .catch(() => res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' }));
  });

  // Signed upload flow (no multer):
  // 1) init -> presigned PUT to S3
  // 2) complete -> registry downloads artifact, computes hashes, creates immutable version row

  app.post('/api/bundles/:id/versions/upload/init', async (req, res) => {
    const id = String(req.params.id || '');
    const bundle = await repo.findBundleById(id);
    if (!bundle) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }

    const queryParsed = UploadInitQuerySchema.safeParse(req.query ?? {});
    if (!queryParsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', issues: queryParsed.error.issues });
      return;
    }

    const contentType = String(queryParsed.data.contentType || 'application/zip');
    const uploadId = randomId();
    const safeVersion = encodeURIComponent(queryParsed.data.version);
    const s3Key = `bundles/${bundle.id}/uploads/${safeVersion}/${uploadId}.zip`;
    const { uploadUrl, expiresInSeconds } = await generatePresignedZipUploadUrl({
      key: s3Key,
      contentType,
      expiresInSeconds: 10 * 60,
    });

    res.status(200).json({
      upload: {
        s3Key,
        uploadUrl,
        expiresInSeconds,
        requiredHeaders: { 'Content-Type': contentType },
      },
    });
  });

  app.post('/api/bundles/:id/versions/upload/complete', async (req, res) => {
    const id = String(req.params.id || '');
    const bundle = await repo.findBundleById(id);
    if (!bundle) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }

    const parsed = UploadCompleteBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      return;
    }

    const { buffer: zipBuffer } = await getObjectBuffer({ key: parsed.data.s3Key, maxBytes: 250 * 1024 * 1024 });
    const { artifactSha256, contentSha256, fileCount } = computeZipContentHash(zipBuffer);
    const { schemaVersion, counts } = tryReadBundleCounts(zipBuffer);

    const versionId = randomId();
    const version = await repo.createBundleVersion({
      id: versionId,
      bundleId: bundle.id,
      version: parsed.data.version,
      createdByUserId: parsed.data.createdByUserId ?? null,
      sourceStarshipId: null,
      sourceStarshipSlug: null,
      schemaVersion: schemaVersion ?? '1',
      bundleHash: contentSha256,
      artifactKey: parsed.data.s3Key,
      artifactSize: parsed.data.artifactSizeBytes ?? zipBuffer.length,
      artifactSha256,
      contentSha256,
      fileCount,
      agentsCount: counts.agents,
      toolsCount: counts.tools,
      roomsCount: counts.rooms,
      viewsCount: counts.views,
      datasetsCount: counts.datasets,
      taskBoardsCount: counts.taskBoards,
    });

    res.status(201).json({ version });
  });

  // Download version artifact (stream).
  app.get('/api/bundle-versions/:versionId/download', async (req, res) => {
    const versionId = String(req.params.versionId || '');
    const version = await repo.findVersionById(versionId);
    if (!version) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }

    const { contentType, body } = await getObjectStream({ key: version.artifactKey });
    res.setHeader('Content-Type', contentType ?? 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="bundle-${version.bundleId}-${encodeURIComponent(version.version)}.zip"`);

    // Convert web stream to node pipe target.
    const reader = body.getReader();
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
  });

  app.listen(env.BUNDLE_REGISTRY_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[bundle-registry] listening on :${env.BUNDLE_REGISTRY_PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bundle-registry] fatal', err);
  process.exit(1);
});

