// Compile the agent-runner CLI into a single binary and place it where Tauri
// expects a sidecar: src-tauri/binaries/starship-agent-<rust-target-triple>.
//
// Usage:
//   node scripts/build-sidecar.mjs            # host target
//   node scripts/build-sidecar.mjs <triple>   # explicit rust target triple
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const entry = resolve(pkg, '../agent-runner/src/cli.ts');
const outDir = resolve(pkg, 'src-tauri/binaries');

// rust triple -> bun --target
const BUN_TARGET = {
  'aarch64-apple-darwin': 'bun-darwin-arm64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'x86_64-unknown-linux-gnu': 'bun-linux-x64',
  'aarch64-unknown-linux-gnu': 'bun-linux-arm64',
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
};

function hostTriple() {
  const out = execFileSync('rustc', ['-Vv'], { encoding: 'utf8' });
  const m = out.match(/host:\s*(\S+)/);
  if (!m) throw new Error('Could not determine host target triple from rustc');
  return m[1];
}

const triple = process.argv[2] || hostTriple();
const bunTarget = BUN_TARGET[triple];
if (!bunTarget) throw new Error(`Unsupported target triple: ${triple}`);

const ext = triple.includes('windows') ? '.exe' : '';
const outfile = resolve(outDir, `starship-agent-${triple}${ext}`);

mkdirSync(outDir, { recursive: true });
console.log(`Compiling ${entry}\n  → ${outfile}  (${bunTarget})`);
execFileSync('bun', ['build', entry, '--compile', '--target', bunTarget, '--outfile', outfile], {
  stdio: 'inherit',
});
console.log('Sidecar built.');
