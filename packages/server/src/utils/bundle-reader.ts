import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export interface BundleEntry {
  getData(): Buffer;
}

export interface BundleReader {
  getEntry(filePath: string): BundleEntry | null;
}

export class ZipBundleReader implements BundleReader {
  constructor(private readonly zip: AdmZip) {}

  getEntry(filePath: string): BundleEntry | null {
    const direct = this.zip.getEntry(filePath);
    if (direct) return direct;
    const normalized = filePath.replace(/^[./]+/, '');
    for (const entry of this.zip.getEntries()) {
      const name = entry.entryName.replace(/^[./]+/, '');
      if (name === normalized || name.endsWith('/' + normalized)) return entry;
    }
    return null;
  }
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
