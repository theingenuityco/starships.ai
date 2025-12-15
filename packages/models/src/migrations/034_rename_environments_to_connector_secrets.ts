import type { Client } from 'pg';

/**
 * Rename the encrypted per-starship secrets table from `environments` to `connector_secrets`.
 *
 * IMPORTANT:
 * - This migration is forward-only (no edits to old migrations).
 * - This is the DB-backed encrypted store used by connectors/runtime.
 * - This is NOT related to process environment variables or @starships/env.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    // NOTE: In this repo, migrations are executed via the models connection wrapper,
    // but older migrations type the parameter as `pg.Client`. To keep this migration
    // compatible (and type-safe), read rows from either shape:
    // - pg.Client: QueryResult<{ exists: boolean }> with `.rows`
    // - models connection: Array<{ exists: boolean }>
    const readExists = (result: unknown): boolean => {
      if (Array.isArray(result)) return Boolean((result as Array<{ exists?: boolean }>)[0]?.exists);
      const rows = (result as { rows?: Array<{ exists?: boolean }> } | null | undefined)?.rows;
      return Boolean(rows?.[0]?.exists);
    };

    // Guard: avoid ambiguous state.
    const envExistsResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'environments'
      ) AS exists`
    );
    const envExists = readExists(envExistsResult);

    const secretsExistsResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'connector_secrets'
      ) AS exists`
    );
    const secretsExists = readExists(secretsExistsResult);

    if (envExists && secretsExists) {
      throw new Error('Both tables exist: environments and connector_secrets. Refusing to continue.');
    }

    if (envExists && !secretsExists) {
      console.log('🚀 Renaming environments -> connector_secrets ...');
      await client.query('ALTER TABLE environments RENAME TO connector_secrets');
    } else {
      console.log('ℹ️  Skipping table rename (environments missing or connector_secrets already present)');
    }

    // Best-effort index renames (Postgres does not rename index identifiers automatically).
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_environments_starship_id') THEN
          ALTER INDEX idx_environments_starship_id RENAME TO idx_connector_secrets_starship_id;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_environments_key') THEN
          ALTER INDEX idx_environments_key RENAME TO idx_connector_secrets_key;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_environments_created_by') THEN
          ALTER INDEX idx_environments_created_by RENAME TO idx_connector_secrets_created_by;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_environments_connector_id') THEN
          ALTER INDEX idx_environments_connector_id RENAME TO idx_connector_secrets_connector_id;
        END IF;
      END $$;
    `);

    // Best-effort unique constraint rename on (starship_id, key)
    await client.query(`
      DO $$
      DECLARE
        target_name text := 'connector_secrets_starship_id_key_key';
        c record;
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'connector_secrets'::regclass
            AND conname = target_name
        ) THEN
          RETURN;
        END IF;

        FOR c IN (
          SELECT oid, conname
          FROM pg_constraint
          WHERE conrelid = 'connector_secrets'::regclass
            AND contype = 'u'
        ) LOOP
          IF pg_get_constraintdef(c.oid) LIKE '%(starship_id, key)%' THEN
            EXECUTE format('ALTER TABLE connector_secrets RENAME CONSTRAINT %I TO %I', c.conname, target_name);
            EXIT;
          END IF;
        END LOOP;
      END $$;
    `);

    await client.query(`
      COMMENT ON TABLE connector_secrets IS 'Encrypted secrets scoped to starships (connector-managed + user-managed)';
    `);

    await client.query('COMMIT');
    console.log('✅ Renamed environments -> connector_secrets');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to rename environments -> connector_secrets:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    const readExists = (result: unknown): boolean => {
      if (Array.isArray(result)) return Boolean((result as Array<{ exists?: boolean }>)[0]?.exists);
      const rows = (result as { rows?: Array<{ exists?: boolean }> } | null | undefined)?.rows;
      return Boolean(rows?.[0]?.exists);
    };

    const secretsExistsResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'connector_secrets'
      ) AS exists`
    );
    const secretsExists = readExists(secretsExistsResult);

    const envExistsResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'environments'
      ) AS exists`
    );
    const envExists = readExists(envExistsResult);

    if (envExists && secretsExists) {
      throw new Error('Both tables exist: environments and connector_secrets. Refusing to continue.');
    }

    if (secretsExists && !envExists) {
      console.log('🔄 Renaming connector_secrets -> environments ...');
      await client.query('ALTER TABLE connector_secrets RENAME TO environments');
    } else {
      console.log('ℹ️  Skipping table rename (connector_secrets missing or environments already present)');
    }

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_connector_secrets_starship_id') THEN
          ALTER INDEX idx_connector_secrets_starship_id RENAME TO idx_environments_starship_id;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_connector_secrets_key') THEN
          ALTER INDEX idx_connector_secrets_key RENAME TO idx_environments_key;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_connector_secrets_created_by') THEN
          ALTER INDEX idx_connector_secrets_created_by RENAME TO idx_environments_created_by;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_connector_secrets_connector_id') THEN
          ALTER INDEX idx_connector_secrets_connector_id RENAME TO idx_environments_connector_id;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      DECLARE
        target_name text := 'environments_starship_id_key_key';
        c record;
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'environments'::regclass
            AND conname = target_name
        ) THEN
          RETURN;
        END IF;

        FOR c IN (
          SELECT oid, conname
          FROM pg_constraint
          WHERE conrelid = 'environments'::regclass
            AND contype = 'u'
        ) LOOP
          IF pg_get_constraintdef(c.oid) LIKE '%(starship_id, key)%' THEN
            EXECUTE format('ALTER TABLE environments RENAME CONSTRAINT %I TO %I', c.conname, target_name);
            EXIT;
          END IF;
        END LOOP;
      END $$;
    `);

    await client.query(`
      COMMENT ON TABLE environments IS 'Environment variables scoped to starships with encryption';
    `);

    await client.query('COMMIT');
    console.log('✅ Renamed connector_secrets -> environments');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to rename connector_secrets -> environments:', error);
    throw error;
  }
}
