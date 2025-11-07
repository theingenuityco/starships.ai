import { Client } from 'pg';
import { getEnvConfig } from '@starships/env';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  return { dryRun };
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sortByPrefix(files: string[]): string[] {
  const parsePrefix = (f: string) => {
    const m = f.match(/^(\d+)[-_]/);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };
  return files.sort((a, b) => parsePrefix(a) - parsePrefix(b) || a.localeCompare(b));
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client: Client): Promise<Record<string, string>> {
  const res = await client.query('SELECT name, checksum FROM schema_migrations');
  const map: Record<string, string> = {};
  for (const row of res.rows) map[row.name] = row.checksum;
  return map;
}

// NOTE: SQL file support removed; all migrations must be JS/TS exporting up(client)

async function applyJs(client: Client, name: string, jsPath: string, dryRun: boolean) {
  const content = fs.readFileSync(jsPath, 'utf8');
  const checksum = sha256(content);
  if (dryRun) {
    console.log(`[DRY-RUN] Would apply JS migration: ${name}`);
    return { name, checksum };
  }
  const mod = await import(jsPath);
  if (!mod || typeof mod.up !== 'function') {
    throw new Error(`Migration ${name} does not export an async function up(client)`);
  }
  await client.query('BEGIN');
  try {
    await mod.up(client);
    await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1,$2)', [name, checksum]);
    await client.query('COMMIT');
    console.log(`[APPLIED] ${name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  return { name, checksum };
}

async function main() {
  const { dryRun } = parseArgs();
  const env = getEnvConfig();
  const client = new Client({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  await ensureMigrationsTable(client);

  const applied = await getApplied(client);

  // Discover JS migrations only (tracked)
  const jsDir = path.resolve(__dirname, '../migrations');
  const jsFiles = fs.existsSync(jsDir)
    ? sortByPrefix(
        fs
          .readdirSync(jsDir)
          .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
          .map((f) => path.join(jsDir, f))
      )
    : [];

  // Apply JS migrations (tracked)
  for (const fullPath of jsFiles) {
    const name = path.basename(fullPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const checksum = sha256(content);
    if (applied[name] && applied[name] === checksum) continue;
    await applyJs(client, name, fullPath, dryRun);
  }

  await client.end();
  console.log('✅ Migrations complete');
}

main().catch((err) => {
  console.error('❌ Migration runner failed:', err?.message || err);
  process.exit(1);
});
