import Redis, { type Redis as RedisClient } from 'ioredis';
import { getEnvConfig } from '@starships/env';

export type RoomGameStreamEvent = { type: string; data: unknown };

type PublishResult = { streamId: string };

/**
 * Redis Streams–backed room game event bus (keyed by roomConversationId).
 *
 * Mirrors ViewStreamBus / ConversationStreamBus patterns:
 * - cross-pod replay (ALB no-stickiness safe)
 * - ordered delivery via Redis stream IDs
 * - bounded retention via XTRIM MAXLEN (~)
 * - dedicated reader connection for XREAD BLOCK
 */
export class RoomGameStreamBus {
  private static instance: RoomGameStreamBus | null = null;
  private readonly redis: RedisClient;

  private constructor(redis: RedisClient) {
    this.redis = redis;
  }

  static getInstance(): RoomGameStreamBus {
    if (RoomGameStreamBus.instance) return RoomGameStreamBus.instance;
    const env = getEnvConfig();
    if (!env.REDIS_HOST) {
      throw new Error('[RoomGameStreamBus] REDIS_HOST is required for streaming.');
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
    RoomGameStreamBus.instance = new RoomGameStreamBus(redis);
    return RoomGameStreamBus.instance;
  }

  streamKey(roomConversationId: string): string {
    return `starships:stream:room_game:${roomConversationId}`;
  }

  createReaderClient(): RedisClient {
    return this.redis.duplicate();
  }

  private static toStringSafe(v: unknown): string {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') {
      const rec = v as Record<string, unknown>;
      if (rec.type === 'Buffer' && Array.isArray(rec.data) && rec.data.every((n) => typeof n === 'number')) {
        try {
          return Buffer.from(rec.data as number[]).toString('utf8');
        } catch {
          return '';
        }
      }
    }
    try {
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return v.toString('utf8');
    } catch {
      /* ignore */
    }
    return v == null ? '' : String(v);
  }

  async publish(roomConversationId: string, evt: RoomGameStreamEvent, opts?: { maxLenApprox?: number }): Promise<PublishResult> {
    const key = this.streamKey(roomConversationId);
    const maxLen = typeof opts?.maxLenApprox === 'number' && opts.maxLenApprox > 0 ? Math.floor(opts.maxLenApprox) : 20_000;
    const payload = JSON.stringify(evt);
    const raw = await this.redis.call('XADD', key, 'MAXLEN', '~', String(maxLen), '*', 'evt', payload);
    const streamId = RoomGameStreamBus.toStringSafe(raw);
    if (!streamId) throw new Error('[RoomGameStreamBus] XADD returned empty stream id');
    return { streamId };
  }

  async getLastId(roomConversationId: string): Promise<string | null> {
    const key = this.streamKey(roomConversationId);
    try {
      const raw = await this.redis.call('XREVRANGE', key, '+', '-', 'COUNT', '1');
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const first = raw[0];
      if (!Array.isArray(first) || first.length < 1) return null;
      const id = RoomGameStreamBus.toStringSafe(first[0]);
      return id || null;
    } catch {
      return null;
    }
  }

  async read(
    roomConversationId: string,
    cursor: string,
    opts?: { blockMs?: number; count?: number },
    redisOverride?: RedisClient
  ): Promise<Array<{ id: string; evt: RoomGameStreamEvent }>> {
    const key = this.streamKey(roomConversationId);
    const blockMs = typeof opts?.blockMs === 'number' && opts.blockMs >= 0 ? opts.blockMs : 25_000;
    const count = typeof opts?.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 200;

    let raw: unknown;
    try {
      const client = redisOverride ?? this.redis;
      raw = await client.call('XREAD', 'BLOCK', String(blockMs), 'COUNT', String(count), 'STREAMS', key, cursor);
    } catch (e) {
      if (redisOverride && e instanceof Error && /connection is closed/i.test(e.message)) {
        return [];
      }
      return [];
    }
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const out: Array<{ id: string; evt: RoomGameStreamEvent }> = [];
    for (const streamItem of raw) {
      if (!Array.isArray(streamItem) || streamItem.length < 2) continue;
      const entries = streamItem[1];
      if (!Array.isArray(entries) || entries.length === 0) continue;

      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const id = RoomGameStreamBus.toStringSafe(entry[0]);
        const kvAny = entry[1];
        if (!id || !Array.isArray(kvAny)) continue;

        const kv = kvAny.map((v: unknown) => RoomGameStreamBus.toStringSafe(v));
        const idx = kv.findIndex((x) => x === 'evt');
        const payload = idx >= 0 ? kv[idx + 1] : '';
        if (!payload) continue;

        try {
          const evt = JSON.parse(payload) as RoomGameStreamEvent;
          if (!evt || typeof (evt as { type?: unknown }).type !== 'string') continue;
          out.push({ id, evt });
        } catch {
          continue;
        }
      }
    }

    return out;
  }
}

