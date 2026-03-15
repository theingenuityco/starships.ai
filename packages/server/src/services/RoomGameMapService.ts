import Redis, { type Redis as RedisClient } from 'ioredis';
import { getEnvConfig } from '@starships/env';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { TiledPrefabLoader, type Prefab } from '@/services/TiledPrefabLoader';

export type RoomGameMapLayer = {
  name: string;
  /** Tiled GIDs (0 = empty). Length = width * height */
  data: number[];
  /** Optional tileset image URL override for this layer. */
  tilesetImageUrl?: string;
};

export type RoomGameMap = {
  gridSize: number;
  width: number;
  height: number;
  tilesetImageUrl: string;
  layers: RoomGameMapLayer[];
  /** Cell indices that are blocked (y*width + x). */
  collisions: number[];
  /** Optional precise collision rectangles (tile units), for debugging/visualization. */
  collisionRects?: CollisionRect[];
};

type CollisionRect = { x: number; y: number; width: number; height: number };
type CacheEntry = { map: RoomGameMap; expiresAtMs: number; collisionSet: Set<number>; collisionRects: CollisionRect[] };
type StoredCacheJson = { map: RoomGameMap; collisionRects: CollisionRect[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function shaInt(input: string): number {
  const hex = crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16) >>> 0;
}

export class RoomGameMapService {
  private static instance: RoomGameMapService | null = null;
  private readonly redis: RedisClient;
  private readonly mem: Map<string, CacheEntry> = new Map();

  private prefabs: Prefab[] | null = null;
  private palette: null | {
    floor: number;
    backTopLeft: number;
    backTop: number;
    backTopRight: number;
    backBottomLeft: number;
    backBottom: number;
    backBottomRight: number;
    left: number;
    right: number;
    bottomLeft: number;
    bottom: number;
    bottomRight: number;
  } = null;
  private paletteSig: string | null = null;
  private static readonly MAP_CACHE_VERSION = 'v6_no_floor_under_walls_1';

  private constructor(redis: RedisClient) {
    this.redis = redis;
  }

  static getInstance(): RoomGameMapService {
    if (RoomGameMapService.instance) return RoomGameMapService.instance;
    const env = getEnvConfig();
    if (!env.REDIS_HOST) {
      throw new Error('[RoomGameMapService] REDIS_HOST is required for room game map.');
    }
    const redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT ?? 6379,
      password: typeof env.REDIS_PASSWORD === 'string' ? env.REDIS_PASSWORD : undefined,
      db: typeof env.REDIS_DB === 'number' ? env.REDIS_DB : 0,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    RoomGameMapService.instance = new RoomGameMapService(redis);
    return RoomGameMapService.instance;
  }

  private prefabCacheBuster(repoRoot: string): string {
    // We iterate on prefab shape/layout frequently in dev; include a cheap signature
    // so Redis/mem caches invalidate when the prefab file changes.
    try {
      const p = path.join(repoRoot, 'packages/game/assets/room-game/prefabs/workstations/variantA.tmj');
      const st = fs.statSync(p);
      const pal = path.join(repoRoot, 'packages/game/assets/room-game/prefabs/palettes/dynamic_office_walls_floor.tmj');
      const stPal = fs.statSync(pal);
      return `${RoomGameMapService.MAP_CACHE_VERSION}:variantA:${Math.floor(st.mtimeMs)}:${st.size}:palette:${Math.floor(stPal.mtimeMs)}:${stPal.size}`;
    } catch {
      return `${RoomGameMapService.MAP_CACHE_VERSION}:variantA:unknown`;
    }
  }

  private mapKey(roomConversationId: string, cacheBuster: string) {
    return `starships:room_game:map:${RoomGameMapService.MAP_CACHE_VERSION}:${roomConversationId}:${cacheBuster}`;
  }

  private static findRepoRoot(): string {
    const candidates = [
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(process.cwd(), '..', '..'),
      path.resolve(process.cwd(), '..', '..', '..'),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(path.join(c, 'pnpm-workspace.yaml'))) return c;
      } catch {
        // ignore
      }
    }
    // Fallback: assume monorepo root is 2 levels up from packages/server when running there.
    return path.resolve(process.cwd(), '..', '..');
  }

  private async loadPrefabs(): Promise<Prefab[]> {
    if (this.prefabs) return this.prefabs;
    const repoRoot = RoomGameMapService.findRepoRoot();
    const base = path.join(repoRoot, 'packages/game/assets/room-game/prefabs/workstations');
    // Temporarily lock to variant A while we iterate on the prefab format/layout.
    const prefabs = [TiledPrefabLoader.loadFromFile(path.join(base, 'variantA.tmj'))];
    this.prefabs = prefabs;
    return prefabs;
  }

  private static decodeTiledGid(raw: number): number {
    const FLIP_H = 0x80000000;
    const FLIP_V = 0x40000000;
    const FLIP_D = 0x20000000;
    return raw & ~(FLIP_H | FLIP_V | FLIP_D);
  }

  private static palettePath(repoRoot: string) {
    return path.join(repoRoot, 'packages/game/assets/room-game/prefabs/palettes/dynamic_office_walls_floor.tmj');
  }

  private paletteSignature(repoRoot: string): string {
    try {
      const st = fs.statSync(RoomGameMapService.palettePath(repoRoot));
      return `palette:${Math.floor(st.mtimeMs)}:${st.size}`;
    } catch {
      return 'palette:missing';
    }
  }

  private async loadPalette(repoRoot: string): Promise<NonNullable<RoomGameMapService['palette']>> {
    const sig = this.paletteSignature(repoRoot);
    if (this.palette && this.paletteSig === sig) return this.palette;

    const palettePath = RoomGameMapService.palettePath(repoRoot);
    const raw = fs.readFileSync(palettePath, 'utf8');
    const json = JSON.parse(raw) as unknown;
    if (!isRecord(json)) throw new Error('[RoomGameMapService] Palette JSON invalid');
    const width = Number(json.width);
    const height = Number(json.height);
    if (width !== 3 || height !== 4) throw new Error('[RoomGameMapService] Palette must be 3x4');
    const layers = json.layers as unknown as Array<{ type?: unknown; name?: unknown; data?: unknown }>;
    if (!Array.isArray(layers)) throw new Error('[RoomGameMapService] Palette missing layers');
    const floorLayer = layers.find((l) => String(l?.name || '').toLowerCase() === 'floor' && l?.type === 'tilelayer');
    const wallsLayer = layers.find((l) => String(l?.name || '').toLowerCase() === 'walls' && l?.type === 'tilelayer');
    if (!floorLayer || !Array.isArray(floorLayer.data)) throw new Error('[RoomGameMapService] Palette missing floor tilelayer');
    if (!wallsLayer || !Array.isArray(wallsLayer.data)) throw new Error('[RoomGameMapService] Palette missing walls tilelayer');
    const floorData = floorLayer.data.map((n) => RoomGameMapService.decodeTiledGid(Number(n || 0)));
    const wallsData = wallsLayer.data.map((n) => RoomGameMapService.decodeTiledGid(Number(n || 0)));
    if (floorData.length !== 12 || wallsData.length !== 12) throw new Error('[RoomGameMapService] Palette layers must be 3x4');

    const at = (arr: number[], x: number, y: number) => arr[y * 3 + x] || 0;

    const firstNonZero = (arr: number[]) => arr.find((n) => Number(n) > 0) || 0;

    const palette = {
      // floor: use the first non-zero tile in the `floor` layer so it's easy to edit in Tiled
      floor: firstNonZero(floorData),
      // back wall is 2 tiles tall (rows 0 and 1)
      backTopLeft: at(wallsData, 0, 0),
      backTop: at(wallsData, 1, 0),
      backTopRight: at(wallsData, 2, 0),
      backBottomLeft: at(wallsData, 0, 1),
      backBottom: at(wallsData, 1, 1),
      backBottomRight: at(wallsData, 2, 1),
      // side walls (row 2)
      left: at(wallsData, 0, 2),
      right: at(wallsData, 2, 2),
      // bottom wall (row 3)
      bottomLeft: at(wallsData, 0, 3),
      bottom: at(wallsData, 1, 3),
      bottomRight: at(wallsData, 2, 3),
    };

    if (!(palette.floor > 0)) throw new Error('[RoomGameMapService] Palette floor gid must be non-zero');
    for (const [k, v] of Object.entries(palette)) {
      if (k === 'floor') continue;
      if (!(v > 0)) throw new Error(`[RoomGameMapService] Palette wall gid missing: ${k}`);
    }

    this.palette = palette;
    this.paletteSig = sig;
    return palette;
  }

  private buildDynamicOffice(args: { roomConversationId: string; agentIds: string[] }): {
    map: RoomGameMap;
    collisionRects: CollisionRect[];
  } {
    const gridSize = 32;
    const tilesetImageUrl = '/room-game/tilesets/Room_Builder_32x32.png';
    const propsTilesetImageUrl = '/room-game/tilesets/Modern_Office_32x32.png';

    const agentCount = args.agentIds.length;
    const width = clamp(20 + agentCount * 3, 20, 70);
    const height = clamp(14 + Math.ceil(agentCount / 4) * 4, 14, 46);

    // Palette is loaded from a small Tiled-authored .tmj (editable in Tiled).
    const pal = this.palette ?? {
      // Default floor tile for Room Builder; should be overridden via palette .tmj.
      floor: 266,
      backTopLeft: 71,
      backTop: 72,
      backTopRight: 73,
      backBottomLeft: 71,
      backBottom: 72,
      backBottomRight: 73,
      left: 89,
      right: 87,
      bottomLeft: 545,
      bottom: 435,
      bottomRight: 546,
    };

    const base: number[] = new Array(width * height).fill(pal.floor);
    const walls: number[] = new Array(width * height).fill(0);
    const collision = new Array<boolean>(width * height).fill(false);
    const collisionRects: CollisionRect[] = [];

    const idx = (x: number, y: number) => y * width + x;

    const backWallHeight = 2;

    // Walls (visual) + border collisions (gameplay).
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isBackWall = y >= 0 && y < backWallHeight;
        const isBorder = x === 0 || isBackWall || x === width - 1 || y === height - 1;
        if (!isBorder) continue;
        collision[idx(x, y)] = true;

        if (y === 0) {
          walls[idx(x, y)] = x === 0 ? pal.backTopLeft : x === width - 1 ? pal.backTopRight : pal.backTop;
        } else if (y === 1) {
          walls[idx(x, y)] = x === 0 ? pal.backBottomLeft : x === width - 1 ? pal.backBottomRight : pal.backBottom;
        } else if (y === height - 1) {
          walls[idx(x, y)] = x === 0 ? pal.bottomLeft : x === width - 1 ? pal.bottomRight : pal.bottom;
        } else if (x === 0) {
          walls[idx(x, y)] = pal.left;
        } else if (x === width - 1) {
          walls[idx(x, y)] = pal.right;
        }
      }
    }
    // Do not render floor underneath walls (prevents floor showing through
    // in transparent wall tiles / trims).
    for (let i = 0; i < walls.length; i++) {
      if (walls[i] > 0) base[i] = 0;
    }
    // Border collision as rectangles (tile units) for precise movement checks.
    collisionRects.push(
      { x: 0, y: 0, width, height: backWallHeight },
      { x: 0, y: height - 1, width, height: 1 },
      { x: 0, y: 0, width: 1, height },
      { x: width - 1, y: 0, width: 1, height }
    );

    // Place workstation prefabs in rows, leaving walkways.
    const prefabs = this.prefabs ?? [];
    const firstPrefab = prefabs.length ? prefabs[0] : null;
    const propsLayers: RoomGameMapLayer[] = (firstPrefab?.propsLayers || []).map((l) => ({
      name: l.name || 'props',
      data: new Array(width * height).fill(0),
      tilesetImageUrl: propsTilesetImageUrl,
    }));
    const reserved = new Set<number>();
    for (let i = 0; i < collision.length; i++) if (collision[i]) reserved.add(i);

    const markRectCells = (r: CollisionRect) => {
      const x0 = Math.floor(r.x);
      const y0 = Math.floor(r.y);
      const x1 = Math.ceil(r.x + r.width) - 1;
      const y1 = Math.ceil(r.y + r.height) - 1;
      const minX = Math.max(0, Math.min(width - 1, x0));
      const minY = Math.max(0, Math.min(height - 1, y0));
      const maxX = Math.max(0, Math.min(width - 1, x1 >= x0 ? x1 : x0));
      const maxY = Math.max(0, Math.min(height - 1, y1 >= y0 ? y1 : y0));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          collision[idx(x, y)] = true;
          reserved.add(idx(x, y));
        }
      }
    };

    const placePrefab = (p: Prefab, ox: number, oy: number) => {
      // bounds check
      if (ox < 1 || oy < 1) return false;
      if (ox + p.width >= width - 1) return false;
      if (oy + p.height >= height - 1) return false;
      // overlap check
      for (let py = 0; py < p.height; py++) {
        for (let px = 0; px < p.width; px++) {
          const i = idx(ox + px, oy + py);
          if (p.collision[py * p.width + px] && reserved.has(i)) return false;
        }
      }
      // write
      for (let py = 0; py < p.height; py++) {
        for (let px = 0; px < p.width; px++) {
          const pIdx = py * p.width + px;
          const i = idx(ox + px, oy + py);
          for (let li = 0; li < propsLayers.length; li++) {
            const layer = propsLayers[li];
            const src = p.propsLayers[li];
            if (!src) continue;
            const gid = src.data[pIdx] || 0;
            if (gid) layer.data[i] = gid;
          }
          // Collision grid for placement checks (legacy/conservative).
          if (p.collision[pIdx]) {
            collision[i] = true;
            reserved.add(i);
          }
        }
      }
      // Precise collision rectangles (tile units) for movement checks.
      for (const r of Array.isArray(p.collisionRects) ? p.collisionRects : []) {
        const world: CollisionRect = { x: ox + r.x, y: oy + r.y, width: r.width, height: r.height };
        collisionRects.push(world);
        markRectCells(world); // keep debug/compat collision indices roughly in sync
      }
      return true;
    };

    // Candidate placement grid
    const startX = 2;
    const startY = 2;
    const stepX = 8;
    const stepY = 6;

    const candidates: Array<{ x: number; y: number }> = [];
    for (let y = startY; y < height - 8; y += stepY) {
      for (let x = startX; x < width - 8; x += stepX) {
        candidates.push({ x, y });
      }
    }

    const prefabsSafe = prefabs.length ? prefabs : [];
    let candIdx = 0;
    for (const agentId of args.agentIds) {
      if (!prefabsSafe.length) break;
      const prefab = prefabsSafe[0];
      let placed = false;
      for (let tries = 0; tries < candidates.length; tries++) {
        const c = candidates[(candIdx + tries) % candidates.length];
        if (placePrefab(prefab, c.x, c.y)) {
          candIdx = (candIdx + tries + 1) % candidates.length;
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }

    const collisions: number[] = [];
    for (let i = 0; i < collision.length; i++) if (collision[i]) collisions.push(i);

    return {
      map: {
        gridSize,
        width,
        height,
        tilesetImageUrl,
        layers: [{ name: 'base', data: base }, { name: 'walls', data: walls }, ...propsLayers],
        collisions,
        collisionRects,
      },
      collisionRects,
    };
  }

  async getOrBuild(roomConversationId: string, agentIds: string[], opts?: { ttlSeconds?: number }): Promise<CacheEntry> {
    const now = Date.now();
    const repoRoot = RoomGameMapService.findRepoRoot();
    const cacheBuster = this.prefabCacheBuster(repoRoot);
    const memKey = `${roomConversationId}:${cacheBuster}`;

    const cached = this.mem.get(memKey);
    if (cached && cached.expiresAtMs > now) return cached;

    const key = this.mapKey(roomConversationId, cacheBuster);
    try {
      const raw = await this.redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isRecord(parsed) && 'map' in parsed && 'collisionRects' in parsed) {
          const maybeMap = (parsed as { map?: unknown }).map;
          const maybeRects = (parsed as { collisionRects?: unknown }).collisionRects;
          if (isRecord(maybeMap) && Array.isArray((maybeMap as { layers?: unknown }).layers) && Array.isArray(maybeRects)) {
            const map = maybeMap as RoomGameMap;
            const rects = maybeRects as CollisionRect[];
            const set = new Set<number>(Array.isArray(map.collisions) ? map.collisions : []);
            const entry: CacheEntry = { map, collisionRects: rects, collisionSet: set, expiresAtMs: now + 30_000 };
            this.mem.set(memKey, entry);
            return entry;
          }
        }
      }
    } catch {
      // ignore
    }

    if (!this.prefabs) {
      try {
        this.prefabs = await this.loadPrefabs();
      } catch {
        this.prefabs = [];
      }
    }
    try {
      this.palette = await this.loadPalette(repoRoot);
    } catch {
      // Keep fallback palette.
      this.palette = null;
      this.paletteSig = null;
    }

    // Build map + collision rects (kept in-memory alongside the map).
    // Note: map.collisions is still a rasterized view for debug/client overlay.
    const built = this.buildDynamicOffice({ roomConversationId, agentIds });
    const ttlSeconds = typeof opts?.ttlSeconds === 'number' && opts.ttlSeconds > 0 ? Math.floor(opts.ttlSeconds) : 2 * 60 * 60;
    try {
      const stored: StoredCacheJson = { map: built.map, collisionRects: built.collisionRects };
      await this.redis.set(key, JSON.stringify(stored), 'EX', ttlSeconds);
    } catch {
      // best-effort
    }

    const set = new Set<number>(built.map.collisions);
    const entry: CacheEntry = {
      map: built.map,
      collisionRects: built.collisionRects,
      collisionSet: set,
      expiresAtMs: now + 30_000,
    };
    this.mem.set(memKey, entry);
    return entry;
  }
}
