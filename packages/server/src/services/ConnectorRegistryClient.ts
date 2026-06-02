import fs from 'fs';
import path from 'path';
import type { ConnectorProvider } from '@starships/protocol';
import { connectorRegistry, loadTemplateContainersFromDir } from '@starships/connectors';
import type { ConnectorTemplateEntityLike } from './ConnectorTemplateRegistryClient';

/**
 * ConnectorRegistryClient
 *
 * Drop-in replacement for ConnectorTemplateRegistryClient, backed by the in-process
 * @starships/connectors registry instead of a bundle-service HTTP round trip. Declarative
 * connectors are loaded from the bundle JSON on disk once; hand-written code connectors
 * (registered in registerCodeConnectors) take precedence.
 *
 * Returns ConnectorTemplateEntityLike-shaped objects (ConnectorRuntimeTemplate is
 * structurally identical), so all existing consumers work unchanged.
 */

let registered = false;

/** Locate the bundle-service bundles directory on disk (mirrors routes/starships.ts resolveBundlesRoot). */
function resolveBundlesDir(): string {
  const fromEnv = process.env.BUNDLES_DIR;
  if (fromEnv && fs.existsSync(fromEnv) && fs.statSync(fromEnv).isDirectory()) return fromEnv;

  const candidates = [
    path.resolve(process.cwd(), 'packages', 'bundle-service', 'bundles'),
    path.resolve(process.cwd(), '..', 'bundle-service', 'bundles'),
    path.resolve(process.cwd(), '..', '..', 'packages', 'bundle-service', 'bundles'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }
  return path.resolve(process.cwd(), 'packages', 'bundle-service', 'bundles');
}

/** Register hand-written code connectors. Phase 3 enables the GitHub App connector here. */
function registerCodeConnectors(): void {
  // (Phase 3) connectorRegistry.registerCode(githubConnector);
}

function ensureRegistered(): void {
  if (registered) return;
  try {
    const containers = loadTemplateContainersFromDir(resolveBundlesDir());
    connectorRegistry.registerContainers(containers);
    if (containers.length === 0) {
      console.warn('[ConnectorRegistryClient] No connector templates found on disk; set BUNDLES_DIR or check the bundle-service bundles path');
    }
  } catch (err) {
    console.error('[ConnectorRegistryClient] Failed to load connector templates from disk', {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  registerCodeConnectors();
  registered = true;
}

export class ConnectorRegistryClient {
  async list(): Promise<ConnectorTemplateEntityLike[]> {
    ensureRegistered();
    return connectorRegistry.listRuntimeTemplates();
  }

  async findByProvider(provider: ConnectorProvider): Promise<ConnectorTemplateEntityLike | null> {
    ensureRegistered();
    return connectorRegistry.runtimeTemplate(provider) ?? null;
  }

  async findById(id: string): Promise<ConnectorTemplateEntityLike | null> {
    ensureRegistered();
    return connectorRegistry.listRuntimeTemplates().find((t) => t.id === id || t.provider === id) ?? null;
  }

  /** Re-scan on next access (e.g. after bundle files change). */
  invalidate(): void {
    registered = false;
  }
}
