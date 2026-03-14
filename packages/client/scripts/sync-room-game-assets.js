const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmDir(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function listFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function main() {
  const clientRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(clientRoot, '..', '..');

  const srcTilesets = path.join(repoRoot, 'packages/game/assets/room-game/tilesets');
  const destTilesets = path.join(clientRoot, 'public/room-game/tilesets');

  rmDir(destTilesets);
  ensureDir(destTilesets);

  const files = listFilesRecursive(srcTilesets).filter((p) => /\.(png|webp|jpg|jpeg)$/i.test(p));
  if (files.length === 0) {
    throw new Error(`[sync-room-game-assets] No tileset images found under ${srcTilesets}`);
  }

  for (const f of files) {
    const rel = path.relative(srcTilesets, f);
    const dest = path.join(destTilesets, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(f, dest);
  }

  // eslint-disable-next-line no-console
  console.log(`[sync-room-game-assets] Copied ${files.length} tileset image(s) to public/room-game/tilesets`);
}

main();

