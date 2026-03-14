import fs from 'fs';
import path from 'path';

export type TiledTileLayer = {
  name: string;
  width: number;
  height: number;
  /** Raw GIDs as exported by Tiled (may include 0). */
  data: number[];
};

export type TiledGroupLayer = {
  type: 'group';
  name?: string;
  layers?: TiledLayer[];
};

export type TiledObject = {
  id?: number;
  name?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  visible?: boolean;
};

export type TiledObjectGroupLayer = {
  type: 'objectgroup';
  name?: string;
  objects?: TiledObject[];
};

export type TiledLayer =
  | ({ type: 'tilelayer'; name?: string; width?: number; height?: number; data?: number[] } & Partial<TiledTileLayer>)
  | TiledGroupLayer
  | TiledObjectGroupLayer
  | { type: string; name?: string };

export type TiledMapJson = {
  type: 'map';
  orientation?: string;
  infinite?: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets?: Array<{ firstgid: number; tilecount?: number; columns?: number; image?: string }>;
};

export type Prefab = {
  width: number;
  height: number;
  /** Props layers in draw order. Each is a Tiled GID grid (0 means empty). */
  propsLayers: Array<{ name: string; data: number[] }>;
  /** Rasterized collision grid (used for coarse placement checks). */
  collision: boolean[];
  /**
   * Collision rectangles in tile units (x/y/width/height). These come from the Tiled
   * `collision` object layer (preferred) or from a legacy collision tilelayer.
   */
  collisionRects: Array<{ x: number; y: number; width: number; height: number }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function layerNameLower(l: { name?: string } | null | undefined): string {
  return asString(l?.name).toLowerCase();
}

function isTileLayer(l: TiledLayer | undefined): l is Extract<TiledLayer, { type: 'tilelayer' }> {
  return Boolean(l) && typeof l === 'object' && (l as { type?: unknown }).type === 'tilelayer';
}

function isGroupLayer(l: TiledLayer | undefined): l is TiledGroupLayer {
  return Boolean(l) && typeof l === 'object' && (l as { type?: unknown }).type === 'group';
}

function isObjectGroupLayer(l: TiledLayer | undefined): l is TiledObjectGroupLayer {
  return Boolean(l) && typeof l === 'object' && (l as { type?: unknown }).type === 'objectgroup';
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

function collectTileLayersRecursive(layers: TiledLayer[] | undefined, out: Array<Extract<TiledLayer, { type: 'tilelayer' }>>) {
  if (!Array.isArray(layers)) return;
  for (const l of layers) {
    if (isTileLayer(l)) out.push(l);
    else if (isGroupLayer(l)) collectTileLayersRecursive(l.layers, out);
  }
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

    const propsRoot = map.layers.find((l) => layerNameLower(l as { name?: string }) === 'props');
    const collisionRoot = map.layers.find((l) => layerNameLower(l as { name?: string }) === 'collision');

    // Props: accept either a tilelayer named 'props', or a group named 'props' with tilelayers inside.
    const propTileLayers: Array<Extract<TiledLayer, { type: 'tilelayer' }>> = [];
    if (isTileLayer(propsRoot)) propTileLayers.push(propsRoot);
    else if (isGroupLayer(propsRoot)) collectTileLayersRecursive(propsRoot.layers, propTileLayers);
    if (propTileLayers.length === 0) throw new Error(`[TiledPrefabLoader] Missing props tilelayer/group: ${filePath}`);

    const expectedLen = width * height;

    const props: number[] = new Array(expectedLen);
    const collision: boolean[] = new Array(expectedLen);
    const collisionRects: Array<{ x: number; y: number; width: number; height: number }> = [];
    props.fill(0);
    collision.fill(false);

    const propsLayers: Array<{ name: string; data: number[] }> = [];
    for (const l of propTileLayers) {
      if (!Array.isArray(l.data)) throw new Error(`[TiledPrefabLoader] props layer missing data: ${filePath}`);
      if (l.data.length !== expectedLen) throw new Error(`[TiledPrefabLoader] props.data length mismatch: ${filePath}`);
      const decoded = new Array<number>(expectedLen);
      for (let i = 0; i < expectedLen; i++) {
        const rawGid = Number(l.data[i] || 0);
        const { gid } = decodeGid(rawGid);
        decoded[i] = gid > 0 ? gid : 0;
      }
      const nm = asString((l as { name?: unknown }).name) || 'props';
      propsLayers.push({ name: nm, data: decoded });
    }

    // Collision: accept tilelayer (legacy) or objectgroup (preferred).
    if (isTileLayer(collisionRoot)) {
      if (!Array.isArray(collisionRoot.data)) throw new Error(`[TiledPrefabLoader] collision tilelayer missing data: ${filePath}`);
      if (collisionRoot.data.length !== expectedLen) throw new Error(`[TiledPrefabLoader] collision.data length mismatch: ${filePath}`);
      for (let i = 0; i < expectedLen; i++) {
        const rawGid = Number(collisionRoot.data[i] || 0);
        const { gid } = decodeGid(rawGid);
        collision[i] = gid > 0;
      }
      // Convert blocked cells into rects (tile units).
      for (let i = 0; i < expectedLen; i++) {
        if (!collision[i]) continue;
        const x = i % width;
        const y = Math.floor(i / width);
        collisionRects.push({ x, y, width: 1, height: 1 });
      }
    } else if (isObjectGroupLayer(collisionRoot)) {
      const tw = map.tilewidth;
      const th = map.tileheight;
      const objects = Array.isArray(collisionRoot.objects) ? collisionRoot.objects : [];
      for (const o of objects) {
        if (!o || typeof o.x !== 'number' || typeof o.y !== 'number') continue;
        const wPx = typeof o.width === 'number' ? o.width : 0;
        const hPx = typeof o.height === 'number' ? o.height : 0;
        const rx = o.x / tw;
        const ry = o.y / th;
        const rw = wPx / tw;
        const rh = hPx / th;
        if (!(rw > 0 && rh > 0)) continue;
        collisionRects.push({ x: rx, y: ry, width: rw, height: rh });

        // Also rasterize into grid for placement checks (conservative).
        const x0 = Math.floor(rx);
        const y0 = Math.floor(ry);
        const x1 = Math.ceil(rx + rw) - 1;
        const y1 = Math.ceil(ry + rh) - 1;
        const minX = Math.max(0, Math.min(width - 1, x0));
        const minY = Math.max(0, Math.min(height - 1, y0));
        const maxX = Math.max(0, Math.min(width - 1, x1 >= x0 ? x1 : x0));
        const maxY = Math.max(0, Math.min(height - 1, y1 >= y0 ? y1 : y0));
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) collision[y * width + x] = true;
        }
      }
    } else {
      throw new Error(`[TiledPrefabLoader] Missing collision tilelayer/objectgroup: ${filePath}`);
    }

    return { width, height, propsLayers, collision, collisionRects };
  }
}

