'use client'

import React from 'react'
import type { ViewRuntimeActionRequest, ViewRuntimeConfig } from '@starships/protocol'

type SandboxInitMsg = {
  type: 'init'
  scripts: NonNullable<ViewRuntimeConfig['scripts']>
}

type SandboxRunMsg = {
  type: 'run'
  requestId: string
  scriptId: string
  entrypoint?: string
  event: { name: string; payload?: unknown; instanceId: string }
  state: Record<string, unknown>
}

type SandboxResultMsg = {
  type: 'result'
  requestId: string
  ops: ViewRuntimeActionRequest[]
}

type SandboxErrorMsg = {
  type: 'error'
  requestId: string
  message: string
}

type SandboxToHostMsg = SandboxResultMsg | SandboxErrorMsg

export type JsSandboxHandle = {
  run: (
    args: { scriptId: string; entrypoint?: string; event: SandboxRunMsg['event']; state: Record<string, unknown> },
    opts?: { timeoutMs?: number }
  ) => Promise<ViewRuntimeActionRequest[]>
}

function buildSandboxSrcDoc(): string {
  // IMPORTANT: this document runs in a sandboxed iframe without same-origin.
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script>
      (function () {
        'use strict';
        var scripts = {};

        function compileScript(source) {
          // Contract: source is JS that populates an exports object (CommonJS-like).
          var exports = {};
          var fn = new Function('exports', source);
          fn(exports);
          return exports;
        }

        function getAtPath(obj, path) {
          if (!path) return obj;
          var parts = String(path).split('.').filter(Boolean);
          var cur = obj;
          for (var i = 0; i < parts.length; i++) {
            if (cur == null) return undefined;
            cur = cur[parts[i]];
          }
          return cur;
        }

        function handleInit(msg) {
          scripts = {};
          var s = msg && msg.scripts && typeof msg.scripts === 'object' ? msg.scripts : {};
          for (var k in s) {
            if (!Object.prototype.hasOwnProperty.call(s, k)) continue;
            try {
              var entry = s[k];
              if (!entry || typeof entry !== 'object') continue;
              var source = entry.source;
              if (typeof source !== 'string') continue;
              scripts[k] = compileScript(source);
            } catch (e) {
              // ignore bad scripts in init; failures are surfaced on run
            }
          }
        }

        function handleRun(msg) {
          var requestId = msg && msg.requestId ? String(msg.requestId) : '';
          try {
            var scriptId = msg && msg.scriptId ? String(msg.scriptId) : '';
            var entrypoint = msg && msg.entrypoint ? String(msg.entrypoint) : 'default';
            var event = msg && msg.event && typeof msg.event === 'object' ? msg.event : {};
            var state = msg && msg.state && typeof msg.state === 'object' ? msg.state : {};

            var mod = scripts[scriptId];
            if (!mod) throw new Error('Script not found: ' + scriptId);
            var handler = mod[entrypoint] || mod['default'];
            if (typeof handler !== 'function') throw new Error('Handler not found: ' + entrypoint);

            var ops = [];
            var ctx = Object.freeze({
              getState: function (path) { return getAtPath(state, path); },
              setState: function (path, value, persist) {
                ops.push({ type: 'set_state', path: String(path || ''), value: value, persist: !!persist });
              },
              runWorkflow: function (workflowSlug, args) {
                ops.push({ type: 'run_workflow', workflowSlug: String(workflowSlug || ''), args: (args && typeof args === 'object') ? args : undefined });
              },
              runQuery: function (queryId) {
                ops.push({ type: 'run_query', queryId: String(queryId || '') });
              },
              patchProps: function (instanceId, patch) {
                ops.push({ type: 'patch_props', instanceId: String(instanceId || ''), patch: (patch && typeof patch === 'object') ? patch : {} });
              },
              patchRoot: function (patch) {
                ops.push({ type: 'patch_root', patch: Array.isArray(patch) ? patch : [] });
              },
              log: function () { /* no-op by default */ }
            });

            handler(ctx, event);

            parent.postMessage({ type: 'result', requestId: requestId, ops: ops }, '*');
          } catch (e) {
            var message = (e && e.message) ? String(e.message) : String(e);
            parent.postMessage({ type: 'error', requestId: requestId, message: message }, '*');
          }
        }

        window.addEventListener('message', function (ev) {
          var msg = ev && ev.data;
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'init') return handleInit(msg);
          if (msg.type === 'run') return handleRun(msg);
        });
      })();
    </script>
  </body>
</html>`;
}

export const JsSandboxHost = React.forwardRef<JsSandboxHandle, { scripts: NonNullable<ViewRuntimeConfig['scripts']> | undefined }>(
  function JsSandboxHostImpl({ scripts }, ref) {
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
    const pendingRef = React.useRef(
      new Map<
        string,
        { resolve: (ops: ViewRuntimeActionRequest[]) => void; reject: (err: Error) => void; timeoutId?: any }
      >()
    )

    const sendInit = React.useCallback(() => {
      const iframe = iframeRef.current
      if (!iframe?.contentWindow) return
      const msg: SandboxInitMsg = { type: 'init', scripts: scripts ?? {} }
      iframe.contentWindow.postMessage(msg, '*')
    }, [scripts])

    React.useEffect(() => {
      sendInit()
    }, [sendInit])

    React.useEffect(() => {
      function onMessage(ev: MessageEvent) {
        const data = ev.data as SandboxToHostMsg
        if (!data || typeof data !== 'object') return
        const requestId = (data as any).requestId
        if (typeof requestId !== 'string' || !requestId) return
        const pending = pendingRef.current.get(requestId)
        if (!pending) return
        pendingRef.current.delete(requestId)
        if (pending.timeoutId) clearTimeout(pending.timeoutId)

        if (data.type === 'result') pending.resolve(Array.isArray(data.ops) ? data.ops : [])
        else pending.reject(new Error((data as any).message || 'Sandbox error'))
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [])

    React.useImperativeHandle(
      ref,
      () => ({
        run: (args, opts) => {
          const iframe = iframeRef.current
          const win = iframe?.contentWindow
          if (!win) return Promise.reject(new Error('Sandbox not ready'))

          const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`
          const msg: SandboxRunMsg = {
            type: 'run',
            requestId,
            scriptId: String(args.scriptId),
            entrypoint: args.entrypoint ? String(args.entrypoint) : undefined,
            event: args.event,
            state: args.state ?? {},
          }

          const timeoutMs = typeof opts?.timeoutMs === 'number' && opts.timeoutMs > 0 ? Math.floor(opts.timeoutMs) : 1500

          return new Promise<ViewRuntimeActionRequest[]>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              pendingRef.current.delete(requestId)
              reject(new Error('Sandbox timeout'))
            }, timeoutMs)

            pendingRef.current.set(requestId, { resolve, reject, timeoutId })
            win.postMessage(msg, '*')
          })
        },
      }),
      []
    )

    return (
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={buildSandboxSrcDoc()}
        className="hidden"
        title="View JS Sandbox"
        onLoad={sendInit}
      />
    )
  }
)

