import * as path from 'path';
import * as fs from 'fs-extra';
import { getEnvConfig } from '@starships/env';
import { assertSafeId } from '@/helpers/starship-tables/identifiers';

/**
 * Provisions the per-starship definition VOLUME: a durable directory
 * `$STARSHIP_HOME/<starshipId>/.autopilot/` that is the filesystem-authoritative
 * source of truth for the definition plane (agents/connectors/rooms/tables/
 * schedules). The Postgres tables become a derived index reconciled from here.
 *
 * This is the filesystem counterpart to {@link StarshipDatabaseProvisioner}
 * (which provisions the per-starship Postgres schema `db_<starshipId>`). Like
 * that provisioner, all methods are idempotent and provisioning is lazy: call
 * {@link ensureProvisioned} before the first definition write.
 *
 * The volume MUST live on a non-reaped path distinct from the ephemeral
 * workspace (`RUNNER_JOB_BASE_DIR`); see the `STARSHIP_HOME` env doc.
 */

/** Subdirectories of `.autopilot/` holding one file per definition entity. */
export const DEFINITION_ENTITY_DIRS = ['agents', 'connectors', 'rooms', 'tables', 'schedules'] as const;
export type DefinitionEntityDir = (typeof DEFINITION_ENTITY_DIRS)[number];

/** Root directory under which every starship volume lives (`$STARSHIP_HOME`). */
export function starshipHomeRoot(): string {
  return getEnvConfig().STARSHIP_HOME;
}

/** The durable root of a single starship's volume: `$STARSHIP_HOME/<starshipId>`. */
export function starshipVolumeRoot(starshipId: string, home: string = starshipHomeRoot()): string {
  return path.join(home, assertSafeId(starshipId, 'starshipId'));
}

/** The definition directory inside a starship volume: `.../<starshipId>/.autopilot`. */
export function starshipDefinitionDir(starshipId: string, home: string = starshipHomeRoot()): string {
  return path.join(starshipVolumeRoot(starshipId, home), '.autopilot');
}

export class StarshipVolumeProvisioner {
  private readonly home: string;

  /** @param home Override the volume root (defaults to `$STARSHIP_HOME`). Mainly for tests. */
  constructor(home?: string) {
    this.home = home ?? starshipHomeRoot();
  }

  /** Absolute `.autopilot/` dir for a starship. */
  definitionDir(starshipId: string): string {
    return starshipDefinitionDir(starshipId, this.home);
  }

  /** Idempotently create `.autopilot/` and every entity subdirectory. */
  async ensureProvisioned(starshipId: string): Promise<void> {
    assertSafeId(starshipId, 'starshipId');
    const defDir = this.definitionDir(starshipId);
    await fs.ensureDir(defDir);
    await Promise.all(DEFINITION_ENTITY_DIRS.map((dir) => fs.ensureDir(path.join(defDir, dir))));
  }

  /** Whether the starship's `.autopilot/` directory already exists. */
  async isProvisioned(starshipId: string): Promise<boolean> {
    return fs.pathExists(this.definitionDir(starshipId));
  }

  /** Remove the starship's entire volume. Used when a starship is deleted. */
  async deprovision(starshipId: string): Promise<void> {
    await fs.remove(starshipVolumeRoot(starshipId, this.home));
  }
}

export default StarshipVolumeProvisioner;
