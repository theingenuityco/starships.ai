import type { Blueprint } from '@starships/autopilot';

/**
 * Extract unique connector provider identifiers from a blueprint.
 * Only captures static string values from connector_action nodes.
 */
export function extractRequiredConnectorProviders(blueprint: Blueprint | null | undefined): string[] {
  if (!blueprint?.nodes || !Array.isArray(blueprint.nodes)) {
    return [];
  }

  const providers = new Set<string>();

  for (const node of blueprint.nodes) {
    if (node?.type !== 'connector_action') continue;

    const params = node.parameters as Record<string, unknown> | undefined;
    const connector = params?.connector;
    if (typeof connector !== 'string') continue;

    // Skip expression-like values (e.g. {{ ... }})
    const trimmed = connector.trim();
    if (trimmed.includes('{{')) continue;

    if (trimmed.length > 0) {
      providers.add(trimmed.toLowerCase());
    }
  }

  return Array.from(providers);
}
