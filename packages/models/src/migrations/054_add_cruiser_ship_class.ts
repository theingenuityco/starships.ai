import type { Client } from 'pg';

/**
 * Adds 'cruiser' to the starships.ship_class CHECK constraint.
 *
 * Note: ship_class was introduced with an inline CHECK in migration 053, which usually
 * auto-generates a constraint named `starships_ship_class_check`. We drop that constraint
 * if present and recreate it with the expanded enum set.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Drop existing check constraint if it exists (common auto name).
    await client.query(`ALTER TABLE starships DROP CONSTRAINT IF EXISTS starships_ship_class_check;`);

    // Defensive: drop any other CHECK constraints on ship_class (in case naming differs).
    await client.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'starships'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%ship_class%'
        LOOP
          EXECUTE format('ALTER TABLE starships DROP CONSTRAINT IF EXISTS %I', r.conname);
        END LOOP;
      END $$;
    `);

    // Recreate the constraint with the new class allowed.
    await client.query(`
      ALTER TABLE starships
        ADD CONSTRAINT starships_ship_class_check CHECK (ship_class IN ('scout','frigate','cruiser'));
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // On downgrade, coerce cruiser ships to frigate (safe default) before tightening constraint.
    await client.query(`
      UPDATE starships
         SET ship_class = 'frigate',
             updated_at = NOW()
       WHERE ship_class = 'cruiser';
    `);

    await client.query(`ALTER TABLE starships DROP CONSTRAINT IF EXISTS starships_ship_class_check;`);

    await client.query(`
      ALTER TABLE starships
        ADD CONSTRAINT starships_ship_class_check CHECK (ship_class IN ('scout','frigate'));
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
