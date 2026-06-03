/**
 * One-time bootstrap: create the shared agent LOGIN role that backs the
 * per-starship read-only SQL surface.
 *
 * This role is intentionally powerless on its own:
 *  - NOINHERIT  => it gains NO privileges until it `SET ROLE ship_ro_<id>`,
 *                  and then exactly that per-starship role's privileges. This
 *                  is what makes cross-starship isolation a Postgres guarantee.
 *  - no grants on `public`, read-only transactions, tight statement_timeout.
 *
 * Per-starship schemas/roles are provisioned at runtime by
 * StarshipDatabaseProvisioner (lazily, on first Table use).
 *
 * Run as a superuser / role with CREATEROLE:
 *   pnpm --filter @starships/models provision:agent-role
 *
 * Requires POSTGRES_AGENT_USER (default 'starships_agent') and
 * POSTGRES_AGENT_PASSWORD in the environment.
 */
import { getEnvConfig } from '@starships/env';
import { createConnection } from '@/helpers/database';

/** Escape a value as a single-quoted SQL string literal. */
function sqlLiteral(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Quote a SQL identifier. */
function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export async function provisionAgentRole(): Promise<void> {
  const env = getEnvConfig();
  const user = env.POSTGRES_AGENT_USER;
  const password = env.POSTGRES_AGENT_PASSWORD;

  if (!user) throw new Error('POSTGRES_AGENT_USER is required');
  if (!password) throw new Error('POSTGRES_AGENT_PASSWORD is required to create the agent login role');

  const role = quoteIdent(user);
  const pw = sqlLiteral(password);

  const db = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });

  await db.connect();
  try {
    // Defense in depth: nobody gets implicit access to public.
    await db.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');

    const exists = await db.queryOne<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists',
      [user]
    );

    if (!exists?.exists) {
      await db.query(`CREATE ROLE ${role} LOGIN NOINHERIT PASSWORD ${pw}`);
      console.log(`✅ Created agent login role ${user}`);
    } else {
      await db.query(`ALTER ROLE ${role} LOGIN NOINHERIT PASSWORD ${pw}`);
      console.log(`✅ Updated agent login role ${user}`);
    }

    await db.query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
    await db.query(`ALTER ROLE ${role} SET statement_timeout = '10s'`);
    await db.query(`ALTER ROLE ${role} SET default_transaction_read_only = on`);

    console.log('✅ Agent role bootstrap complete (NOINHERIT, read-only, no public access)');
  } finally {
    await db.disconnect();
  }
}

if (require.main === module) {
  provisionAgentRole().catch((err) => {
    console.error('❌ Agent role bootstrap failed:', err);
    process.exit(1);
  });
}
