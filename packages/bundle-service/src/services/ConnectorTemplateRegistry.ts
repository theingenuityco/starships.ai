import fs from 'fs';
import path from 'path';
import type { BundleManifest } from './BundleRegistry';

export interface ConnectorTemplatePayload {
  connectorTemplate: {
    id: string;
    slug: string;
    provider: string;
    name: string;
    description: string;
    isEnabled: boolean;
    version: string;
    category: string;
    baseUrl: string;
    auth: Record<string, unknown>;
    variables?: unknown[];
    rateLimit?: Record<string, unknown>;
    metadataSchema?: Record<string, unknown>;
    demoVideoUrl?: string;
    webhooks?: Record<string, unknown>;
  };
  actions?: unknown[];
}

export interface ConnectorTemplateContainer {
  schemaVersion: '1';
  kind: 'connector_template';
  exportedAt: string;
  metadata?: Record<string, unknown>;
  source?: { app?: string; version?: string };
  payload: ConnectorTemplatePayload;
}

export class ConnectorTemplateRegistry {
  constructor(private readonly bundlesDir: string) {}

  list(): ConnectorTemplateContainer[] {
    if (!fs.existsSync(this.bundlesDir)) return [];

    const results: ConnectorTemplateContainer[] = [];

    const entries = fs.readdirSync(this.bundlesDir, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const entry of entries) {
      const bundleDir = path.join(this.bundlesDir, entry.name);
      const manifestPath = path.join(bundleDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      let manifest: BundleManifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as BundleManifest;
      } catch {
        continue;
      }

      const connectorEntities = manifest.entities?.connectorTemplates;
      if (!Array.isArray(connectorEntities) || connectorEntities.length === 0) continue;

      for (const entity of connectorEntities) {
        if (!entity.file) continue;

        // Prevent path traversal
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

  findByProvider(provider: string): ConnectorTemplateContainer | null {
    return this.list().find((c) => c.payload.connectorTemplate.provider === provider) ?? null;
  }
}
