import AdmZip from 'adm-zip';
import type { ImportExportContainerV1 } from '@starships/protocol';
import { BundleManifestV1, LoadedBundle } from '@/bundle/types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonOrThrow<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse JSON (${label}): ${msg}`);
  }
}

function parseManifestOrThrow(raw: string): BundleManifestV1 {
  const m = parseJsonOrThrow<unknown>(raw, 'manifest.json');
  if (!isPlainObject(m)) throw new Error('Invalid manifest.json: expected object');
  if (m.schemaVersion !== '1') throw new Error(`Invalid manifest.json: unsupported schemaVersion ${String(m.schemaVersion)}`);
  if (m.kind !== 'bundle') throw new Error(`Invalid manifest.json: expected kind=bundle, got ${String(m.kind)}`);
  if (typeof m.exportedAt !== 'string' || !m.exportedAt.trim()) throw new Error('Invalid manifest.json: exportedAt is required');
  if (!isPlainObject(m.entities)) throw new Error('Invalid manifest.json: entities is required');

  const entities: BundleManifestV1['entities'] = {};
  for (const [k, v] of Object.entries(m.entities)) {
    if (!Array.isArray(v)) continue;
    const list: BundleManifestV1['entities'][string] = [];
    for (const item of v) {
      if (!isPlainObject(item)) continue;
      const kind = item.kind;
      const file = item.file;
      if (typeof kind !== 'string' || !kind.trim()) continue;
      if (typeof file !== 'string' || !file.trim()) continue;
      list.push({
        kind,
        file,
        fromSlug: item.fromSlug,
        fromStarshipSlug: item.fromStarshipSlug,
      });
    }
    entities[k] = list;
  }

  return {
    schemaVersion: '1',
    kind: 'bundle',
    exportedAt: String(m.exportedAt),
    entities,
  };
}

function parseContainerOrThrow(raw: string, label: string): ImportExportContainerV1 {
  const c = parseJsonOrThrow<unknown>(raw, label);
  if (!isPlainObject(c)) throw new Error(`Invalid container (${label}): expected object`);
  if (c.schemaVersion !== '1') throw new Error(`Invalid container (${label}): unsupported schemaVersion ${String(c.schemaVersion)}`);
  const kind = c.kind;
  if (typeof kind !== 'string' || !kind.trim()) throw new Error(`Invalid container (${label}): kind is required`);
  const exportedAt = c.exportedAt;
  if (typeof exportedAt !== 'string' || !exportedAt.trim()) throw new Error(`Invalid container (${label}): exportedAt is required`);
  if (!('payload' in c)) throw new Error(`Invalid container (${label}): payload is required`);
  return c as unknown as ImportExportContainerV1;
}

export function loadBundleFromZip(zipPath: string): LoadedBundle {
  const zip = new AdmZip(zipPath);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    throw new Error('Bundle zip missing manifest.json');
  }

  const manifestRaw = manifestEntry.getData().toString('utf8');
  const manifest = parseManifestOrThrow(manifestRaw);

  const containersByFile = new Map<string, ImportExportContainerV1>();
  const wantFiles = new Set<string>();
  for (const list of Object.values(manifest.entities)) {
    for (const it of list) {
      if (it?.file) wantFiles.add(it.file);
    }
  }

  for (const file of wantFiles) {
    const entry = zip.getEntry(file);
    if (!entry) {
      throw new Error(`Bundle zip missing referenced file: ${file}`);
    }
    const raw = entry.getData().toString('utf8');
    const container = parseContainerOrThrow(raw, file);
    containersByFile.set(file, container);
  }

  const pick = <K extends ImportExportContainerV1['kind']>(
    sectionKey: string,
    expectedKind: K
  ): Array<ImportExportContainerV1<K>> => {
    const list = manifest.entities[sectionKey];
    if (!Array.isArray(list) || list.length === 0) return [];
    const out: Array<ImportExportContainerV1<K>> = [];
    for (const it of list) {
      const c = containersByFile.get(it.file);
      if (!c) continue;
      if (c.kind !== expectedKind) continue;
      out.push(c as ImportExportContainerV1<K>);
    }
    return out;
  };

  return {
    manifest,
    zipPath,
    containersByFile,
    agents: pick('agents', 'agent'),
    tools: pick('tools', 'tool'),
    rooms: pick('rooms', 'room'),
    views: pick('views', 'view'),
    datasets: pick('datasets', 'dataset'),
    taskBoards: pick('taskBoards', 'task_board'),
  };
}

