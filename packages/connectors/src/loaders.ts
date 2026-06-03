/**
 * Loaders for declarative connector templates on disk. Replicates the bundle-service
 * scan (bundles/<category>/<bundle>/manifest.json -> entities.connectorTemplates[].file)
 * so the server can register the existing connector JSON into the in-process registry
 * without a bundle-service round trip.
 */

import fs from 'fs';
import path from 'path';
import type { ConnectorTemplateContainer } from './adapter/fromTemplate';

interface ManifestLike {
  entities?: {
    connectorTemplates?: Array<{ file?: string }>;
  };
}

/** Scan a bundles root directory and return every connector template container found. */
export function loadTemplateContainersFromDir(bundlesDir: string): ConnectorTemplateContainer[] {
  if (!fs.existsSync(bundlesDir)) return [];

  const results: ConnectorTemplateContainer[] = [];
  const bundleDirs: string[] = [];

  for (const categoryEntry of fs.readdirSync(bundlesDir, { withFileTypes: true })) {
    if (!categoryEntry.isDirectory()) continue;
    const categoryDir = path.join(bundlesDir, categoryEntry.name);
    for (const bundleEntry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (bundleEntry.isDirectory()) bundleDirs.push(path.join(categoryDir, bundleEntry.name));
    }
  }

  for (const bundleDir of bundleDirs) {
    const manifestPath = path.join(bundleDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest: ManifestLike;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ManifestLike;
    } catch {
      continue;
    }

    const entities = manifest.entities?.connectorTemplates;
    if (!Array.isArray(entities) || entities.length === 0) continue;

    for (const entity of entities) {
      if (!entity.file) continue;
      // Prevent path traversal outside the bundle directory.
      const resolved = path.resolve(bundleDir, entity.file);
      if (!resolved.startsWith(path.resolve(bundleDir) + path.sep)) continue;
      if (!fs.existsSync(resolved)) continue;

      try {
        const container = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as ConnectorTemplateContainer;
        if (container.kind === 'connector_template' && container.payload?.connectorTemplate) {
          results.push(container);
        }
      } catch {
        continue;
      }
    }
  }

  return results;
}
