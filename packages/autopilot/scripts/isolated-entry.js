/**
 * Single-file bundle entry for isolated-vm.
 * This registers a global function that IsolatedVmRunner will call inside the isolate.
 * Build this file with esbuild into an IIFE bundle.
 *
 * IMPORTANT: Do NOT import the root dist/index.js here since it re-exports runners which
 * pull in 'node:module'. Instead import the Engine directly from its dist path so the
 * bundle does not include any Node-specific modules.
 */
(() => {
  // Polyfill structuredClone with a proven lightweight polyfill (bundled via esbuild)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sc = require('core-js-pure/actual/structured-clone');
    if (typeof globalThis.structuredClone !== 'function') {
      globalThis.structuredClone = sc;
    }
  } catch (e) {
    // If core-js-pure is unavailable at build-time, ignore (but our build bundles it)
  }

  // Streams polyfill for ReadableStream (needed for fetch streaming in isolate)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ReadableStream } = require('web-streams-polyfill/ponyfill/es2018');
    if (typeof globalThis.ReadableStream !== 'function') {
      // @ts-ignore
      globalThis.ReadableStream = ReadableStream;
    }
  } catch (e) {
    // ignore if unavailable
  }

  // Generic fetch polyfill bridging to host fetch via isolated-vm Reference (non-streaming body)
  if (typeof globalThis.fetch !== 'function') {
    // @ts-ignore
    globalThis.fetch = (input, init) => {
      const hostFetch = globalThis.__HOST_FETCH__;
      if (!hostFetch) {
        throw new Error('Host fetch bridge not available');
      }
      const url = typeof input === 'string' ? input : input && input.url;

      return new Promise((resolve, reject) => {
        hostFetch
          .apply(undefined, [{ url, init }], { arguments: { copy: true } })
          .then((meta) => {
            const encoder = new TextEncoder();
            const bodyText = (meta && meta.bodyText) || '';
            const stream = new globalThis.ReadableStream({
              start(controller) {
                if (bodyText && typeof bodyText === 'string') {
                  controller.enqueue(encoder.encode(bodyText));
                }
                controller.close();
              },
            });

            const resp = {
              ok: !!(meta && meta.ok),
              status: (meta && meta.status) || 0,
              statusText: (meta && meta.statusText) || '',
              headers: (meta && meta.headers) || {},
              body: stream,
              async json() {
                return JSON.parse(bodyText || 'null');
              },
              async text() {
                return String(bodyText ?? '');
              },
            };
            resolve(resp);
          })
          .catch(reject);
      });
    };
  }

  // Import the compiled Engine only (avoid pulling runner exports)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Engine } = require('../dist/engine/Engine.js');

  // Contract required by IsolatedVmRunner:
  // input = { blueprint, execution, config, autopilotCredentials? }
  globalThis.__autopilot_run_engine__ = async (input) => {
    const { blueprint, execution, config, autopilotCredentials } = input || {};

    // Set credentials inside isolate if provided by host
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { autopilot } = require('../dist/Autopilot.js');
      if (autopilotCredentials && autopilot && typeof autopilot.setCredentials === 'function') {
        autopilot.setCredentials(autopilotCredentials);
      }
    } catch (e) {
      // ignore if not available
    }

    const engine = new Engine(config);
    return await engine.executeBlueprint(blueprint, execution);
  };
})();
