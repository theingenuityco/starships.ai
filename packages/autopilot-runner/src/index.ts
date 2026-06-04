/**
 * @starships/autopilot-runner
 *
 * Sandbox entrypoint host for the code-native CLI agent. The runnable entrypoint is
 * `dist/cliAgent/cliJobAgent.js` (launched directly by the server's
 * CliAgentContainerLauncher). This index just re-exports the job runner for reuse.
 */
export { runCliAgentJob } from '@/cliAgent/CliAgentJob';
export type { CliAgentJobSpec, RunCliAgentJobOptions } from '@/cliAgent/CliAgentJob';
