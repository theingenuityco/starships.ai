#!/usr/bin/env node

/**
 * Backfill connector webhook bindings from existing connectors.metadata.
 *
 * This populates connector_webhook_bindings so global connector webhooks can route
 * (provider, externalAccountId) -> connectorId[] without relying on re-connect.
 *
 * Safe defaults:
 * - dry-run by default (no DB writes)
 */

import { getEnvConfig } from '@starships/env';
import {
  ConnectorTemplateRepository,
  ConnectorWebhookBindingRepository,
  createConnection,
} from '@starships/models';

type Args = {
  apply: boolean;
  limit?: number;
  provider?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--limit') args.limit = Number(argv[i + 1] ?? '');
    else if (a === '--provider') args.provider = String(argv[i + 1] ?? '');
  }

  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit <= 0)) args.limit = undefined;
  if (args.provider && args.provider.trim().length === 0) args.provider = undefined;
  return args;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function coerceNonEmptyString(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function getMetadataKeyFromTemplateWebhooksJson(webhooksJson: unknown): string {
  if (!isRecord(webhooksJson)) return '';
  const routing = webhooksJson.routing;
  if (!isRecord(routing)) return '';
  return coerceNonEmptyString(routing.fromConnectorMetadataKey);
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

  const templateRepo = new ConnectorTemplateRepository();
  const bindingRepo = new ConnectorWebhookBindingRepository();

  const templates = await templateRepo.list();
  const templateByProvider = new Map(templates.map((t) => [String(t.provider), t]));

  const where: string[] = [];
  const params: unknown[] = [];
  if (args.provider) {
    params.push(args.provider);
    where.push(`provider = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limitSql = args.limit ? `LIMIT ${Math.floor(args.limit)}` : '';

  const rows = await db.query<{ id: string; starship_id: string; provider: string; metadata: unknown }>(
    `
    SELECT id, starship_id, provider, metadata
    FROM connectors
    ${whereSql}
    ORDER BY created_at ASC
    ${limitSql}
    `,
    params
  );

  let scanned = 0;
  let eligible = 0;
  let upserted = 0;
  let skippedMissingKey = 0;
  let skippedMissingValue = 0;
  let errors = 0;

  for (const row of rows) {
    scanned++;
    const provider = String(row.provider || '').trim();
    const template = templateByProvider.get(provider);
    if (!template) {
      skippedMissingKey++;
      continue;
    }

    const metadataKey = getMetadataKeyFromTemplateWebhooksJson(template.webhooksJson);
    if (!metadataKey) {
      skippedMissingKey++;
      continue;
    }

    const metadata = isRecord(row.metadata) ? (row.metadata as Record<string, unknown>) : {};
    const externalAccountId = coerceNonEmptyString(metadata[metadataKey]);
    if (!externalAccountId) {
      skippedMissingValue++;
      continue;
    }

    eligible++;
    if (!args.apply) {
      upserted++;
      console.log(`[dry-run] binding provider=${provider} externalAccountId=${externalAccountId} connectorId=${row.id} starshipId=${row.starship_id}`);
      continue;
    }

    try {
      await bindingRepo.upsert({
        provider,
        externalAccountId,
        connectorId: String(row.id),
        starshipId: String(row.starship_id),
      });
      upserted++;
    } catch (err) {
      errors++;
      console.error(
        `[error] provider=${provider} connectorId=${row.id} starshipId=${row.starship_id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log(
    `[backfill-connector-webhook-bindings] done scanned=${scanned} eligible=${eligible} upserted=${upserted} skippedMissingKey=${skippedMissingKey} skippedMissingValue=${skippedMissingValue} errors=${errors} apply=${args.apply}` +
      (args.provider ? ` provider=${args.provider}` : '') +
      (args.limit ? ` limit=${args.limit}` : '')
  );

  await db.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[backfill-connector-webhook-bindings] fatal:', err instanceof Error ? err.stack || err.message : String(err));
    process.exit(1);
  });
}

