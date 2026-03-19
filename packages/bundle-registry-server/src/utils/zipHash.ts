import crypto from 'crypto';
import AdmZip from 'adm-zip';

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Stable content hash for a zip artifact.
 *
 * This avoids raw zip-byte instability by hashing the sorted entry names and their bytes.
 */
export function computeZipContentHash(zipBuffer: Buffer): { artifactSha256: string; contentSha256: string; fileCount: number } {
  const artifactSha256 = sha256Hex(zipBuffer);

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const names = entries.map((e) => e.entryName).sort((a, b) => a.localeCompare(b));

  const h = crypto.createHash('sha256');
  for (const name of names) {
    const entry = zip.getEntry(name);
    if (!entry || entry.isDirectory) continue;
    h.update(name, 'utf8');
    h.update('\n', 'utf8');
    h.update(entry.getData());
    h.update('\n', 'utf8');
  }

  return { artifactSha256, contentSha256: h.digest('hex'), fileCount: names.length };
}

