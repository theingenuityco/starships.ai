#!/usr/bin/env node

/**
 * Backfill optimizer for existing avatars.
 *
 * Covers TWO avatar stores:
 * 1) Agent avatars: agents.avatar_attachment_id -> attachments (starship-scoped objects)
 * 2) Marketplace template avatars: agent_templates.avatar_s3_key (public/served via API)
 *
 * Default: optimize BOTH.
 * Safe defaults:
 * - dry-run by default (no uploads, no DB writes)
 * - skip when output isn't smaller
 */

import { getEnvConfig } from '@starships/env';
import { AgentTemplateRepository, createConnection } from '@starships/models';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

type Target = 'agents' | 'templates' | 'all';

type Args = {
  apply: boolean;
  target: Target;
  concurrency: number;
  // Agents
  agentsLimit?: number;
  agentsStarshipId?: string;
  agentsMinBytes: number;
  // Templates
  templatesLimit?: number;
  templatesMinBytes: number;
  // Common image settings
  maxDim: number;
  quality: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    target: 'all',
    concurrency: 3,
    agentsMinBytes: 150 * 1024,
    templatesMinBytes: 150 * 1024,
    maxDim: 512,
    quality: 80,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--target') args.target = String(argv[i + 1] ?? '') as Target;
    else if (a === '--concurrency') args.concurrency = Number(argv[i + 1] ?? '');
    else if (a === '--agents-limit') args.agentsLimit = Number(argv[i + 1] ?? '');
    else if (a === '--agents-starship-id') args.agentsStarshipId = String(argv[i + 1] ?? '');
    else if (a === '--agents-min-bytes') args.agentsMinBytes = Number(argv[i + 1] ?? '');
    else if (a === '--templates-limit') args.templatesLimit = Number(argv[i + 1] ?? '');
    else if (a === '--templates-min-bytes') args.templatesMinBytes = Number(argv[i + 1] ?? '');
    else if (a === '--max-dim') args.maxDim = Number(argv[i + 1] ?? '');
    else if (a === '--quality') args.quality = Number(argv[i + 1] ?? '');
  }

  if (!['agents', 'templates', 'all'].includes(args.target)) args.target = 'all';
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1 || args.concurrency > 20) args.concurrency = 3;
  if (args.agentsLimit !== undefined && (!Number.isFinite(args.agentsLimit) || args.agentsLimit <= 0)) args.agentsLimit = undefined;
  if (args.templatesLimit !== undefined && (!Number.isFinite(args.templatesLimit) || args.templatesLimit <= 0)) args.templatesLimit = undefined;
  if (!Number.isFinite(args.agentsMinBytes) || args.agentsMinBytes < 0) args.agentsMinBytes = 0;
  if (!Number.isFinite(args.templatesMinBytes) || args.templatesMinBytes < 0) args.templatesMinBytes = 0;
  if (!Number.isFinite(args.maxDim) || args.maxDim < 64) args.maxDim = 512;
  if (!Number.isFinite(args.quality) || args.quality < 1 || args.quality > 100) args.quality = 80;
  if (args.agentsStarshipId && args.agentsStarshipId.trim().length === 0) args.agentsStarshipId = undefined;

  return args;
}

function getS3(env: ReturnType<typeof getEnvConfig>): S3Client {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return new S3Client({
      region: env.AWS_S3_REGION,
      credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
    });
  }
  return new S3Client({ region: env.AWS_S3_REGION });
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error('Empty S3 body');
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, idx: number) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

type AgentRow = {
  agent_id: string;
  starship_id: string;
  attachment_id: string;
  s3_key: string;
  mime_type: string;
  size_bytes: number;
  filename: string;
};

async function optimizeAgentAvatars(args: Args, env: ReturnType<typeof getEnvConfig>, s3: S3Client): Promise<void> {
  const db = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });
  await db.connect();
  const pool = db.getPool();

  const where: string[] = [
    'a.avatar_attachment_id IS NOT NULL',
    // only starship-owned attachment objects (never touch public/agent-templates from this path)
    "att.s3_key LIKE 'starship-%'",
    "att.mime_type LIKE 'image/%'",
    "att.mime_type <> 'image/webp'",
    "att.mime_type <> 'image/gif'",
  ];
  const params: unknown[] = [];
  if (args.agentsStarshipId) {
    params.push(args.agentsStarshipId);
    where.push(`a.starship_id = $${params.length}`);
  }
  if (args.agentsMinBytes > 0) {
    params.push(args.agentsMinBytes);
    where.push(`COALESCE(att.size_bytes, 0) >= $${params.length}`);
  }

  const limitSql = args.agentsLimit ? `LIMIT ${Math.floor(args.agentsLimit)}` : '';
  const query = `
    SELECT
      a.id as agent_id,
      a.starship_id as starship_id,
      att.id as attachment_id,
      att.s3_key as s3_key,
      att.mime_type as mime_type,
      att.size_bytes as size_bytes,
      att.filename as filename
    FROM agents a
    INNER JOIN attachments att ON att.id = a.avatar_attachment_id
    WHERE ${where.join(' AND ')}
    ORDER BY att.created_at ASC
    ${limitSql}
  `;

  const rows = (await pool.query(query, params)).rows as AgentRow[];

  console.log(
    `[optimize-existing-avatars] (agents) candidates=${rows.length} apply=${args.apply} concurrency=${args.concurrency} agentsMinBytes=${args.agentsMinBytes}` +
      (args.agentsStarshipId ? ` starshipId=${args.agentsStarshipId}` : '')
  );

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  await runWithConcurrency(rows, args.concurrency, async (row) => {
    processed++;
    try {
      const origKey = row.s3_key;
      const origMime = row.mime_type;
      if (!origKey || !origKey.startsWith('starship-')) {
        skipped++;
        return;
      }
      if (!origMime.startsWith('image/') || origMime === 'image/webp' || origMime === 'image/gif') {
        skipped++;
        return;
      }

      const getRes = await s3.send(new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET!, Key: origKey }));
      const inputBuf = await streamToBuffer(getRes.Body);
      bytesBefore += inputBuf.length;

      const outBuf = await sharp(inputBuf)
        .rotate()
        .resize(args.maxDim, args.maxDim, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: args.quality, effort: 4 })
        .toBuffer();
      bytesAfter += outBuf.length;

      if (outBuf.length >= inputBuf.length) {
        skipped++;
        return;
      }

      const dir = origKey.split('/').slice(0, -1).join('/');
      const base = (row.filename || 'avatar').replace(/\.[a-z0-9]+$/i, '');
      const newFilename = `${base}.webp`;
      const newKey = `${dir}/${Date.now()}_optimized_${base}.webp`;

      if (!args.apply) {
        updated++;
        console.log(
          `[dry-run] agent=${row.agent_id} attachment=${row.attachment_id} ${origKey} (${Math.round(inputBuf.length / 1024)}KB) -> ${newKey} (${Math.round(
            outBuf.length / 1024
          )}KB)`
        );
        return;
      }

      await s3.send(new PutObjectCommand({ Bucket: env.AWS_S3_BUCKET!, Key: newKey, Body: outBuf, ContentType: 'image/webp' }));
      const meta = await sharp(outBuf).metadata();
      const w = typeof meta.width === 'number' ? meta.width : null;
      const h = typeof meta.height === 'number' ? meta.height : null;

      // attachments has no updated_at column (see migration 007_add_attachments)
      await pool.query(
        `
        UPDATE attachments
        SET
          filename = $2,
          mime_type = $3,
          size_bytes = $4,
          s3_key = $5,
          image_width = $6,
          image_height = $7
        WHERE id = $1
        `,
        [row.attachment_id, newFilename, 'image/webp', outBuf.length, newKey, w, h]
      );

      updated++;
      console.log(
        `[updated] agent=${row.agent_id} attachment=${row.attachment_id} ${origKey} (${Math.round(inputBuf.length / 1024)}KB) -> ${newKey} (${Math.round(
          outBuf.length / 1024
        )}KB)`
      );
    } catch (e) {
      errors++;
      console.error(
        `[error] agent=${row.agent_id} attachment=${row.attachment_id} key=${row.s3_key}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });

  console.log(
    `[optimize-existing-avatars] (agents) done processed=${processed} updated=${updated} skipped=${skipped} errors=${errors} bytesBefore=${Math.round(
      bytesBefore / 1024
    )}KB bytesAfter=${Math.round(bytesAfter / 1024)}KB saved=${Math.round((bytesBefore - bytesAfter) / 1024)}KB`
  );

  await db.disconnect();
}

type TemplateRow = {
  id: string;
  avatar_s3_key: string;
  avatar_mime_type: string | null;
  avatar_updated_at: Date | string | null;
};

async function optimizeTemplateAvatars(args: Args, env: ReturnType<typeof getEnvConfig>, s3: S3Client): Promise<void> {
  const db = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });
  await db.connect();
  const pool = db.getPool();

  const repo = new AgentTemplateRepository();

  const limitSql = args.templatesLimit ? `LIMIT ${Math.floor(args.templatesLimit)}` : '';
  const rows = (
    await pool.query(
      `
      SELECT id, avatar_s3_key, avatar_mime_type, avatar_updated_at
      FROM agent_templates
      WHERE avatar_s3_key IS NOT NULL
        AND COALESCE(avatar_mime_type, '') <> 'image/webp'
      ORDER BY updated_at DESC
      ${limitSql}
      `
    )
  ).rows as TemplateRow[];

  console.log(
    `[optimize-existing-avatars] (templates) candidates=${rows.length} apply=${args.apply} concurrency=${args.concurrency} templatesMinBytes=${args.templatesMinBytes}`
  );

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  await runWithConcurrency(rows, args.concurrency, async (row) => {
    processed++;
    try {
      const origKey = String(row.avatar_s3_key || '').trim();
      if (!origKey) {
        skipped++;
        return;
      }

      const getRes = await s3.send(new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET!, Key: origKey }));
      const inputBuf = await streamToBuffer(getRes.Body);
      bytesBefore += inputBuf.length;

      if (args.templatesMinBytes > 0 && inputBuf.length < args.templatesMinBytes) {
        skipped++;
        return;
      }

      const outBuf = await sharp(inputBuf)
        .rotate()
        .resize(args.maxDim, args.maxDim, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: args.quality, effort: 4 })
        .toBuffer();
      bytesAfter += outBuf.length;

      if (outBuf.length >= inputBuf.length) {
        skipped++;
        return;
      }

      const dir = origKey.split('/').slice(0, -1).join('/');
      const base = `template-${row.id}-avatar`;
      const newKey = `${dir}/${Date.now()}_optimized_${base}.webp`;

      if (!args.apply) {
        updated++;
        console.log(
          `[dry-run] template=${row.id} ${origKey} (${Math.round(inputBuf.length / 1024)}KB) -> ${newKey} (${Math.round(outBuf.length / 1024)}KB)`
        );
        return;
      }

      await s3.send(new PutObjectCommand({ Bucket: env.AWS_S3_BUCKET!, Key: newKey, Body: outBuf, ContentType: 'image/webp' }));

      await repo.updateAvatarStorage(row.id, {
        avatarS3Key: newKey,
        avatarMimeType: 'image/webp',
        avatarUpdatedAt: new Date().toISOString(),
      });

      updated++;
      console.log(
        `[updated] template=${row.id} ${origKey} (${Math.round(inputBuf.length / 1024)}KB) -> ${newKey} (${Math.round(outBuf.length / 1024)}KB)`
      );
    } catch (e) {
      errors++;
      console.error(`[error] template=${row.id} key=${row.avatar_s3_key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  console.log(
    `[optimize-existing-avatars] (templates) done processed=${processed} updated=${updated} skipped=${skipped} errors=${errors} bytesBefore=${Math.round(
      bytesBefore / 1024
    )}KB bytesAfter=${Math.round(bytesAfter / 1024)}KB saved=${Math.round((bytesBefore - bytesAfter) / 1024)}KB`
  );

  await db.disconnect();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = getEnvConfig();

  if (!env.AWS_S3_BUCKET) throw new Error('AWS_S3_BUCKET not configured');

  const s3 = getS3(env);

  console.log(
    `[optimize-existing-avatars] start target=${args.target} apply=${args.apply} concurrency=${args.concurrency} maxDim=${args.maxDim} quality=${args.quality}`
  );

  if (args.target === 'agents' || args.target === 'all') {
    await optimizeAgentAvatars(args, env, s3);
  }
  if (args.target === 'templates' || args.target === 'all') {
    await optimizeTemplateAvatars(args, env, s3);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[optimize-existing-avatars] fatal:', err instanceof Error ? err.stack || err.message : String(err));
    process.exit(1);
  });
}

