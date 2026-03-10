import { cyrb53 } from '@/lib/hash'

export type ProcgenRoomTile = 0 | 1 | 2
// 0 = floor, 1 = wall, 2 = obstacle

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateTopDownRoom(args: { seed: string; width: number; height: number }): ProcgenRoomTile[][] {
  const width = Math.max(8, Math.min(200, Math.floor(args.width)))
  const height = Math.max(8, Math.min(200, Math.floor(args.height)))
  const seedNum = cyrb53(String(args.seed || '').trim() || 'seed', 9) >>> 0
  const rnd = mulberry32(seedNum)

  const grid: ProcgenRoomTile[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => 0 as ProcgenRoomTile))

  // Border walls
  for (let x = 0; x < width; x++) {
    grid[0][x] = 1
    grid[height - 1][x] = 1
  }
  for (let y = 0; y < height; y++) {
    grid[y][0] = 1
    grid[y][width - 1] = 1
  }

  // A few rectangular rooms carved into a solid-ish field (very simple)
  const roomCount = 4 + Math.floor(rnd() * 5)
  for (let i = 0; i < roomCount; i++) {
    const rw = 4 + Math.floor(rnd() * 10)
    const rh = 4 + Math.floor(rnd() * 10)
    const rx = 1 + Math.floor(rnd() * (width - rw - 2))
    const ry = 1 + Math.floor(rnd() * (height - rh - 2))
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (x === rx || x === rx + rw - 1 || y === ry || y === ry + rh - 1) grid[y][x] = 1
        else grid[y][x] = 0
      }
    }
  }

  // Sprinkle obstacles
  const obstacleCount = Math.floor((width * height) * 0.05)
  for (let i = 0; i < obstacleCount; i++) {
    const x = 1 + Math.floor(rnd() * (width - 2))
    const y = 1 + Math.floor(rnd() * (height - 2))
    if (grid[y][x] === 0) grid[y][x] = 2
  }

  return grid
}

