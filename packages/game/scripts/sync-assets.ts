import fs from 'fs';
import path from 'path';

type CopyOptions = { overwrite?: boolean };

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function rmDir(p: string) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(src: string, dest: string, opts?: CopyOptions) {
  if (!fs.existsSync(src)) throw new Error(`[sync-assets] Missing source file: ${src}`);
  if (!opts?.overwrite && fs.existsSync(dest)) return;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function listFilesRecursive(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..'); // packages/game/scripts -> repo root
  const srcTilesets = path.join(repoRoot, 'packages/game/assets/room-game/tilesets');
  const destTilesets = path.join(repoRoot, 'packages/client/public/room-game/tilesets');

  // Clear destination first to prevent dead assets.
  rmDir(destTilesets);
  ensureDir(destTilesets);

  const files = listFilesRecursive(srcTilesets).filter((p) => /\.(png|webp|jpg|jpeg)$/i.test(p));
  if (files.length === 0) throw new Error(`[sync-assets] No tileset images found under ${srcTilesets}`);

  for (const f of files) {
    const rel = path.relative(srcTilesets, f);
    const dest = path.join(destTilesets, rel);
    copyFile(f, dest, { overwrite: true });
  }

  // Small, useful stdout for CI/local dev.
  // (Avoid huge logs.)
  // eslint-disable-next-line no-console
  console.log(`[sync-assets] Copied ${files.length} tileset image(s) to ${path.relative(repoRoot, destTilesets)}`);
}

main();

