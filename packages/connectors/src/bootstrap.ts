/**
 * bootstrapCodeConnectors
 *
 * Idempotently register the hand-written code connectors into the shared
 * registry singleton. The registry starts empty (see registry.ts) and importing
 * this package does not self-register — so every process that reads the registry
 * (server, runner sandbox, in-process agent) must bootstrap it first.
 *
 * Centralising the connector list here means there is exactly one source of
 * truth: the server's ensureConnectorRegistry() and the agent's
 * connectorRegistryCatalog() both delegate to this function instead of
 * maintaining their own registerCode() calls.
 */

import { connectorRegistry } from './registry';
import { githubConnector } from './connectors/github';
import { starshipsConnector } from './connectors/starships';
import { systemConnector } from './connectors/system';

let bootstrapped = false;

/** Register all code connectors once. Safe to call from anywhere, any number of times. */
export function bootstrapCodeConnectors(): void {
  if (bootstrapped) return;
  connectorRegistry.registerCode(githubConnector);
  connectorRegistry.registerCode(starshipsConnector);
  connectorRegistry.registerCode(systemConnector);
  bootstrapped = true;
}

/** Force re-registration on the next bootstrapCodeConnectors() call. */
export function resetCodeConnectorBootstrap(): void {
  bootstrapped = false;
}
