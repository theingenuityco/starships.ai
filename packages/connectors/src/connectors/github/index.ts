/**
 * GitHub connector — hand-written, GitHub-App-driven.
 *
 * Auth is GitHubAppStrategy (installation tokens, bot identity). Actions are plain code
 * functions in ./actions; each builds its request through `ctx.http` (no template DSL).
 * The `Accept: application/vnd.github+json` header is applied to every request via
 * `defaultHeaders`. Execution happens server-side in ConnectorActionExecutor.
 */

import type { ConnectorDefinition } from '../../types';
import { GitHubAppStrategy } from '../../strategies/GitHubAppStrategy';
import { githubActions } from './actions';

export const githubConnector: ConnectorDefinition = {
  id: 'github',
  provider: 'github',
  name: 'GitHub',
  description: 'Triage issues, read and write repository contents, run reviews, and open pull requests as the Starships app.',
  category: 'developer-tools',
  version: '2.0.0',
  isEnabled: true,
  baseUrl: 'https://api.github.com',
  defaultHeaders: { Accept: 'application/vnd.github+json' },
  auth: new GitHubAppStrategy(),
  actions: githubActions,
};
