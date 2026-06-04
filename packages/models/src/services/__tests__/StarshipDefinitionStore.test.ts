import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { StarshipDefinitionStore } from '@/services/StarshipDefinitionStore';
import { StarshipVolumeProvisioner, starshipDefinitionDir } from '@/services/StarshipVolumeProvisioner';

describe('StarshipDefinitionStore', () => {
  let home: string;
  let store: StarshipDefinitionStore;
  const starshipId = 'shp_test123';

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'starship-home-'));
    store = new StarshipDefinitionStore(home);
    await store.ensureProvisioned(starshipId);
  });

  afterEach(async () => {
    await fs.remove(home);
  });

  it('provisions the entity directories', async () => {
    const defDir = starshipDefinitionDir(starshipId, home);
    for (const dir of ['agents', 'connectors', 'rooms', 'tables', 'schedules']) {
      expect(await fs.pathExists(path.join(defDir, dir))).toBe(true);
    }
  });

  it('writes and reads a file', async () => {
    await store.write(starshipId, 'agents', 'researcher.md', 'hello');
    expect(await store.read(starshipId, 'agents', 'researcher.md')).toBe('hello');
  });

  it('returns null reading a missing file', async () => {
    expect(await store.read(starshipId, 'agents', 'nope.md')).toBeNull();
  });

  it('overwrites atomically and leaves no temp files', async () => {
    await store.write(starshipId, 'agents', 'a.md', 'v1');
    await store.write(starshipId, 'agents', 'a.md', 'v2');
    expect(await store.read(starshipId, 'agents', 'a.md')).toBe('v2');
    const files = await store.list(starshipId, 'agents');
    expect(files).toEqual(['a.md']);
  });

  it('lists files filtered by extension, skipping dotfiles', async () => {
    await store.write(starshipId, 'agents', 'b.md', 'x');
    await store.write(starshipId, 'agents', 'a.md', 'x');
    await store.write(starshipId, 'connectors', 'github.yaml', 'x');
    expect(await store.list(starshipId, 'agents', '.md')).toEqual(['a.md', 'b.md']);
    expect(await store.list(starshipId, 'agents', '.yaml')).toEqual([]);
  });

  it('listAll spans entity buckets', async () => {
    await store.write(starshipId, 'agents', 'a.md', 'x');
    await store.write(starshipId, 'schedules', 's1.yaml', 'x');
    const all = await store.listAll(starshipId);
    expect(all).toContainEqual({ entity: 'agents', filename: 'a.md' });
    expect(all).toContainEqual({ entity: 'schedules', filename: 's1.yaml' });
  });

  it('deletes files and reports prior existence', async () => {
    await store.write(starshipId, 'agents', 'a.md', 'x');
    expect(await store.delete(starshipId, 'agents', 'a.md')).toBe(true);
    expect(await store.delete(starshipId, 'agents', 'a.md')).toBe(false);
    expect(await store.read(starshipId, 'agents', 'a.md')).toBeNull();
  });

  it('rejects path traversal in filenames', async () => {
    await expect(store.write(starshipId, 'agents', '../escape.md', 'x')).rejects.toThrow(/Unsafe|escape/);
    await expect(store.read(starshipId, 'agents', '../../etc/passwd')).rejects.toThrow(/Unsafe|escape/);
  });

  it('deprovision removes the whole volume', async () => {
    await store.write(starshipId, 'agents', 'a.md', 'x');
    await new StarshipVolumeProvisioner(home).deprovision(starshipId);
    expect(await fs.pathExists(path.join(home, starshipId))).toBe(false);
  });
});
