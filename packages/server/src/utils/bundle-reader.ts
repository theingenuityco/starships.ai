import fs from 'fs';
import path from 'path';

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
