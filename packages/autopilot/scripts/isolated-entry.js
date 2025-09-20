/**
 * Single-file bundle entry for isolated-vm.
 * This registers a global function that IsolatedVmRunner will call inside the isolate.
 * Build this file with esbuild into an IIFE bundle.
 */
(() => {
  // Import the compiled library API (ensure `pnpm --filter @starships/autopilot build` ran first)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Engine } = require('../dist/index.js');

  // Contract required by IsolatedVmRunner:
  // input = { blueprint, execution, config }
  globalThis.__autopilot_run_engine__ = async (input) => {
    const { blueprint, execution, config } = input || {};
    const engine = new Engine(config);
    return await engine.executeBlueprint(blueprint, execution);
  };
})();
