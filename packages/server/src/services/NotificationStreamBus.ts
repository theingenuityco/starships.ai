import Redis, { type Redis as RedisClient } from 'ioredis';
import { getEnvConfig } from '@starships/env';

export type NotificationStreamEvent =
  | { type: 'snapshot'; data: any }
  | { type: 'notification.append'; data: any }
  | { type: 'notification.state'; data: any };

type PublishResult = { streamId: string };

/**
 * Redis Streams–backed per-user notification bus.
 *
 * Mirrors ConversationStreamBus patterns (separate reader connection, bounded retention).
 */
export class NotificationStreamBus {
  private static instance: NotificationStreamBus | null = null;
  private readonly redis: RedisClient;

  private constructor(redis: RedisClient) {
    this.redis = redis;
  }

  static getInstance(): NotificationStreamBus {
    if (NotificationStreamBus.instance) return NotificationStreamBus.instance;
    const env = getEnvConfig();
    if (!env.REDIS_HOST) throw new Error('[NotificationStreamBus] REDIS_HOST is required for streaming.');
    const redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT ?? 6379,
      password: typeof env.REDIS_PASSWORD === 'string' ? env.REDIS_PASSWORD : undefined,
      db: typeof env.REDIS_DB === 'number' ? env.REDIS_DB : 0,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    NotificationStreamBus.instance = new NotificationStreamBus(redis);
    return NotificationStreamBus.instance;
  }

  streamKey(starshipId: string, userId: string): string {
    return `starships:stream:notifications:${starshipId}:${userId}`;
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

  async publish(starshipId: string, userId: string, evt: NotificationStreamEvent, opts?: { maxLenApprox?: number }): Promise<PublishResult> {
    const key = this.streamKey(starshipId, userId);
    const maxLen = typeof opts?.maxLenApprox === 'number' && opts.maxLenApprox > 0 ? Math.floor(opts.maxLenApprox) : 20_000;
    const payload = JSON.stringify(evt);
    const raw = await this.redis.call('XADD', key, 'MAXLEN', '~', String(maxLen), '*', 'evt', payload);
    const streamId = NotificationStreamBus.toStringSafe(raw);
    if (!streamId) throw new Error('[NotificationStreamBus] XADD returned empty stream id');
    return { streamId };
  }

  async getLastId(starshipId: string, userId: string): Promise<string | null> {
    const key = this.streamKey(starshipId, userId);
    try {
      const raw = await this.redis.call('XREVRANGE', key, '+', '-', 'COUNT', '1');
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const first = raw[0];
      if (!Array.isArray(first) || first.length < 1) return null;
      const id = NotificationStreamBus.toStringSafe(first[0]);
      return id || null;
    } catch {
      return null;
    }
  }

  async getLen(starshipId: string, userId: string): Promise<number> {
    const key = this.streamKey(starshipId, userId);
    try {
      const n = await this.redis.call('XLEN', key);
      const num = typeof n === 'number' ? n : Number(NotificationStreamBus.toStringSafe(n));
      return Number.isFinite(num) ? num : 0;
    } catch {
      return 0;
    }
  }

  async read(
    starshipId: string,
    userId: string,
    cursor: string,
    opts?: { blockMs?: number; count?: number },
    redisOverride?: RedisClient
  ): Promise<Array<{ id: string; evt: NotificationStreamEvent }>> {
    const key = this.streamKey(starshipId, userId);
    const blockMs = typeof opts?.blockMs === 'number' && opts.blockMs >= 0 ? opts.blockMs : 25_000;
    const count = typeof opts?.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 200;
    let raw: unknown;
    try {
      const client = redisOverride ?? this.redis;
      raw = await client.call('XREAD', 'BLOCK', String(blockMs), 'COUNT', String(count), 'STREAMS', key, cursor);
    } catch (e) {
      if (redisOverride && e instanceof Error && /connection is closed/i.test(e.message)) return [];
      return [];
    }
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const out: Array<{ id: string; evt: NotificationStreamEvent }> = [];
    for (const streamItem of raw) {
      if (!Array.isArray(streamItem) || streamItem.length < 2) continue;
      const entries = streamItem[1];
      if (!Array.isArray(entries) || entries.length === 0) continue;
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const id = NotificationStreamBus.toStringSafe(entry[0]);
        const kvAny = entry[1];
        if (!id || !Array.isArray(kvAny)) continue;
        const kv = kvAny.map((v: unknown) => NotificationStreamBus.toStringSafe(v));
        const idx = kv.findIndex((x) => x === 'evt');
        const payload = idx >= 0 ? kv[idx + 1] : '';
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload) as NotificationStreamEvent;
          if (!evt || typeof (evt as any).type !== 'string') continue;
          out.push({ id, evt });
        } catch {
          /* ignore */
        }
      }
    }
    return out;
  }
}

