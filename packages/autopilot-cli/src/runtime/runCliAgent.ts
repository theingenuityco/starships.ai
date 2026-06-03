/**
 * runCliAgent
 *
 * Convenience entrypoint for hosts (e.g. the runner sandbox). Given a model +
 * model client, system prompt, history, working directory, and a connector
 * runner, it runs one agent turn to completion. The connector-action catalog
 * defaults to the in-process registry but can be overridden, or restricted to
 * the connectors a starship has actually connected via `discoverConnectors`.
 */

import { CliAgent } from '@/CliAgent';
import { connectorRegistryCatalog } from '@/tools/connectors';
import type { CliAgentConfig, CliAgentResult } from '@/types';

export type RunCliAgentInput = Omit<CliAgentConfig, 'catalog'> & {
  catalog?: CliAgentConfig['catalog'];
  /** When no catalog is supplied, restrict registry discovery to these connector names. */
  discoverConnectors?: string[];
};

export async function runCliAgent(input: RunCliAgentInput): Promise<CliAgentResult> {
  const { discoverConnectors, catalog, ...rest } = input;
  const resolvedCatalog = catalog ?? connectorRegistryCatalog(discoverConnectors ? { connectors: discoverConnectors } : undefined);
  const agent = new CliAgent({ ...rest, catalog: resolvedCatalog });
  return agent.run();
}
