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
};

export type RoomGameMap = {
  gridSize: number;
  width: number;
  height: number;
  tilesetImageUrl: string;
  layers: RoomGameMapLayer[];
  /** Cell indices that are blocked (y*width + x). */
  collisions: number[];
};

type CacheEntry = { map: RoomGameMap; expiresAtMs: number; collisionSet: Set<number> };

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
      return `variantA:${Math.floor(st.mtimeMs)}:${st.size}`;
    } catch {
      return 'variantA:unknown';
    }
  }

  private mapKey(roomConversationId: string, cacheBuster: string) {
    return `starships:room_game:map:v2:${roomConversationId}:${cacheBuster}`;
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

  private buildDynamicOffice(args: { roomConversationId: string; agentIds: string[] }): RoomGameMap {
    const gridSize = 32;
    const tilesetImageUrl = '/room-game/tilesets/Modern_Office_32x32.png';

    const agentCount = args.agentIds.length;
    const width = clamp(20 + agentCount * 3, 20, 70);
    const height = clamp(14 + Math.ceil(agentCount / 4) * 4, 14, 46);

    // Background gids: wall=1 (tile index 0), floor=45 (tile index 44)
    const GID_WALL = 1;
    const GID_FLOOR = 45;

    const base: number[] = new Array(width * height).fill(0);
    const props: number[] = new Array(width * height).fill(0);
    const collision = new Array<boolean>(width * height).fill(false);

    const idx = (x: number, y: number) => y * width + x;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        base[idx(x, y)] = isBorder ? GID_WALL : GID_FLOOR;
        if (isBorder) collision[idx(x, y)] = true;
      }
    }

    // Place workstation prefabs in rows, leaving walkways.
    const prefabs = this.prefabs ?? [];
    const reserved = new Set<number>();
    for (let i = 0; i < collision.length; i++) if (collision[i]) reserved.add(i);

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
          const gid = p.props[pIdx] || 0;
          const i = idx(ox + px, oy + py);
          if (gid) props[i] = gid;
          if (p.collision[pIdx]) {
            collision[i] = true;
            reserved.add(i);
          }
        }
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
      gridSize,
      width,
      height,
      tilesetImageUrl,
      layers: [
        { name: 'base', data: base },
        { name: 'props', data: props },
      ],
      collisions,
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
        const map = JSON.parse(raw) as RoomGameMap;
        if (map && typeof map.width === 'number' && Array.isArray(map.layers)) {
          const set = new Set<number>(Array.isArray(map.collisions) ? map.collisions : []);
          const entry: CacheEntry = { map, collisionSet: set, expiresAtMs: now + 30_000 };
          this.mem.set(memKey, entry);
          return entry;
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

    const map = this.buildDynamicOffice({ roomConversationId, agentIds });
    const ttlSeconds = typeof opts?.ttlSeconds === 'number' && opts.ttlSeconds > 0 ? Math.floor(opts.ttlSeconds) : 2 * 60 * 60;
    try {
      await this.redis.set(key, JSON.stringify(map), 'EX', ttlSeconds);
    } catch {
      // best-effort
    }

    const set = new Set<number>(map.collisions);
    const entry: CacheEntry = { map, collisionSet: set, expiresAtMs: now + 30_000 };
    this.mem.set(memKey, entry);
    return entry;
  }
}

