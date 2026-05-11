import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

export interface BundleEntry {
  getData(): Buffer;
}

export interface BundleReader {
  getEntry(filePath: string): BundleEntry | null;
}

export class DirectoryBundleReader implements BundleReader {
  constructor(private readonly rootDir: string) {}

  getEntry(relativePath: string): BundleEntry | null {
    const full = path.resolve(this.rootDir, relativePath);
    if (!full.startsWith(path.resolve(this.rootDir) + path.sep)) return null;
    if (!fs.existsSync(full)) return null;
    return { getData: () => fs.readFileSync(full) };
  }
}

/**
 * Downloads a bundle ZIP from the bundle service and delegates to DirectoryBundleReader.
 * Call RemoteBundleReader.create() to fetch and extract, then use getEntry() normally.
 */
export class RemoteBundleReader implements BundleReader {
  private constructor(
    private readonly delegate: DirectoryBundleReader,
    private readonly tempDir: string
  ) {}

  static async create(serviceUrl: string, bundleId: string): Promise<RemoteBundleReader> {
    const url = `${serviceUrl.replace(/\/$/, '')}/api/v1/bundles/${encodeURIComponent(bundleId)}/download`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Bundle service returned ${response.status} for bundle "${bundleId}"`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `starships-bundle-${bundleId}-`));

    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);

    return new RemoteBundleReader(new DirectoryBundleReader(tempDir), tempDir);
  }

  getEntry(filePath: string): BundleEntry | null {
    return this.delegate.getEntry(filePath);
  }

  cleanup(): void {
    fs.rmSync(this.tempDir, { recursive: true, force: true });
  }
}
