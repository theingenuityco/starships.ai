// Runnable stdio MCP server that exposes Starship's toolsets to any MCP client (claude-code,
// codex, Claude Desktop, ...). Point a client's `mcpServers` config at:
//   { "command": "starship-toolsets", "args": ["--workspace", "/path/to/repo"] }
//
// Serves the `system` toolset plus any user bundles named in STARSHIP_BUNDLES (a JSON map of
// toolset name -> bundle dir). stdout is the MCP protocol channel — all logging goes to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ToolRegistry, buildSystemProvider, buildBundleProvider, type ToolContext } from './tools';
import { createToolsetMcpServer } from './tools/expose/server';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const workspace = arg('--workspace') ?? process.env.STARSHIP_WORKSPACE ?? process.cwd();
  const abort = new AbortController();

  const registry = new ToolRegistry();
  await registry.register(buildSystemProvider(), { workspace });

  // Optional user bundles: STARSHIP_BUNDLES='{"acme":"/abs/path/to/bundle"}'
  try {
    const bundles = JSON.parse(process.env.STARSHIP_BUNDLES ?? '{}') as Record<string, string>;
    for (const [name, dir] of Object.entries(bundles)) {
      try {
        await registry.register(buildBundleProvider(name, dir), { workspace });
      } catch (e) {
        console.error(`[starship-toolsets] bundle "${name}" failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch {
    console.error('[starship-toolsets] STARSHIP_BUNDLES is not valid JSON; ignoring');
  }

  const ctx: ToolContext = { workspace, signal: abort.signal };
  const server = createToolsetMcpServer(registry, () => ctx);

  const shutdown = () => {
    abort.abort();
    void registry.dispose();
    void server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.connect(new StdioServerTransport());
  console.error(`[starship-toolsets] serving ${registry.all().length} tools (workspace: ${workspace})`);
}

main().catch((e) => {
  console.error(`[starship-toolsets] fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
