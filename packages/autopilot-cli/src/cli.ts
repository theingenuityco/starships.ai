#!/usr/bin/env node

import { loadBundleFromZip } from '@/bundle/loadBundle';
import { getContainerSlug, LoadedBundle } from '@/bundle/types';
import { createLocalHostRuntime } from '@/runtime/hostRuntime';
import { runInteractiveChat } from '@/run/chatRunner';

type ParsedArgs = {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
};

function parseArgv(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command = '';

  const args = argv.slice(2);
  if (args.length > 0) {
    command = args[0] ?? '';
  }

  for (let i = 1; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(a);
  }

  return { command, positional, flags };
}

function usage(): string {
  return [
    'Usage:',
    '  autopilot-cli inspect <bundle.zip>',
    '  autopilot-cli run <bundle.zip> [--agent <slug>] [--input "<text>"] [--max-steps <n>]',
    '                    [--openrouter-api-key <key>] [--base-url <url>]',
    '',
    'Environment:',
    '  OPENROUTER_API_KEY, OPENROUTER_BASE_URL (default: https://openrouter.ai/api/v1)',
    '',
  ].join('\n');
}

function pickAgent(bundle: LoadedBundle, agentSlug?: string): (typeof bundle)['agents'][number] {
  if (bundle.agents.length === 0) {
    throw new Error('Bundle contains no agents.');
  }
  if (agentSlug) {
    const hit = bundle.agents.find((a) => getContainerSlug(a) === agentSlug);
    if (!hit) {
      const available = bundle.agents.map((a) => getContainerSlug(a) ?? '(missing-slug)').join(', ');
      throw new Error(`Agent not found: ${agentSlug}. Available: ${available}`);
    }
    return hit;
  }
  if (bundle.agents.length === 1) return bundle.agents[0]!;
  const available = bundle.agents.map((a) => getContainerSlug(a) ?? '(missing-slug)').join(', ');
  throw new Error(`Multiple agents in bundle. Choose one with --agent. Available: ${available}`);
}

function inspectBundle(bundle: LoadedBundle): void {
  console.log(`Bundle: ${bundle.zipPath}`);
  console.log(`ExportedAt: ${bundle.manifest.exportedAt}`);
  console.log('');

  console.log(`Agents (${bundle.agents.length}):`);
  for (const a of bundle.agents) {
    const slug = getContainerSlug(a) ?? '(missing-slug)';
    const payload = a.payload as { agent?: { name?: unknown; model?: unknown }; assignedToolSlugs?: unknown };
    const name = typeof payload.agent?.name === 'string' ? payload.agent.name : slug;
    const model = typeof payload.agent?.model === 'string' ? payload.agent.model : '';
    const assigned = Array.isArray(payload.assignedToolSlugs) ? payload.assignedToolSlugs.length : 0;
    console.log(`- ${slug}  name="${name}"${model ? ` model="${model}"` : ''} tools=${assigned}`);
  }
  console.log('');

  console.log(`Tools (${bundle.tools.length}):`);
  for (const t of bundle.tools) {
    const slug = getContainerSlug(t) ?? '(missing-slug)';
    const payload = t.payload as { tool?: { name?: unknown; description?: unknown } };
    const name = typeof payload.tool?.name === 'string' ? payload.tool.name : slug;
    const desc = typeof payload.tool?.description === 'string' ? payload.tool.description : '';
    console.log(`- ${slug}  name="${name}"${desc ? ` desc="${desc.slice(0, 80)}${desc.length > 80 ? '…' : ''}"` : ''}`);
  }

  if (bundle.rooms.length > 0) {
    console.log('');
    console.log(`Rooms (${bundle.rooms.length}):`);
    for (const r of bundle.rooms) {
      const slug = getContainerSlug(r) ?? '(missing-slug)';
      const payload = r.payload as { room?: { name?: unknown }; toolAssignments?: unknown[] };
      const name = typeof payload.room?.name === 'string' ? payload.room.name : slug;
      const assignments = Array.isArray(payload.toolAssignments) ? payload.toolAssignments.length : 0;
      console.log(`- ${slug}  name="${name}" toolAssignments=${assignments}`);
    }
  }
}

async function main(): Promise<void> {
  // Reduce Autopilot LLM prompt logging noise by default.
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

  const parsed = parseArgv(process.argv);
  const cmd = parsed.command;

  if (!cmd || cmd === '--help' || cmd === 'help') {
    console.log(usage());
    process.exit(0);
  }

  if (cmd === 'inspect') {
    const zipPath = parsed.positional[0];
    if (!zipPath) throw new Error('Missing bundle zip path.\n\n' + usage());
    const bundle = loadBundleFromZip(zipPath);
    inspectBundle(bundle);
    return;
  }

  if (cmd === 'run') {
    const zipPath = parsed.positional[0];
    if (!zipPath) throw new Error('Missing bundle zip path.\n\n' + usage());

    const bundle = loadBundleFromZip(zipPath);
    const agentSlug = typeof parsed.flags['agent'] === 'string' ? String(parsed.flags['agent']) : undefined;
    const inputOnce = typeof parsed.flags['input'] === 'string' ? String(parsed.flags['input']) : undefined;
    const maxStepsRaw = typeof parsed.flags['max-steps'] === 'string' ? String(parsed.flags['max-steps']) : undefined;
    const maxSteps = maxStepsRaw ? parseInt(maxStepsRaw, 10) : undefined;

    const openRouterApiKey =
      typeof parsed.flags['openrouter-api-key'] === 'string' ? String(parsed.flags['openrouter-api-key']) : undefined;
    const baseUrl = typeof parsed.flags['base-url'] === 'string' ? String(parsed.flags['base-url']) : undefined;

    const agent = pickAgent(bundle, agentSlug);
    const room = bundle.rooms.length > 0 ? bundle.rooms[0]! : null;
    const hostRuntime = createLocalHostRuntime({ openRouterApiKey, openRouterBaseUrl: baseUrl });

    await runInteractiveChat({
      agent,
      tools: bundle.tools,
      room,
      hostRuntime,
      ...(typeof maxSteps === 'number' && Number.isFinite(maxSteps) ? { maxSteps } : {}),
      ...(inputOnce ? { inputOnce } : {}),
    });
    return;
  }

  throw new Error(`Unknown command: ${cmd}\n\n` + usage());
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});

