import { getConnection } from '@/helpers/database';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export class MigrationRunner {
  private migrationsPath = join(__dirname, '../migrations');

  private resolveMigrationModulePath(id: string): string | null {
    // When compiled, migrations are in dist/migrations/*.js
    const jsPath = join(this.migrationsPath, `${id}.js`);
    if (existsSync(jsPath)) return jsPath;
    // In dev (tsx), allow ts.
    const tsPath = join(this.migrationsPath, `${id}.ts`);
    if (existsSync(tsPath)) return tsPath;
    // Fallback to source path when running from dist/scripts
    const srcFallback = join(__dirname, '../../src/migrations', `${id}.ts`);
    if (existsSync(srcFallback)) return srcFallback;
    return null;
  }

  private listMigrationIds(): string[] {
    const dir = this.migrationsPath;
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir);
    return files
      .filter((f) => /^\d+_.+\.(ts|js)$/.test(f))
      .map((f) => f.replace(/\.(ts|js)$/, ''))
      .sort((a, b) => a.localeCompare(b));
  }

  private async ensureMigrationTable(): Promise<void> {
    await getConnection().query(`
      CREATE TABLE IF NOT EXISTS migration_history (
        migration_id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async isApplied(id: string): Promise<boolean> {
    const row = await getConnection().queryOne<{ migration_id: string }>(
      `SELECT migration_id FROM migration_history WHERE migration_id = $1`,
      [id]
    );
    return Boolean(row?.migration_id);
  }

  private async recordApplied(id: string): Promise<void> {
    await getConnection().query(`INSERT INTO migration_history (migration_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
  }

  async runAllPendingMigrations(): Promise<void> {
    await this.ensureMigrationTable();
    const all = this.listMigrationIds();
    for (const id of all) {
      // eslint-disable-next-line no-await-in-loop
      const applied = await this.isApplied(id);
      if (applied) continue;

      const modulePath = this.resolveMigrationModulePath(id);
      if (!modulePath) throw new Error(`Migration module not found for ${id}`);
      const mod = await import(modulePath);
      if (!mod || typeof mod.up !== 'function') throw new Error(`Migration ${id} must export async up(client)`);

      const client = await getConnection().getClient();
      try {
        await client.query('BEGIN');
        await mod.up(client);
        await client.query('COMMIT');
      } catch (e) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore
        }
        throw e;
      } finally {
        client.release();
      }

      // eslint-disable-next-line no-await-in-loop
      await this.recordApplied(id);
    }
  }
}

export const migrationRunner = new MigrationRunner();

