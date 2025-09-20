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

  // Import the compiled Engine only (avoid pulling runner exports)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Engine } = require('../dist/engine/Engine.js');

  // Contract required by IsolatedVmRunner:
  // input = { blueprint, execution, config }
  globalThis.__autopilot_run_engine__ = async (input) => {
    const { blueprint, execution, config } = input || {};
    const engine = new Engine(config);
    return await engine.executeBlueprint(blueprint, execution);
  };
})();
