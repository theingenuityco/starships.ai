import type { ImportExportContainerV1 } from '@starships/protocol';

export type BundleManifestV1 = {
  schemaVersion: '1';
  kind: 'bundle';
  exportedAt: string;
  entities: Record<string, Array<{ kind: string; file: string; fromSlug?: unknown; fromStarshipSlug?: unknown }>>;
};

export type LoadedBundle = {
  manifest: BundleManifestV1;
  zipPath: string;
  containersByFile: Map<string, ImportExportContainerV1>;
  agents: Array<ImportExportContainerV1<'agent'>>;
  tools: Array<ImportExportContainerV1<'tool'>>;
  rooms: Array<ImportExportContainerV1<'room'>>;
  views: Array<ImportExportContainerV1<'view'>>;
  datasets: Array<ImportExportContainerV1<'dataset'>>;
  taskBoards: Array<ImportExportContainerV1<'task_board'>>;
};

export function getContainerSlug(container: ImportExportContainerV1): string | undefined {
  const slug = container.metadata?.fromSlug;
  return typeof slug === 'string' && slug.trim().length > 0 ? slug.trim() : undefined;
}

