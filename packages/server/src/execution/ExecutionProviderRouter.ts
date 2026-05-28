import type { ExecutionProvider } from '@starships/autopilot';
import { InlineExecutionProvider } from './InlineExecutionProvider';
import { LocalContainerExecutionProvider } from './LocalContainerExecutionProvider';

export interface GetProviderInput {
  starshipId: string;
  roomId?: string;
  /** True when the tool/blueprint needs native code execution (clone + tests + PR). */
  requiresWorkspace: boolean;
}

/**
 * Selects WHERE a job runs. Provider selection is policy (repos, online runners,
 * billing), kept separate from RunnerFactory's isolation-strategy selection.
 *
 * Today: non-workspace jobs run inline (unchanged behavior). Workspace-backed
 * jobs route to LocalContainerExecutionProvider (wired in Phase 2). Future:
 * user_machine and github_actions providers plug in behind the same interface.
 */
export class ExecutionProviderRouter {
  private readonly inline = new InlineExecutionProvider();
  private readonly localContainer = new LocalContainerExecutionProvider();

  async getProvider(input: GetProviderInput): Promise<ExecutionProvider> {
    if (!input.requiresWorkspace) {
      return this.inline;
    }
    // Per-starship-EC2 model: native code execution runs in a hardened local
    // Docker sandbox on the box. (user_machine / github_actions plug in here later.)
    return this.localContainer;
  }
}

/** Shared singleton router. */
export const executionProviderRouter = new ExecutionProviderRouter();
