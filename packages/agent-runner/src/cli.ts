#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { assertRunnable, configPath, DEFAULT_CONFIG, DEFAULT_EXECUTOR, loadConfig, saveConfig, type RunnerConfig } from './config';
import { StarshipMcpClient } from './mcpClient';
import { Runner } from './runner';
import { startControlServer } from './controlServer';

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const hasCommand = argv.length > 0 && !argv[0].startsWith('-');
  const command = hasCommand ? argv[0] : 'help';
  const flags: Flags = {};
  for (let i = hasCommand ? 1 : 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

/** Merge a loaded config with flag overrides into a complete RunnerConfig. */
function resolveConfig(flags: Flags): RunnerConfig {
  const loaded = loadConfig();
  if (typeof flags.endpoint === 'string') loaded.endpoint = flags.endpoint;
  if (typeof flags.token === 'string') loaded.token = flags.token;
  if (flags['poll-interval']) loaded.pollIntervalMs = Number(flags['poll-interval']);
  if (typeof flags.executor === 'string') {
    const parts = flags.executor.trim().split(/\s+/).filter(Boolean);
    loaded.executor = { ...DEFAULT_EXECUTOR, ...(loaded.executor ?? {}), command: parts[0], args: parts.slice(1) };
  }
  assertRunnable(loaded);
  return loaded;
}

async function cmdInit(): Promise<void> {
  const existing = loadConfig();
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const ask = async (q: string, def?: string) => {
      const answer = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
      return answer || def || '';
    };
    const endpoint = await ask('MCP endpoint URL', existing.endpoint ?? 'http://localhost:4100/mcp');
    const token = await ask('Agent token (sk-ship-…)', existing.token);
    const executorStr = await ask(
      'Executor command (use {{prompt}} for the dispatch prompt)',
      existing.executor ? [existing.executor.command, ...existing.executor.args].join(' ') : 'claude -p {{prompt}}'
    );
    const parts = executorStr.split(/\s+/).filter(Boolean);

    const config: RunnerConfig = {
      ...DEFAULT_CONFIG,
      endpoint,
      token,
      executor: { ...DEFAULT_EXECUTOR, command: parts[0], args: parts.slice(1) },
    };
    assertRunnable(config);
    saveConfig(config);
    console.log(`\nSaved ${configPath()} (chmod 0600).`);
    console.log('Run `starship-agent test` to verify, then `starship-agent run`.');
  } finally {
    rl.close();
  }
}

async function cmdTest(flags: Flags): Promise<void> {
  const config = resolveConfig(flags);
  const client = new StarshipMcpClient(config.endpoint, config.token);
  console.log(`Connecting to ${config.endpoint} …`);
  await client.connect();
  const pending = await client.pullCommands();
  console.log(`Connected. ${pending.length} pending command(s):`);
  for (const d of pending) console.log(`  • ${d.commandType} (${d.id})  payload=${JSON.stringify(d.payload)}`);
  await client.close();
}

async function cmdRun(flags: Flags): Promise<void> {
  const config = resolveConfig(flags);
  const once = flags.once === true;
  const runner = new Runner(config, { once });

  runner.on('log', (l: { level: string; message: string }) => {
    const fn = l.level === 'error' ? console.error : l.level === 'warn' ? console.warn : console.log;
    fn(`[${l.level}] ${l.message}`);
  });

  // Optional loopback control surface for the desktop app / `status`.
  let control: { close: () => void } | null = null;
  const controlPort = flags['control-port'] ? Number(flags['control-port']) : undefined;
  if (controlPort) {
    const token = typeof flags['control-token'] === 'string' ? flags['control-token'] : randomBytes(16).toString('hex');
    control = startControlServer(runner, config, { port: controlPort, token });
    console.log(`Control API on http://127.0.0.1:${controlPort} (token: ${token})`);
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nShutting down…');
    await runner.stop();
    control?.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await runner.start();
  // For --once, the runner stops itself; exit cleanly once it does.
  if (once) {
    control?.close();
    process.exit(0);
  }
}

async function cmdStatus(flags: Flags): Promise<void> {
  const loaded = loadConfig();
  console.log('Config:', JSON.stringify({ ...loaded, token: loaded.token ? '••••••' : undefined }, null, 2));

  const controlPort = flags['control-port'] ? Number(flags['control-port']) : undefined;
  const token = typeof flags['control-token'] === 'string' ? flags['control-token'] : undefined;
  if (controlPort && token) {
    try {
      const res = await fetch(`http://127.0.0.1:${controlPort}/status`, { headers: { 'x-control-token': token } });
      console.log('\nLive status:', JSON.stringify(await res.json(), null, 2));
    } catch (e) {
      console.log(`\n(No control server reachable on :${controlPort} — ${(e as Error).message})`);
    }
  }
}

function printHelp(): void {
  console.log(`starship-agent — run a Starship dispatch loop on this machine

Usage:
  starship-agent init                         Interactive setup (endpoint, token, executor)
  starship-agent test                         Connect and list pending commands, then exit
  starship-agent run [flags]                  Poll and execute dispatches
  starship-agent status [flags]               Show config (+ live status if a control port is given)

Run flags:
  --once                      Drain pending commands once, then exit
  --endpoint <url>            Override MCP endpoint
  --token <sk-ship-…>         Override agent token
  --poll-interval <ms>        Override poll interval
  --executor "<cmd …>"        Override executor command (use {{prompt}})
  --control-port <port>       Expose a loopback control API (for the desktop app)
  --control-token <token>     Token for the control API (random if omitted)

Config: ${configPath()}
Env overrides: STARSHIP_MCP_URL, STARSHIP_AGENT_TOKEN, STARSHIP_EXECUTOR`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'init':
      return cmdInit();
    case 'test':
      return cmdTest(flags);
    case 'run':
      return cmdRun(flags);
    case 'status':
      return cmdStatus(flags);
    case 'help':
    default:
      printHelp();
  }
}

main().catch((e) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});
