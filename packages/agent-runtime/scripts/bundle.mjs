// Bundle the runtime service into a self-contained sidecar for the desktop app.
//
// Two outputs:
//   1. dist/server.cjs  — a single bundled CommonJS file (no node_modules needed). Runnable
//      with `node dist/server.cjs`. This is the portable artifact.
//   2. (optional) a standalone binary at
//      ../agent-desktop/src-tauri/binaries/starship-runtime-<target-triple>, compiled with
//      Bun if it's available. Tauri's `externalBin` expects this naming. Skipped (with a
//      note) when Bun isn't installed — `node dist/server.cjs` still works.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const out = join(pkgRoot, 'dist', 'server.cjs');

await build({
  entryPoints: [join(pkgRoot, 'src', 'server.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  minify: true,
  // ws is an optional peer of some HTTP libs; keep the bundle resilient if absent.
  external: [],
  banner: { js: '#!/usr/bin/env node' },
});
console.log(`bundled → ${out}`);

// Try to produce a standalone binary via Bun (best-effort).
function bunTargetTriple() {
  // Map node's platform/arch to Rust target triples Tauri expects in the binary name.
  const p = process.platform;
  const a = process.arch;
  if (p === 'darwin') return a === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  if (p === 'linux') return a === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  if (p === 'win32') return 'x86_64-pc-windows-msvc';
  return null;
}

const triple = bunTargetTriple();
const binDir = resolve(pkgRoot, '..', 'agent-desktop', 'src-tauri', 'binaries');
const binPath = join(binDir, `starship-runtime-${triple}${process.platform === 'win32' ? '.exe' : ''}`);
try {
  mkdirSync(binDir, { recursive: true });
  execFileSync('bun', ['build', out, '--compile', '--outfile', binPath], { stdio: 'inherit' });
  console.log(`compiled standalone binary → ${binPath}`);
} catch {
  console.log('bun not found (or compile failed): skipping standalone binary.');
  console.log('  Release builds can run `node dist/server.cjs`, or install Bun to produce a binary.');
  console.log('  To ship via Tauri externalBin, add to tauri.conf.json:');
  console.log('    "bundle": { "externalBin": ["binaries/starship-runtime"] }');
}
