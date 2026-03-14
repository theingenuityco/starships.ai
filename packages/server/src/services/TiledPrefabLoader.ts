import fs from 'fs';
import path from 'path';

export type TiledTileLayer = {
  name: string;
  width: number;
  height: number;
  /** Raw GIDs as exported by Tiled (may include 0). */
  data: number[];
};

export type TiledMapJson = {
  type: 'map';
  orientation?: string;
  infinite?: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: Array<{ type: string; name?: string; width?: number; height?: number; data?: number[] }>;
  tilesets?: Array<{ firstgid: number; tilecount?: number; columns?: number; image?: string }>;
};

export type Prefab = {
  width: number;
  height: number;
  /** Tiled GIDs (0 means empty). */
  props: number[];
  collision: boolean[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function decodeGid(raw: number): { gid: number; flipX: boolean; flipY: boolean; flipD: boolean } {
  // Tiled encodes flips in the high bits of a 32-bit GID.
  const FLIP_H = 0x80000000;
  const FLIP_V = 0x40000000;
  const FLIP_D = 0x20000000;
  const flipX = (raw & FLIP_H) !== 0;
  const flipY = (raw & FLIP_V) !== 0;
  const flipD = (raw & FLIP_D) !== 0;
  const gid = raw & ~(FLIP_H | FLIP_V | FLIP_D);
  return { gid, flipX, flipY, flipD };
}

export class TiledPrefabLoader {
  static loadFromFile(filePath: string): Prefab {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const raw = fs.readFileSync(abs, 'utf8');
    const json = JSON.parse(raw) as unknown;
    if (!isRecord(json)) throw new Error(`[TiledPrefabLoader] Invalid JSON: ${filePath}`);

    const map = json as unknown as TiledMapJson;
    if (map.type !== 'map') throw new Error(`[TiledPrefabLoader] Not a Tiled map JSON: ${filePath}`);
    if (map.orientation && map.orientation !== 'orthogonal') throw new Error(`[TiledPrefabLoader] Only orthogonal supported: ${filePath}`);
    if (map.infinite) throw new Error(`[TiledPrefabLoader] Infinite maps not supported: ${filePath}`);
    if (map.tilewidth !== map.tileheight) throw new Error(`[TiledPrefabLoader] Non-square tiles not supported: ${filePath}`);

    const width = map.width;
    const height = map.height;
    if (!(width > 0 && height > 0)) throw new Error(`[TiledPrefabLoader] Missing width/height: ${filePath}`);

    const firstGid = Array.isArray(map.tilesets) && map.tilesets.length > 0 ? Number(map.tilesets[0].firstgid || 1) : 1;

    const propsLayer = map.layers.find((l) => l && l.type === 'tilelayer' && String(l.name || '').toLowerCase() === 'props');
    const collisionLayer = map.layers.find((l) => l && l.type === 'tilelayer' && String(l.name || '').toLowerCase() === 'collision');
    if (!propsLayer || !Array.isArray(propsLayer.data)) throw new Error(`[TiledPrefabLoader] Missing tile layer 'props': ${filePath}`);
    if (!collisionLayer || !Array.isArray(collisionLayer.data)) throw new Error(`[TiledPrefabLoader] Missing tile layer 'collision': ${filePath}`);

    const expectedLen = width * height;
    if (propsLayer.data.length !== expectedLen) throw new Error(`[TiledPrefabLoader] props.data length mismatch: ${filePath}`);
    if (collisionLayer.data.length !== expectedLen) throw new Error(`[TiledPrefabLoader] collision.data length mismatch: ${filePath}`);

    const props: number[] = new Array(expectedLen);
    const collision: boolean[] = new Array(expectedLen);

    for (let i = 0; i < expectedLen; i++) {
      const pRaw = Number(propsLayer.data[i] || 0);
      const { gid: pGid } = decodeGid(pRaw);
      props[i] = pGid > 0 ? pGid : 0;

      const cRaw = Number(collisionLayer.data[i] || 0);
      const { gid: cGid } = decodeGid(cRaw);
      collision[i] = cGid > 0;
    }

    return { width, height, props, collision };
  }
}

