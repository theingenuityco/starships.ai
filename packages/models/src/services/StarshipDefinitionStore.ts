import * as path from 'path';
import * as fs from 'fs-extra';
import { assertSafeId } from '@/helpers/starship-tables/identifiers';
import {
  DEFINITION_ENTITY_DIRS,
  StarshipVolumeProvisioner,
  starshipDefinitionDir,
  starshipHomeRoot,
  type DefinitionEntityDir,
} from '@/services/StarshipVolumeProvisioner';

/**
 * The filesystem abstraction over a starship's definition volume. Reads, writes,
 * lists, and deletes raw definition files under `.starship/<entity>/`. It knows
 * nothing about Postgres or entity schemas: codecs turn domain models into the
 * string content this store persists, and the reconciler folds files into the
 * index. Writes are atomic (tmp + rename) so a crash never leaves a torn file.
 */

/** A located definition file: which entity bucket + its filename (with extension). */
export interface DefinitionFileRef {
  entity: DefinitionEntityDir;
  filename: string;
}

/** Reject filenames that could escape the entity directory. */
function assertSafeFilename(filename: string): string {
  const name = String(filename ?? '').trim();
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error(`Unsafe definition filename: ${JSON.stringify(filename)}`);
  }
  return name;
}

let tmpCounter = 0;

/**
 * Per-path write serialization (in-process). Atomic tmp+rename already prevents
 * torn files; this additionally chains concurrent writes to the SAME path so
 * they apply in call order (deterministic last-write-wins) rather than racing
 * their tmp files. Cross-process/multi-host serialization (DB advisory locks)
 * is a deferred follow-up — see project notes.
 */
const writeChains = new Map<string, Promise<unknown>>();

export class StarshipDefinitionStore {
  private readonly home: string;
  private readonly provisioner: StarshipVolumeProvisioner;

  /** @param home Override the volume root (defaults to `$STARSHIP_HOME`). Mainly for tests. */
  constructor(home?: string) {
    this.home = home ?? starshipHomeRoot();
    this.provisioner = new StarshipVolumeProvisioner(this.home);
  }

  /** Ensure the volume + entity directories exist. */
  async ensureProvisioned(starshipId: string): Promise<void> {
    await this.provisioner.ensureProvisioned(starshipId);
  }

  private entityDir(starshipId: string, entity: DefinitionEntityDir): string {
    assertSafeId(starshipId, 'starshipId');
    return path.join(starshipDefinitionDir(starshipId, this.home), entity);
  }

  /** Resolve a file inside an entity dir, rejecting anything that escapes it. */
  private resolveFile(starshipId: string, entity: DefinitionEntityDir, filename: string): string {
    const dir = path.resolve(this.entityDir(starshipId, entity));
    const resolved = path.resolve(dir, assertSafeFilename(filename));
    if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
      throw new Error(`definition file '${filename}' escapes its entity directory`);
    }
    return resolved;
  }

  /** Atomically write a definition file (creating the entity dir if needed). */
  async write(starshipId: string, entity: DefinitionEntityDir, filename: string, content: string): Promise<void> {
    const target = this.resolveFile(starshipId, entity, filename);
    // Serialize concurrent writers to the same path (see writeChains).
    const prev = writeChains.get(target) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => this.doWrite(target, content));
    writeChains.set(target, next);
    try {
      await next;
    } finally {
      if (writeChains.get(target) === next) writeChains.delete(target);
    }
  }

  private async doWrite(target: string, content: string): Promise<void> {
    await fs.ensureDir(path.dirname(target));
    // Same-directory temp file so rename() is atomic on the same filesystem.
    const tmp = `${target}.tmp-${process.pid}-${tmpCounter++}`;
    try {
      await fs.writeFile(tmp, content, 'utf-8');
      await fs.rename(tmp, target);
    } catch (error) {
      await fs.remove(tmp).catch(() => undefined);
      throw error;
    }
  }

  /** Read a definition file, or null if it does not exist. */
  async read(starshipId: string, entity: DefinitionEntityDir, filename: string): Promise<string | null> {
    const target = this.resolveFile(starshipId, entity, filename);
    try {
      return await fs.readFile(target, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async exists(starshipId: string, entity: DefinitionEntityDir, filename: string): Promise<boolean> {
    return fs.pathExists(this.resolveFile(starshipId, entity, filename));
  }

  /**
   * List definition filenames in an entity bucket. Returns plain filenames
   * (e.g. `researcher.md`), skipping in-flight temp files and dotfiles.
   * Optionally filter by extension (e.g. `.md`, `.yaml`).
   */
  async list(starshipId: string, entity: DefinitionEntityDir, ext?: string): Promise<string[]> {
    const dir = this.entityDir(starshipId, entity);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
      throw error;
    }
    return entries
      .filter((name) => !name.startsWith('.') && !name.includes('.tmp-'))
      .filter((name) => (ext ? name.endsWith(ext) : true))
      .sort();
  }

  /** List every definition file across all entity buckets. */
  async listAll(starshipId: string): Promise<DefinitionFileRef[]> {
    const perEntity = await Promise.all(
      DEFINITION_ENTITY_DIRS.map(async (entity) => (await this.list(starshipId, entity)).map((filename) => ({ entity, filename })))
    );
    return perEntity.flat();
  }

  /** Delete a definition file. Returns false if it did not exist. */
  async delete(starshipId: string, entity: DefinitionEntityDir, filename: string): Promise<boolean> {
    const target = this.resolveFile(starshipId, entity, filename);
    if (!(await fs.pathExists(target))) return false;
    await fs.remove(target);
    return true;
  }
}

export default StarshipDefinitionStore;
