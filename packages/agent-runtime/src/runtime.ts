// The agent loop. A manual (not auto-executed) loop so each tool call can be gated on
// approval before it runs. Streams output as Claude-compatible stream-json lines and
// resolves when the model stops requesting tools (or maxSteps / abort is hit).
//
// Tools live behind a ToolRegistry of providers (system today; mcp / user bundles next).
// Only resident + already-loaded tools are sent to the model each step; the rest are
// advertised in a cheap catalog and pulled in on demand via system.tool_search — the
// deferred-tool model that keeps a large catalog from filling the context window.
import { streamText, type ModelMessage } from 'ai';
import { resolveApiKey, resolveModel } from './provider';
import { ToolRegistry, buildSystemProvider, type ToolContext, type ToolDescriptor } from './tools';
import * as L from './translate';
import { getSession, saveSession } from './sessions';
import type { RunRequest, RuntimeHandlers } from './types';

const DEFAULT_MAX_STEPS = 24;

export async function runAgent(req: RunRequest, h: RuntimeHandlers): Promise<void> {
  const start = Date.now();
  const mode = req.mode ?? 'all';
  // Tools allowed without prompting. `allow-session` decisions extend this set for the run.
  const sessionAllow = new Set(req.allow ?? []);

  // TODO(workspace-default): with no `--workspace` in the executor this falls back to the
  // sidecar cwd, which is the user's home dir (set in lib.rs runtime_spawn_cmd). Under the
  // default `{ mode: 'all' }` policy that gives the model read/write over ~/. Require a
  // workspace in the executor (reject at validation) or warn in the executor-config UI.
  const workspace = req.workspace ?? process.cwd();
  const maxSteps = req.maxSteps ?? DEFAULT_MAX_STEPS;
  const denials: L.PermissionDenial[] = [];
  let finalText = '';
  let isError = false;

  const apiKey = resolveApiKey(req.provider, req.apiKey);
  if (!apiKey) {
    h.onLine(L.buildSystemInit(req.sessionId, req.model));
    h.onLine(
      L.buildResult({
        finalText: `No API key configured for ${req.provider}. Add one in Settings → Providers.`,
        durationMs: Date.now() - start,
        denials: [],
        isError: true,
      })
    );
    return;
  }

  const model = resolveModel(req.provider, req.model, apiKey);

  // Assemble the registry for this run. System is always present; mcp / user-bundle providers
  // (selected by req.toolsets) plug in here in Phase 1.
  const registry = new ToolRegistry();
  await registry.register(buildSystemProvider(), { workspace });

  // The deferred-tool loaded set: resident tools are in scope from the start; tool_search
  // adds more (and `load` is the closure it calls to do so).
  const loaded = new Set<string>(registry.residentFqns());
  const isAllowed = (fqn: string): boolean => mode === 'all' || registry.isAllowed(fqn, sessionAllow);
  const toolCtx: ToolContext = {
    workspace,
    signal: h.signal,
    deferred: {
      search: (query, max) => registry.search(query, max),
      load: (fqns) => fqns.forEach((f) => loaded.add(f)),
    },
  };

  // The cheap catalog of deferred tools rides along in the system prompt.
  const catalog = registry.catalog(loaded);
  const systemPrompt = [req.systemPrompt, catalog].filter(Boolean).join('\n\n') || undefined;

  const messages = getSession(req.sessionId);
  messages.push({ role: 'user', content: req.prompt });
  h.onLine(L.buildSystemInit(req.sessionId, req.model));

  try {
    for (let step = 0; step < maxSteps; step++) {
      if (h.signal.aborted) break;

      const sdkTools = registry.buildSdkTools([...loaded]);
      const result = streamText({
        model,
        system: systemPrompt,
        messages,
        tools: sdkTools,
        abortSignal: h.signal,
      });

      // Stream assistant text live (plain string deltas).
      let stepText = '';
      for await (const delta of result.textStream) {
        if (!delta) continue;
        stepText += delta;
        h.onLine(L.buildTextDelta(delta));
      }

      const finishReason = await result.finishReason;
      const toolCalls = await result.toolCalls;

      // Append the model's own messages (assistant text + tool_use) to history verbatim.
      const responseMessages = await result.response.then((r) => r.messages);
      messages.push(...responseMessages);

      // Emit a finished assistant turn for the transcript (text + tool_use blocks). The
      // displayed name is the dotted fqn; the SDK/message identity stays the wire name.
      const blocks: L.AssistantBlock[] = [];
      if (stepText.trim()) blocks.push({ type: 'text', text: stepText });
      for (const tc of toolCalls) {
        const fqn = registry.resolveWire(tc.toolName)?.descriptor.fqn ?? tc.toolName;
        blocks.push({ type: 'tool_use', id: tc.toolCallId, name: fqn, input: tc.input });
      }
      if (blocks.length) h.onLine(L.buildAssistantMessage(blocks));
      if (stepText.trim()) finalText = stepText.trim();

      if (finishReason !== 'tool-calls' || toolCalls.length === 0) break;

      // Gate + run each tool call; feed results back to the model.
      const toolMessages: ModelMessage[] = [];
      for (const tc of toolCalls) {
        const { output, error } = await runOneTool(tc, { registry, isAllowed, sessionAllow, denials, ctx: toolCtx, h });
        h.onLine(L.buildToolResult(tc.toolCallId, output, error));
        toolMessages.push({
          role: 'tool',
          content: [
            { type: 'tool-result', toolCallId: tc.toolCallId, toolName: tc.toolName, output: { type: 'text', value: output } },
          ],
        });
      }
      messages.push(...toolMessages);
    }
  } catch (e) {
    isError = true;
    finalText = e instanceof Error ? e.message : String(e);
  } finally {
    await registry.dispose();
  }

  // Don't persist a history that ended mid-error: the loop may have appended a tool_use whose
  // tool_result was never produced, an invalid state the next turn would resume into (provider
  // 400 / confused model). Dropping the partial turn keeps the saved thread well-formed.
  if (!isError) saveSession(req.sessionId, messages);
  h.onLine(L.buildResult({ finalText, durationMs: Date.now() - start, denials, isError }));
}

interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

/** Resolve a single tool call: gate it, then run it through its provider (or record a denial). */
async function runOneTool(
  tc: ToolCall,
  opts: {
    registry: ToolRegistry;
    isAllowed: (fqn: string) => boolean;
    sessionAllow: Set<string>;
    denials: L.PermissionDenial[];
    ctx: ToolContext;
    h: RuntimeHandlers;
  }
): Promise<{ output: string; error: boolean }> {
  const entry = opts.registry.resolveWire(tc.toolName);
  if (!entry) return { output: `Unknown tool: ${tc.toolName}`, error: true };
  const descriptor: ToolDescriptor = entry.descriptor;
  const fqn = descriptor.fqn;

  if (!opts.isAllowed(fqn)) {
    const decision = await opts.h.requestApproval({ toolUseId: tc.toolCallId, toolName: fqn, toolInput: tc.input });
    if (decision === 'deny') {
      opts.denials.push({ tool_name: fqn, tool_use_id: tc.toolCallId, tool_input: tc.input });
      return { output: `Permission denied for ${fqn}.`, error: true };
    }
    if (decision === 'allow-session') opts.sessionAllow.add(fqn);
  }

  try {
    const { output, error } = await opts.registry.execute(fqn, tc.input, opts.ctx);
    return { output, error: Boolean(error) };
  } catch (e) {
    return { output: e instanceof Error ? e.message : String(e), error: true };
  }
}
