import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

export interface BundleMeta {
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  kind?: 'room' | 'agent' | 'tool' | 'connector';
}

export interface BundleManifestEntity {
  kind: string;
  fromSlug?: string;
  fromStarshipSlug?: string;
  file: string;
}

export interface BundleManifest {
  schemaVersion: string;
  kind: 'bundle';
  exportedAt: string;
  entities: {
    agents?: BundleManifestEntity[];
    tools?: BundleManifestEntity[];
    rooms?: BundleManifestEntity[];
    views?: BundleManifestEntity[];
    tables?: BundleManifestEntity[];
    taskBoards?: BundleManifestEntity[];
    connectorTemplates?: BundleManifestEntity[];
  };
}

export interface BundleSummary {
  id: string;
  meta: BundleMeta;
  manifest: BundleManifest;
}

export class BundleRegistry {
  constructor(private readonly bundlesDir: string) {}

  list(): BundleSummary[] {
    if (!fs.existsSync(this.bundlesDir)) return [];

    const results: BundleSummary[] = [];
    for (const categoryEntry of fs.readdirSync(this.bundlesDir, { withFileTypes: true })) {
      if (!categoryEntry.isDirectory()) continue;
      const categoryDir = path.join(this.bundlesDir, categoryEntry.name);
      for (const bundleEntry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
        if (!bundleEntry.isDirectory()) continue;
        const summary = this.get(bundleEntry.name);
        if (summary) results.push(summary);
      }
    }
    return results;
  }

  get(id: string): BundleSummary | null {
    const bundleDir = this.resolveBundleDir(id);
    if (!bundleDir) return null;

    const manifestPath = path.join(bundleDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as BundleManifest;

    const metaPath = path.join(bundleDir, 'bundle.meta.json');
    const meta: BundleMeta = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as BundleMeta)
      : { name: id };

    return { id, meta, manifest };
  }

  getFile(id: string, filePath: string): Buffer | null {
    const bundleDir = this.resolveBundleDir(id);
    if (!bundleDir) return null;

    // Prevent path traversal
    const resolved = path.resolve(bundleDir, filePath);
    if (!resolved.startsWith(path.resolve(bundleDir) + path.sep) && resolved !== path.resolve(bundleDir)) {
      return null;
    }

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
    return fs.readFileSync(resolved);
  }

  createZip(id: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const bundleDir = this.resolveBundleDir(id);
      if (!bundleDir) {
        reject(new Error(`Bundle not found: ${id}`));
        return;
      }

      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      archive.directory(bundleDir, false);
      archive.finalize();
    });
  }

  private resolveBundleDir(id: string): string | null {
    // Prevent directory traversal via id
    if (id.includes('/') || id.includes('..') || id.startsWith('.')) return null;

    if (!fs.existsSync(this.bundlesDir)) return null;
    for (const categoryEntry of fs.readdirSync(this.bundlesDir, { withFileTypes: true })) {
      if (!categoryEntry.isDirectory()) continue;
      const candidate = path.join(this.bundlesDir, categoryEntry.name, id);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    }
    return null;
  }
}
