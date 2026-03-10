/**
 * Offline agent sprite factory (Option A).
 *
 * This is intentionally provider-agnostic. It currently supports generating
 * placeholder sprite assets so the pipeline can be exercised end-to-end.
 *
 * Publish target (static):
 *   packages/client/public/static-assets/game/agents/<appearanceKey>/{spritesheet.png,atlas.json}
 */

import fs from 'fs/promises'
import path from 'path'

type Args = {
  appearanceKey: string
  outDir: string
}

function parseArgs(argv: string[]): Args {
  const appearanceKey = (argv.find(a => a.startsWith('--appearanceKey=')) || '').split('=')[1] || ''
  const outDir = (argv.find(a => a.startsWith('--outDir=')) || '').split('=')[1] || ''
  if (!appearanceKey.trim()) {
    throw new Error('Missing --appearanceKey=<key>')
  }
  if (!outDir.trim()) {
    throw new Error('Missing --outDir=<absolute-or-relative-path>')
  }
  return { appearanceKey: appearanceKey.trim(), outDir: outDir.trim() }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // Minimal atlas JSON compatible with simple loaders.
  const atlas = {
    meta: { app: '@starships/game', kind: 'placeholder', version: 1 },
    frames: {
      idle_down_0: { frame: { x: 0, y: 0, w: 1, h: 1 } },
    },
    animations: {
      idle_down: ['idle_down_0'],
    },
  }

  const outRoot = path.resolve(args.outDir, args.appearanceKey)
  await fs.mkdir(outRoot, { recursive: true })
  await fs.writeFile(path.join(outRoot, 'atlas.json'), JSON.stringify(atlas, null, 2), 'utf8')

  // Write a 1x1 transparent PNG placeholder (valid PNG bytes).
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axq8wAAAABJRU5ErkJggg==',
    'base64'
  )
  await fs.writeFile(path.join(outRoot, 'spritesheet.png'), png)

  // eslint-disable-next-line no-console
  console.log(`Wrote placeholder sprites to ${outRoot}`)
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

