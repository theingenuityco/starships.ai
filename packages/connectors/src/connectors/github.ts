/**
 * GitHub connector — hand-written, GitHub-App-driven.
 *
 * Auth is GitHubAppStrategy (installation tokens, bot identity). The HTTP actions are
 * the same set previously served declaratively; they are lifted into the package as
 * data (github.actions.json) so the connector is fully code-owned. The runner applies
 * the minted installation token from the session headers; baseUrl + actions are
 * unchanged from the prior template.
 */

import type { ConnectorEndpointV2 } from '@starships/protocol';
import type { ConnectorDefinition } from '../types';
import { GitHubAppStrategy } from '../strategies/GitHubAppStrategy';
import githubActions from './github.actions.json';

export const githubConnector: ConnectorDefinition = {
  id: 'github',
  provider: 'github',
  name: 'GitHub',
  description: 'Triage issues, read and write repository contents, run reviews, and open pull requests as the Starships app.',
  category: 'developer-tools',
  version: '2.0.0',
  isEnabled: true,
  baseUrl: 'https://api.github.com',
  auth: new GitHubAppStrategy(),
  actions: githubActions as unknown as ConnectorEndpointV2[],
};
