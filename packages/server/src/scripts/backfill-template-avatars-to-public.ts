#!/usr/bin/env node

/**
 * Backfill: Promote agent template avatar objects to the public prefix.
 *
 * Why:
 * - We no longer serve template avatars via `/api/v1/agent-templates/:id/avatar`.
 * - Public pages (landing/marketplace) should reference direct S3 URLs.
 * - Some older templates may still reference private/starship-scoped objects.
 *
 * What this does:
 * - Finds `marketing_content` rows for agent_template avatars whose `s3_key` is NOT under `public/agent-templates/`.
 * - Copies each object within the same S3 bucket into `public/agent-templates/<templateId>/...`.
 * - Updates the template's avatar storage pointer via `AgentTemplateRepository.updateAvatarStorage()`.
 *
 * Safe defaults:
 * - dry-run by default (no S3 copy, no DB writes)
 */

import { getEnvConfig } from '@starships/env';
import { AgentTemplateRepository, createConnection } from '@starships/models';
import { buildAgentTemplatePublicAvatarS3Key, copyObjectInS3 } from '@/utils/s3-helper';

type Args = {
  apply: boolean;
  limit?: number;
  concurrency: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--limit') args.limit = Number(argv[i + 1] ?? '');
    else if (a === '--concurrency') args.concurrency = Number(argv[i + 1] ?? '');
  }
  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit <= 0)) args.limit = undefined;
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1 || args.concurrency > 20) args.concurrency = 4;
  return args;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<void>
): Promise<void> {
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

type Row = {
  template_id: string;
  s3_key: string;
  mime_type: string | null;
  updated_at: Date | string | null;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = getEnvConfig();

  if (!env.AWS_S3_BUCKET || !env.AWS_S3_REGION) {
    throw new Error('AWS_S3_BUCKET/AWS_S3_REGION not configured');
  }

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

  const limitSql = args.limit ? `LIMIT ${Math.floor(args.limit)}` : '';

  const rows = (
    await pool.query(
      `
      SELECT
        entity_id AS template_id,
        s3_key,
        mime_type,
        updated_at
      FROM marketing_content
      WHERE entity_type = 'agent_template'
        AND content_type = 'avatar'
        AND s3_key IS NOT NULL
        AND s3_key NOT LIKE 'public/agent-templates/%'
      ORDER BY updated_at DESC
      ${limitSql}
      `
    )
  ).rows as Row[];

  console.log(
    `[backfill-template-avatars-to-public] candidates=${rows.length} apply=${args.apply} concurrency=${args.concurrency}` +
      (args.limit ? ` limit=${args.limit}` : '')
  );

  const repo = new AgentTemplateRepository();

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  await runWithConcurrency(rows, args.concurrency, async (row) => {
    processed++;
    try {
      const templateId = String(row.template_id || '').trim();
      const sourceKey = String(row.s3_key || '').trim();
      if (!templateId || !sourceKey) {
        skipped++;
        return;
      }
      if (sourceKey.startsWith('public/agent-templates/')) {
        skipped++;
        return;
      }

      const destKey = buildAgentTemplatePublicAvatarS3Key({ templateId, filename: 'avatar.png' });
      if (!args.apply) {
        updated++;
        console.log(`[dry-run] template=${templateId} ${sourceKey} -> ${destKey}`);
        return;
      }

      await copyObjectInS3({ sourceKey, destKey });
      await repo.updateAvatarStorage(templateId, {
        avatarS3Key: destKey,
        avatarMimeType: row.mime_type || 'image/png',
        avatarUpdatedAt: new Date().toISOString(),
      });

      updated++;
      console.log(`[updated] template=${templateId} ${sourceKey} -> ${destKey}`);
    } catch (e) {
      errors++;
      console.error(
        `[error] template=${row.template_id} key=${row.s3_key}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });

  console.log(
    `[backfill-template-avatars-to-public] done processed=${processed} updated=${updated} skipped=${skipped} errors=${errors}`
  );

  await db.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[backfill-template-avatars-to-public] fatal:', err instanceof Error ? err.stack || err.message : String(err));
    process.exit(1);
  });
}

