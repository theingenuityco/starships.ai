/**
 * JobAgent
 *
 * Runs inside the hardened sandbox container (one process per workspace job).
 * Reads a job spec (blueprint/execution/config, where config carries the
 * workspace spec + git creds + connector sessions), executes it via
 * InProcessExecutor (which clones the repo and confines FileSystem/Terminal to
 * the workspace), and streams results back to the launching process as JSON
 * lines on stdout:
 *   {"t":"event","data":<autopilotEvent>}
 *   {"t":"result","data":<ExecutionItem[]>}
 *   {"t":"error","message":<string>}
 *
 * The launching LocalContainerExecutionProvider parses these lines and relays
 * events into the in-process eventCallback.
 */

import { readFile } from 'node:fs/promises';
import { InProcessExecutor } from '@/executor/InProcessExecutor';

export interface JobSpec {
  requestId: string;
  blueprintJson: string;
  executionJson: string;
  configJson: string;
}

function emit(line: { t: 'event'; data: unknown } | { t: 'result'; data: unknown } | { t: 'error'; message: string }): void {
  process.stdout.write(JSON.stringify(line) + '\n');
}

export async function runJobAgent(job: JobSpec): Promise<void> {
  const executor = new InProcessExecutor();
  const result = await executor.execute({
    requestId: job.requestId,
    blueprintJson: job.blueprintJson,
    executionJson: job.executionJson,
    configJson: job.configJson,
    onEvent: (chunk) => {
      // InProcessExecutor wraps engine events as { type: 'event', data }.
      emit({ t: 'event', data: (chunk as { data?: unknown }).data });
    },
  });
  emit({ t: 'result', data: result });
}

async function main(): Promise<void> {
  const jobFile = process.env.JOB_FILE || process.argv[2];
  if (!jobFile) {
    emit({ t: 'error', message: 'JOB_FILE (or argv[2]) is required' });
    process.exit(1);
    return;
  }
  try {
    const raw = await readFile(jobFile, 'utf-8');
    const job = JSON.parse(raw) as JobSpec;
    await runJobAgent(job);
    process.exit(0);
  } catch (err) {
    emit({ t: 'error', message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// Run when invoked directly as the container entrypoint.
if (process.env.JOB_FILE || process.argv[1]?.includes('jobAgent')) {
  void main();
}
