/**
 * cliJobAgent
 *
 * Container entrypoint for a code-native terminal agent run. The counterpart to
 * jobAgent.ts (which runs DAG blueprints). Reads a CliAgentJobSpec from a job
 * file, runs the agent loop via runCliAgentJob, and streams progress back to the
 * launching process as JSON lines on stdout:
 *   {"t":"event","data":<CliAgentEvent>}
 *   {"t":"result","data":<CliAgentResult>}
 *   {"t":"error","message":<string>}
 *
 * The launching provider parses these lines and relays events to its in-process
 * event sink.
 */

import { readFile } from 'node:fs/promises';
import { runCliAgentJob, type CliAgentJobSpec } from '@/cliAgent/CliAgentJob';

function emit(line: { t: 'event'; data: unknown } | { t: 'result'; data: unknown } | { t: 'error'; message: string }): void {
  process.stdout.write(JSON.stringify(line) + '\n');
}

export async function runCliJobAgent(spec: CliAgentJobSpec): Promise<void> {
  const result = await runCliAgentJob(spec, {
    onEvent: (event) => emit({ t: 'event', data: event }),
  });
  emit({ t: 'result', data: result });
}

async function main(): Promise<void> {
  const jobFile = process.env.CLI_JOB_FILE || process.argv[2];
  if (!jobFile) {
    emit({ t: 'error', message: 'CLI_JOB_FILE (or argv[2]) is required' });
    process.exit(1);
    return;
  }
  try {
    const raw = await readFile(jobFile, 'utf-8');
    const spec = JSON.parse(raw) as CliAgentJobSpec;
    await runCliJobAgent(spec);
    process.exit(0);
  } catch (err) {
    emit({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// Run when invoked directly as the container entrypoint.
if (process.env.CLI_JOB_FILE || process.argv[1]?.includes('cliJobAgent')) {
  void main();
}
